import { userRepository } from '../../repositories/user.repository';
import { userAssignmentRepository } from '../../repositories/user-assignment.repository';
import { permissionService } from './permission.service';
import { scopeService } from './scope.service';
import { ForbiddenError, type UserAuthorizationContext } from '../../types/authorization';
import { sanitizeUser } from '../auth/session.service';

/**
 * Relative authority weight of system roles to prevent lower-tier officers
 * from managing higher-tier officers (even within the same administrative unit).
 */
export const ROLE_AUTHORITY_WEIGHT: Record<string, number> = {
  SUPER_ADMIN: 100,
  MINISTRY_ADMIN: 80,
  PROJECT_OFFICER: 60,
  LAND_OFFICER: 40,
  FIELD_OFFICER: 20,
};

export interface CanManageUserOptions {
  /**
   * Specific permission required for the management action (e.g. 'USER_UPDATE', 'USER_ASSIGN').
   * If omitted, checks for general user management capability ('USER_UPDATE' or 'USER_ASSIGN').
   */
  requiredPermission?: string;
}

/**
 * High-level authorization service orchestrating role permissions,
 * administrative boundary scopes, and hierarchical authority rules.
 */
export class AuthorizationService {
  /**
   * Resolves the complete authorization context for an authenticated user.
   */
  async getUserAuthorizationContext(userId: string): Promise<UserAuthorizationContext | null> {
    const user = await userRepository.findUserById(userId);
    if (!user) {
      return null;
    }

    const roles = await permissionService.getUserRoles(userId);
    const permissions = await permissionService.getUserPermissions(userId);
    const assignmentsWithUnits =
      await userAssignmentRepository.findActiveAssignmentsWithUnitsByUserId(userId);

    const assignments = assignmentsWithUnits.map(({ assignment, administrativeUnit }) => ({
      id: assignment.id,
      administrativeUnitId: administrativeUnit.id,
      administrativeUnitName: administrativeUnit.name,
      administrativeUnitCode: administrativeUnit.code,
      administrativeUnitType: administrativeUnit.type,
      status: assignment.status,
      startDate: assignment.startDate,
      endDate: assignment.endDate,
    }));

    const isSuperAdmin = roles.includes('SUPER_ADMIN');

    return {
      user: sanitizeUser(user),
      roles,
      permissions,
      assignments,
      isSuperAdmin,
    };
  }

  /**
   * Evaluates whether an acting user has authority to manage a target user.
   *
   * Enforces:
   * 1. Required action permission possession.
   * 2. Super Admin universal authority.
   * 3. Non-Super-Admins can NEVER manage Super Admins.
   * 4. Scope containment: target's administrative units must be within actor's scope.
   * 5. Hierarchical non-inversion: lower-level officers cannot manage higher-level officers.
   */
  async canManageUser(
    actorUserId: string,
    targetUserId: string,
    options?: CanManageUserOptions
  ): Promise<boolean> {
    // 1. Permission check
    if (options?.requiredPermission) {
      const hasReqPerm = await permissionService.hasPermission(
        actorUserId,
        options.requiredPermission
      );
      if (!hasReqPerm) {
        return false;
      }
    } else {
      const hasGeneralPerm = await permissionService.hasAnyPermission(actorUserId, [
        'USER_UPDATE',
        'USER_ASSIGN',
        'USER_CREATE',
      ]);
      if (!hasGeneralPerm) {
        return false;
      }
    }

    // 2. Super Admin actor has national authority
    const actorIsSuperAdmin = await permissionService.isSuperAdmin(actorUserId);
    if (actorIsSuperAdmin) {
      return true;
    }

    // 3. Target is Super Admin -> non-Super-Admin can never manage
    const targetIsSuperAdmin = await permissionService.isSuperAdmin(targetUserId);
    if (targetIsSuperAdmin) {
      return false;
    }

    // 4. Role weight check: Lower-ranked roles cannot manage higher-ranked roles
    const actorRoles = await permissionService.getUserRoles(actorUserId);
    const targetRoles = await permissionService.getUserRoles(targetUserId);

    const actorMaxWeight = Math.max(
      ...actorRoles.map((r) => ROLE_AUTHORITY_WEIGHT[r] ?? 0),
      0
    );
    const targetMaxWeight = Math.max(
      ...targetRoles.map((r) => ROLE_AUTHORITY_WEIGHT[r] ?? 0),
      0
    );

    if (actorMaxWeight < targetMaxWeight) {
      return false;
    }

    // 5. Administrative Scope check
    const targetAssignedUnits = await scopeService.getUserAssignedUnits(targetUserId);

    // If target has active unit assignments, all must be within actor's scope
    if (targetAssignedUnits.length > 0) {
      for (const targetUnit of targetAssignedUnits) {
        const inScope = await scopeService.isWithinAdministrativeScope(
          actorUserId,
          targetUnit.id
        );
        if (!inScope) {
          return false;
        }
      }
    } else {
      // If target has no assigned unit, actor must have at least one active assignment to operate
      const actorAssignedUnits = await scopeService.getUserAssignedUnits(actorUserId);
      if (actorAssignedUnits.length === 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Asserts that an acting user has authority to manage a target user.
   * Throws ForbiddenError (403) if denied.
   */
  async requireCanManageUser(
    actorUserId: string,
    targetUserId: string,
    options?: CanManageUserOptions
  ): Promise<void> {
    const allowed = await this.canManageUser(actorUserId, targetUserId, options);
    if (!allowed) {
      throw new ForbiddenError(
        'Forbidden: you do not possess administrative authority over this user'
      );
    }
  }
}

export const authorizationService = new AuthorizationService();
