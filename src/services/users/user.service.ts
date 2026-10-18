import crypto from 'node:crypto';
import {
  userRepository,
  type UserWithDetails,
  type PaginatedUsersResult,
} from '../../repositories/user.repository';
import { roleRepository } from '../../repositories/role.repository';
import { administrativeUnitRepository } from '../../repositories/administrative-unit.repository';
import { permissionService } from '../authorization/permission.service';
import { authorizationService } from '../authorization/authorization.service';
import { scopeService } from '../authorization/scope.service';
import { passwordService } from '../auth/password.service';
import { userRoleService } from './user-role.service';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../types/errors';
import type {
  CreateUserInput,
  ListUsersQuery,
  UpdateUserInput,
} from '../../validators/users';

export interface CreateUserResult {
  user: UserWithDetails;
  temporaryPassword?: string;
}

/**
 * Service managing user lifecycle, scope-restricted queries, and hierarchical administration.
 */
export class UserService {
  /**
   * Generates a secure, cryptographically random temporary password.
   */
  private generateTemporaryPassword(): string {
    const randomChars = crypto.randomBytes(9).toString('base64url');
    return `Nlams!${randomChars}9`;
  }

  /**
   * Lists users visible to the actor within their authorized administrative scope.
   */
  async listUsers(
    actorUserId: string,
    query: ListUsersQuery
  ): Promise<PaginatedUsersResult> {
    await permissionService.requirePermission(actorUserId, 'USER_VIEW');

    const isSuperAdmin = await permissionService.isSuperAdmin(actorUserId);

    let allowedUnitIds: string[] | undefined = undefined;

    if (!isSuperAdmin) {
      const assignedUnits = await scopeService.getUserAssignedUnits(actorUserId);
      if (assignedUnits.length === 0) {
        return {
          users: [],
          total: 0,
          page: query.page,
          limit: query.limit,
          totalPages: 0,
        };
      }

      const allDescendantSets = await Promise.all(
        assignedUnits.map((u) => administrativeUnitRepository.getDescendantUnitIds(u.id))
      );

      const uniqueUnitIds = new Set<string>();
      for (const set of allDescendantSets) {
        for (const id of set) {
          uniqueUnitIds.add(id);
        }
      }

      allowedUnitIds = Array.from(uniqueUnitIds);

      // If actor specified an administrativeUnitId filter, verify it is within their scope
      if (query.administrativeUnitId) {
        if (!uniqueUnitIds.has(query.administrativeUnitId)) {
          throw new ForbiddenError(
            'Forbidden: requested administrative unit is outside your authorized scope'
          );
        }
      }
    }

    return userRepository.listUsers({
      allowedUnitIds,
      search: query.search,
      status: query.status,
      roleId: query.roleId,
      administrativeUnitId: query.administrativeUnitId,
      page: query.page,
      limit: query.limit,
    });
  }

  /**
   * Retrieves full details for a specific user, strictly enforcing scope accessibility.
   */
  async getUserDetails(
    actorUserId: string,
    targetUserId: string
  ): Promise<UserWithDetails> {
    await permissionService.requirePermission(actorUserId, 'USER_VIEW');

    const targetUser = await userRepository.findUserDetailsById(targetUserId);
    if (!targetUser) {
      throw new NotFoundError('User not found');
    }

    const isSuperAdmin = await permissionService.isSuperAdmin(actorUserId);
    if (isSuperAdmin || actorUserId === targetUserId) {
      return targetUser;
    }

    // Verify target user is within actor's administrative scope
    // Target user must have at least one active assignment within actor's scope
    const activeAssignments = targetUser.assignments.filter((a) => a.status === 'ACTIVE');
    if (activeAssignments.length === 0) {
      // Unassigned users outside self or super-admin are inaccessible
      throw new NotFoundError('User not found');
    }

    let isVisible = false;
    for (const assignment of activeAssignments) {
      const inScope = await scopeService.isWithinAdministrativeScope(
        actorUserId,
        assignment.administrativeUnitId
      );
      if (inScope) {
        isVisible = true;
        break;
      }
    }

    if (!isVisible) {
      // Follow information-disclosure policy: return 404 for out-of-scope IDs
      throw new NotFoundError('User not found');
    }

    return targetUser;
  }

