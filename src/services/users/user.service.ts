import crypto from 'node:crypto';
import {
  userRepository,
  type UserWithDetails,
  type PaginatedUsersResult,
} from '../../repositories/user.repository';
import { roleRepository } from '../../repositories/role.repository';
import { administrativeUnitRepository } from '../../repositories/administrative-unit.repository';
import { competentAuthorityRepository } from '../../repositories/competent-authority.repository';
import { implementingAgencyRepository } from '../../repositories/implementing-agency.repository';
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
import { sanitizeUser } from '../auth/session.service';
import type { SafeUser } from '../../types/auth';
import type {
  CreateUserInput,
  ListUsersQuery,
  UpdateUserInput,
  UpdateSelfProfileInput,
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

    // 4b. Competent Authority validation if assigning COMPETENT_AUTHORITY role
    let competentAuthorityIdToAssign: string | null = null;
    if (role.name === 'COMPETENT_AUTHORITY') {
      if (!input.competentAuthorityId) {
        throw new BadRequestError(
          'Competent Authority selection is required when creating a user with the COMPETENT_AUTHORITY role'
        );
      }
      const authority = await competentAuthorityRepository.findAuthorityById(
        input.competentAuthorityId
      );
      if (!authority) {
        throw new NotFoundError(
          `Selected Competent Authority '${input.competentAuthorityId}' does not exist`
        );
      }
      if (authority.status !== 'ACTIVE') {
        throw new BadRequestError(
          `Cannot link user to Competent Authority '${authority.authorityName}': authority is INACTIVE`
        );
      }
      const today = new Date().toISOString().slice(0, 10);
      if (authority.effectiveFrom > today) {
        throw new BadRequestError(
          `Cannot link user to Competent Authority '${authority.authorityName}': effective date is in the future`
        );
      }
      if (authority.effectiveUntil && authority.effectiveUntil < today) {
        throw new BadRequestError(
          `Cannot link user to Competent Authority '${authority.authorityName}': authority has expired`
        );
      }
      competentAuthorityIdToAssign = authority.id;
    }

    // 4c. Implementing Agency validation if assigning PROJECT_OFFICER role
    let implementingAgencyIdToAssign: string | null = null;
    if (role.name === 'PROJECT_OFFICER') {
      if (!input.implementingAgencyId) {
        throw new BadRequestError(
          'Implementing Agency selection is required when creating a user with the PROJECT_OFFICER role'
        );
      }
      const agency = await implementingAgencyRepository.findAgencyById(
        input.implementingAgencyId
      );
      if (!agency) {
        throw new BadRequestError(
          `Selected Implementing Agency '${input.implementingAgencyId}' does not exist`
        );
      }
      if (agency.status !== 'ACTIVE') {
        throw new BadRequestError(
          `Cannot link user to Implementing Agency '${agency.name}' (${agency.code}): agency is ${agency.status}`
        );
      }
      implementingAgencyIdToAssign = agency.id;
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
      competentAuthorityId: competentAuthorityIdToAssign,
      implementingAgencyId: implementingAgencyIdToAssign,
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

  /**
   * Updates the authenticated caller's own personal profile information.
   * Target user ID is derived strictly from the authenticated session.
   */
  async updateSelfProfile(
    userId: string,
    input: UpdateSelfProfileInput
  ): Promise<SafeUser> {
    const user = await userRepository.findUserById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Check email uniqueness if changing email
    if (input.email) {
      const normalizedEmail = input.email.trim().toLowerCase();
      if (normalizedEmail !== user.email.toLowerCase()) {
        const taken = await userRepository.isEmailTaken(normalizedEmail, userId);
        if (taken) {
          throw new ConflictError(
            'A user with this email address already exists in the system'
          );
        }
      }
    }

    const updated = await userRepository.updatePersonalProfile(userId, {
      name: input.name,
      email: input.email,
      phone: input.phone,
    });

    if (!updated) {
      throw new NotFoundError('Failed to update personal profile');
    }

    return sanitizeUser(updated);
  }

  /**
   * Retrieves all authority assignments for a target user.
   */
  async getUserAuthorityAssignments(actorUserId: string, targetUserId: string) {
    await permissionService.requirePermission(actorUserId, 'USER_VIEW');

    const targetUser = await userRepository.findUserById(targetUserId);
    if (!targetUser) {
      throw new NotFoundError('Target user not found');
    }

    return userRepository.findAuthorityAssignmentsByUserId(targetUserId);
  }

  /**
   * Assigns or updates the Competent Authority associated with a user.
   * Preserves historical records by deactivating previous assignments.
   */
  async assignUserAuthority(
    actorUserId: string,
    targetUserId: string,
    input: {
      authorityId: string;
      effectiveFrom?: string;
      effectiveUntil?: string | null;
    }
  ) {
    await permissionService.requirePermission(actorUserId, 'USER_ASSIGN');

    const targetUser = await userRepository.findUserDetailsById(targetUserId);
    if (!targetUser) {
      throw new NotFoundError('Target user not found');
    }

    await authorizationService.requireCanManageUser(actorUserId, targetUserId, {
      requiredPermission: 'USER_ASSIGN',
    });

    // Ensure target user holds the COMPETENT_AUTHORITY role
    const hasRole = targetUser.roles.some((r) => r.name === 'COMPETENT_AUTHORITY');
    if (!hasRole) {
      throw new BadRequestError(
        'Cannot assign Competent Authority: user does not hold the COMPETENT_AUTHORITY role'
      );
    }

    // Verify authority exists and is active
    const authority = await competentAuthorityRepository.findAuthorityById(input.authorityId);
    if (!authority) {
      throw new NotFoundError(`Competent Authority '${input.authorityId}' not found`);
    }
    if (authority.status !== 'ACTIVE') {
      throw new BadRequestError(
        `Cannot assign user to Competent Authority '${authority.authorityName}': authority is INACTIVE`
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    if (authority.effectiveFrom > today) {
      throw new BadRequestError(
        `Cannot assign user to Competent Authority '${authority.authorityName}': effective date is in the future`
      );
    }
    if (authority.effectiveUntil && authority.effectiveUntil < today) {
      throw new BadRequestError(
        `Cannot assign user to Competent Authority '${authority.authorityName}': authority has expired`
      );
    }

    return userRepository.reassignUserAuthority(
      targetUserId,
      input.authorityId,
      actorUserId,
      input.effectiveFrom,
      input.effectiveUntil
    );
  }

  /**
   * Updates an existing authority assignment status (e.g. deactivate or activate).
   * Does NOT delete the historical record.
   */
  async updateUserAuthorityAssignmentStatus(
    actorUserId: string,
    targetUserId: string,
    assignmentId: string,
    input: {
      status: 'ACTIVE' | 'INACTIVE';
      effectiveUntil?: string | null;
    }
  ) {
    await permissionService.requirePermission(actorUserId, 'USER_ASSIGN');

    const targetUser = await userRepository.findUserDetailsById(targetUserId);
    if (!targetUser) {
      throw new NotFoundError('Target user not found');
    }

    await authorizationService.requireCanManageUser(actorUserId, targetUserId, {
      requiredPermission: 'USER_ASSIGN',
    });

    const userAssignments = await userRepository.findAuthorityAssignmentsByUserId(targetUserId);
    const existing = userAssignments.find((a) => a.id === assignmentId);
    if (!existing) {
      throw new NotFoundError('Authority assignment not found for this user');
    }

    // If activating, verify user holds the role and authority is active
    if (input.status === 'ACTIVE') {
      const hasRole = targetUser.roles.some((r) => r.name === 'COMPETENT_AUTHORITY');
      if (!hasRole) {
        throw new BadRequestError(
          'Cannot activate assignment: user does not hold the COMPETENT_AUTHORITY role'
        );
      }
      const authority = await competentAuthorityRepository.findAuthorityById(existing.authorityId);
      if (!authority || authority.status !== 'ACTIVE') {
        throw new BadRequestError('Cannot activate assignment: Competent Authority is not active');
      }

      // Check if user already has another ACTIVE assignment
      const alreadyActive = userAssignments.find(
        (a) => a.id !== assignmentId && a.status === 'ACTIVE'
      );
      if (alreadyActive) {
        // Deactivate previous active assignment to avoid conflicting active assignments
        await userRepository.updateAuthorityUserAssignment(alreadyActive.id, {
          status: 'INACTIVE',
          effectiveUntil: new Date().toISOString().slice(0, 10),
        });
      }
    }

    const effectiveUntil =
      input.effectiveUntil !== undefined
        ? input.effectiveUntil
        : input.status === 'INACTIVE'
        ? new Date().toISOString().slice(0, 10)
        : null;

    await userRepository.updateAuthorityUserAssignment(assignmentId, {
      status: input.status,
      effectiveUntil,
    });

    const refreshed = await userRepository.findAuthorityAssignmentsByUserId(targetUserId);
    return refreshed.find((a) => a.id === assignmentId) ?? null;
  }

  /**
   * Retrieves all Implementing Agency assignments (active and historical) for a target user.
   */
  async getUserImplementingAgencyAssignments(actorUserId: string, targetUserId: string) {
    await permissionService.requirePermission(actorUserId, 'USER_VIEW');

    const targetUser = await this.getUserDetails(actorUserId, targetUserId);
    return targetUser.implementingAgencyAssignments ?? [];
  }

  /**
   * Assigns or updates the Implementing Agency associated with a PROJECT_OFFICER user.
   * Preserves historical records by deactivating previous active assignments.
   * Prevents self-modification and enforces USER_ASSIGN + management authority.
   */
  async assignUserImplementingAgency(
    actorUserId: string,
    targetUserId: string,
    input: {
      implementingAgencyId: string;
      effectiveFrom?: string;
      effectiveUntil?: string | null;
    }
  ) {
    if (actorUserId === targetUserId) {
      throw new ForbiddenError(
        'Forbidden: users cannot modify their own Implementing Agency association'
      );
    }

    await permissionService.requirePermission(actorUserId, 'USER_ASSIGN');

    const targetUser = await userRepository.findUserDetailsById(targetUserId);
    if (!targetUser) {
      throw new NotFoundError('Target user not found');
    }

    await authorizationService.requireCanManageUser(actorUserId, targetUserId, {
      requiredPermission: 'USER_ASSIGN',
    });

    const hasProjectOfficerRole = targetUser.roles.some((r) => r.name === 'PROJECT_OFFICER');
    if (!hasProjectOfficerRole) {
      throw new BadRequestError(
        'Cannot assign Implementing Agency: user does not hold the PROJECT_OFFICER role'
      );
    }

    const agency = await implementingAgencyRepository.findAgencyById(
      input.implementingAgencyId
    );
    if (!agency) {
      throw new BadRequestError(
        `Implementing Agency '${input.implementingAgencyId}' does not exist`
      );
    }
    if (agency.status !== 'ACTIVE') {
      throw new BadRequestError(
        `Cannot assign user to Implementing Agency '${agency.name}' (${agency.code}): agency is ${agency.status}`
      );
    }

    const assignment = await userRepository.reassignUserImplementingAgency(
      targetUserId,
      agency.id,
      actorUserId,
      input.effectiveFrom,
      input.effectiveUntil
    );

    console.info(
      `[AUDIT] Implementing Agency assignment: userId=${targetUserId}, agencyId=${agency.id} (${agency.code}), assignedBy=${actorUserId}`
    );

    return assignment;
  }
}


export const userService = new UserService();
