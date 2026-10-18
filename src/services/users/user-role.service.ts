import { roleRepository } from '../../repositories/role.repository';
import { userRepository, type UserWithDetails } from '../../repositories/user.repository';
import { permissionService } from '../authorization/permission.service';
import { authorizationService, ROLE_AUTHORITY_WEIGHT } from '../authorization/authorization.service';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../types/errors';
import type { Role } from '../../../db/schema/roles';

/**
 * Service managing user role assignments and delegated role authority enforcement.
 */
export class UserRoleService {
  /**
   * Evaluates whether an actor is authorized to delegate a specific role.
   *
   * Delegation rules:
   * 1. Actor must hold ROLE_ASSIGN permission.
   * 2. SUPER_ADMIN can delegate all roles.
   * 3. Non-Super-Admins can NEVER delegate SUPER_ADMIN.
   * 4. For non-Super-Admins, actor's highest role weight must be >= target role weight.
   */
  async canDelegateRole(actorUserId: string, roleName: string): Promise<boolean> {
    const hasPerm = await permissionService.hasPermission(actorUserId, 'ROLE_ASSIGN');
    if (!hasPerm) {
      return false;
    }

    const isActorSuperAdmin = await permissionService.isSuperAdmin(actorUserId);
    if (isActorSuperAdmin) {
      return true;
    }

    if (roleName === 'SUPER_ADMIN') {
      return false;
    }

    const actorRoles = await permissionService.getUserRoles(actorUserId);
    const actorMaxWeight = Math.max(
      ...actorRoles.map((r) => ROLE_AUTHORITY_WEIGHT[r] ?? 0),
      0
    );

    const targetRoleWeight = ROLE_AUTHORITY_WEIGHT[roleName] ?? 0;
    return actorMaxWeight >= targetRoleWeight;
  }

  /**
   * Retrieves all roles that the actor is authorized to delegate to other users.
   */
  async getDelegatableRoles(actorUserId: string): Promise<Role[]> {
    const hasPerm = await permissionService.hasPermission(actorUserId, 'ROLE_ASSIGN');
    if (!hasPerm) {
      return [];
    }

    const isActorSuperAdmin = await permissionService.isSuperAdmin(actorUserId);
    const allRoles = await roleRepository.findAllRoles();

    if (isActorSuperAdmin) {
      return allRoles;
    }

    const actorRoles = await permissionService.getUserRoles(actorUserId);
    const actorMaxWeight = Math.max(
      ...actorRoles.map((r) => ROLE_AUTHORITY_WEIGHT[r] ?? 0),
      0
    );

    return allRoles.filter((r) => {
      if (r.name === 'SUPER_ADMIN') return false;
      const weight = ROLE_AUTHORITY_WEIGHT[r.name] ?? 0;
      return actorMaxWeight >= weight;
    });
  }

  /**
   * Assigns an authorized role to a target user.
   */
  async assignRole(
    actorUserId: string,
    targetUserId: string,
    roleId: string
  ): Promise<UserWithDetails> {
    // 1. Cannot assign roles to oneself (prevent privilege escalation)
    if (actorUserId === targetUserId) {
      throw new ForbiddenError(
        'Forbidden: self-modification of roles is not permitted'
      );
    }

    // 2. Permission check
    await permissionService.requirePermission(actorUserId, 'ROLE_ASSIGN');

    // 3. Target user existence & management authority check
    const targetUser = await userRepository.findUserDetailsById(targetUserId);
    if (!targetUser) {
      throw new NotFoundError('Target user not found');
    }

    await authorizationService.requireCanManageUser(actorUserId, targetUserId, {
      requiredPermission: 'ROLE_ASSIGN',
    });

    // 4. Role existence check
    const role = await roleRepository.findRoleById(roleId);
    if (!role) {
      throw new NotFoundError('Role not found');
    }

    // 5. Delegation authority check
    const canDelegate = await this.canDelegateRole(actorUserId, role.name);
    if (!canDelegate) {
      throw new ForbiddenError(
        `Forbidden: you are not authorized to delegate the '${role.name}' role`
      );
    }

    // 6. Check if target user already holds this role
    const alreadyHas = await roleRepository.hasUserRole(targetUserId, roleId);
    if (alreadyHas) {
      throw new ConflictError(`User already holds the '${role.name}' role`);
    }

    // 7. Assign role
    await roleRepository.assignRoleToUser(targetUserId, roleId, actorUserId);

    // 8. Return updated user
    const updated = await userRepository.findUserDetailsById(targetUserId);
    if (!updated) {
      throw new NotFoundError('Target user not found after assignment');
    }

    return updated;
  }

  /**
   * Revokes a role from a target user.
   */
  async revokeRole(
    actorUserId: string,
    targetUserId: string,
    roleId: string
  ): Promise<UserWithDetails> {
    // 1. Cannot revoke roles from oneself
    if (actorUserId === targetUserId) {
      throw new ForbiddenError(
        'Forbidden: self-modification of roles is not permitted'
      );
    }

    // 2. Permission check
    await permissionService.requirePermission(actorUserId, 'ROLE_ASSIGN');

    // 3. Target user existence & management authority check
    const targetUser = await userRepository.findUserDetailsById(targetUserId);
    if (!targetUser) {
      throw new NotFoundError('Target user not found');
    }

    await authorizationService.requireCanManageUser(actorUserId, targetUserId, {
      requiredPermission: 'ROLE_ASSIGN',
    });

    // 4. Role existence & possession check
    const role = await roleRepository.findRoleById(roleId);
    if (!role) {
      throw new NotFoundError('Role not found');
    }

    const hasRole = await roleRepository.hasUserRole(targetUserId, roleId);
    if (!hasRole) {
      throw new NotFoundError(`User does not have the '${role.name}' role`);
    }

    // 5. Delegation/Revocation authority check
    const canRevoke = await this.canDelegateRole(actorUserId, role.name);
    if (!canRevoke) {
      throw new ForbiddenError(
        `Forbidden: you are not authorized to revoke the '${role.name}' role`
      );
    }

    // 6. Super Admin protection: Cannot revoke the system's last Super Admin
    if (role.name === 'SUPER_ADMIN') {
      const superAdminCount = await roleRepository.countSuperAdmins();
      if (superAdminCount <= 1) {
        throw new BadRequestError(
          'Cannot revoke role: the system must have at least one active SUPER_ADMIN'
        );
      }
    }

    // 7. Ensure target user doesn't end up with 0 roles
    if (targetUser.roles.length <= 1) {
      throw new BadRequestError(
        'Cannot revoke role: user must retain at least one role'
      );
    }

    // 8. Execute revocation
    await roleRepository.revokeRoleFromUser(targetUserId, roleId);

    // 9. Return updated user
    const updated = await userRepository.findUserDetailsById(targetUserId);
    if (!updated) {
      throw new NotFoundError('Target user not found after revocation');
    }

    return updated;
  }
}

export const userRoleService = new UserRoleService();