  /**
   * Creates a new user with an initial role and administrative unit assignment.
   * Atomically executes in a database transaction with complete authority validation.
   */
  async createUser(
    actorUserId: string,
    input: CreateUserInput
  ): Promise<CreateUserResult> {
    // 1. Permission checks
    await permissionService.requirePermission(actorUserId, 'USER_CREATE');
    await permissionService.requirePermission(actorUserId, 'ROLE_ASSIGN');
    await permissionService.requirePermission(actorUserId, 'USER_ASSIGN');

    // 2. Email uniqueness check
    const emailTaken = await userRepository.isEmailTaken(input.email);
    if (emailTaken) {
      throw new ConflictError(
        'A user with this email address already exists in the system'
      );
    }

    // 3. Administrative unit validation & scope check
    const unit = await administrativeUnitRepository.getAdministrativeUnitById(
      input.administrativeUnitId
    );
    if (!unit) {
      throw new NotFoundError('Target administrative unit not found');
    }
    if (!unit.isActive) {
      throw new BadRequestError('Cannot assign user to an inactive administrative unit');
    }

    await scopeService.requireAdministrativeScope(
      actorUserId,
      input.administrativeUnitId
    );

    // 4. Role validation & delegation check
    const role = await roleRepository.findRoleById(input.roleId);
    if (!role) {
      throw new NotFoundError('Target role not found');
    }

    const canDelegate = await userRoleService.canDelegateRole(actorUserId, role.name);
    if (!canDelegate) {
      throw new ForbiddenError(
        `Forbidden: you are not authorized to assign the '${role.name}' role`
      );
    }

    // 5. Password handling
    let initialPassword = input.password?.trim();
    let wasGenerated = false;

    if (!initialPassword) {
      initialPassword = this.generateTemporaryPassword();
      wasGenerated = true;
    }

    const passwordHash = await passwordService.hashPassword(initialPassword);

    // 6. Create user atomically
    const createdUser = await userRepository.createUserWithInitialAssignment({
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash,
      status: 'ACTIVE',
      roleId: input.roleId,
      administrativeUnitId: input.administrativeUnitId,
      assignedBy: actorUserId,
    });

    return {
      user: createdUser,
      temporaryPassword: wasGenerated ? initialPassword : undefined,
    };
  }

  /**
   * Updates permitted user profile fields (name, phone, status).
   * Rejects unauthorized privilege elevation and out-of-scope edits.
   */
  async updateUser(
    actorUserId: string,
    targetUserId: string,
    input: UpdateUserInput
  ): Promise<UserWithDetails> {
    await permissionService.requirePermission(actorUserId, 'USER_UPDATE');

    const targetUser = await userRepository.findUserDetailsById(targetUserId);
    if (!targetUser) {
      throw new NotFoundError('Target user not found');
    }

    // 1. Explicitly reject any attempts to modify personal information
    const rawInput = input as Record<string, unknown>;
    if (
      rawInput.name !== undefined ||
      rawInput.email !== undefined ||
      rawInput.phone !== undefined
    ) {
      throw new BadRequestError(
        'Personal information (name, email, phone) cannot be modified after account creation'
      );
    }

    // 2. Prevent self-modification
    if (actorUserId === targetUserId) {
      throw new ForbiddenError(
        'Forbidden: self-modification of account attributes is not permitted'
      );
    }

    // 3. Must have authority to manage target user
    await authorizationService.requireCanManageUser(actorUserId, targetUserId, {
      requiredPermission: 'USER_UPDATE',
    });


    // Protect last Super Admin from being deactivated or suspended
    if (input.status && input.status !== 'ACTIVE') {
      const isTargetSuperAdmin = targetUser.roles.some((r) => r.name === 'SUPER_ADMIN');
      if (isTargetSuperAdmin) {
        const superAdminCount = await roleRepository.countSuperAdmins();
        if (superAdminCount <= 1) {
          throw new BadRequestError(
            'Cannot deactivate: the system must have at least one active SUPER_ADMIN'
          );
        }
      }
    }

    await userRepository.updateUser(targetUserId, input);

    const updated = await userRepository.findUserDetailsById(targetUserId);
    if (!updated) {
      throw new NotFoundError('Target user not found after update');
    }

    return updated;
  }
}

export const userService = new UserService();
