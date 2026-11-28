import { cache } from 'react';
import { userRepository } from '../../repositories/user.repository';
import { userAssignmentRepository } from '../../repositories/user-assignment.repository';
import { permissionService } from './permission.service';
import { scopeService } from './scope.service';
import {
  ForbiddenError,
  type ImplementingAgencyInfo,
  type UserAuthorizationContext,
} from '../../types/authorization';
import { sanitizeUser } from '../auth/session.service';

/**
 * Relative authority weight of system roles to prevent lower-tier officers
 * from managing higher-tier officers (even within the same administrative unit).
 */
export const ROLE_AUTHORITY_WEIGHT: Record<string, number> = {
  SUPER_ADMIN: 100,
  MINISTRY_ADMIN: 80,
  COMPETENT_AUTHORITY: 70,
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
   * Uses React cache for request-scoped memoization across layouts and pages.
   */
  getUserAuthorizationContext = cache(async (userId: string): Promise<UserAuthorizationContext | null> => {
    const user = await userRepository.findUserById(userId);
    if (!user) {
      return null;
    }

    const [roles, permissions, assignmentsWithUnits, activeAgencyAssign] = await Promise.all([
      permissionService.getUserRoles(userId),
      permissionService.getUserPermissions(userId),
      userAssignmentRepository.findActiveAssignmentsWithUnitsByUserId(userId),
      userRepository.findActiveAgencyAssignmentByUserId(userId),
    ]);

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

    const implementingAgency: ImplementingAgencyInfo | null =
      activeAgencyAssign && activeAgencyAssign.agencyStatus === 'ACTIVE'
        ? {
            id: activeAgencyAssign.implementingAgencyId,
            code: activeAgencyAssign.agencyCode,
            name: activeAgencyAssign.agencyName,
            agencyType: activeAgencyAssign.agencyType,
            status: activeAgencyAssign.agencyStatus,
          }
        : null;

    const isSuperAdmin = roles.includes('SUPER_ADMIN');

    return {
      user: sanitizeUser(user),
      roles,
      permissions,
      assignments,
      implementingAgency,
      isSuperAdmin,
    };
  });

  /**
   * Resolves the Implementing Agency scope for a user:
   * - Returns `undefined` if the user is NOT organization-scoped (SUPER_ADMIN, MINISTRY_ADMIN,
   *   LAND_OFFICER, FIELD_OFFICER, COMPETENT_AUTHORITY).
   * - Returns `string` (agency ID) if the user is a PROJECT_OFFICER with an active agency.
   * - Returns `null` if the user is a PROJECT_OFFICER without an active agency (empty scope).
   */
  getAgencyScopeForUser = cache(async (userId: string): Promise<string | null | undefined> => {
    const roles = await permissionService.getUserRoles(userId);
    if (roles.includes('SUPER_ADMIN') || roles.includes('MINISTRY_ADMIN')) {
      return undefined;
    }

    if (!roles.includes('PROJECT_OFFICER')) {
      return undefined;
    }

    const activeAssign = await userRepository.findActiveAgencyAssignmentByUserId(userId);
    if (!activeAssign || activeAssign.agencyStatus !== 'ACTIVE') {
      return null;
    }

    return activeAssign.implementingAgencyId;
  });

  /**
   * Asserts that a Project Officer has an active Implementing Agency association
   * and returns the agency info. Throws ForbiddenError if missing or inactive.
   */
  async requireProjectOfficerActiveAgency(userId: string): Promise<ImplementingAgencyInfo> {
    const activeAssign = await userRepository.findActiveAgencyAssignmentByUserId(userId);
    if (!activeAssign) {
      throw new ForbiddenError(
        'Forbidden: Your Project Officer account is not associated with an Implementing Agency. Please contact an administrator.'
      );
    }
    if (activeAssign.agencyStatus !== 'ACTIVE') {
      throw new ForbiddenError(
        `Forbidden: Your associated Implementing Agency '${activeAssign.agencyName}' (${activeAssign.agencyCode}) is inactive.`
      );
    }
    return {
      id: activeAssign.implementingAgencyId,
      code: activeAssign.agencyCode,
      name: activeAssign.agencyName,
      agencyType: activeAssign.agencyType,
      status: activeAssign.agencyStatus,
    };
  }

  /**
   * Checks whether a user is authorized by Implementing Agency to access a project's records.
   */
  async canAccessProjectByAgency(
    userId: string,
    projectImplementingAgencyId: string
  ): Promise<boolean> {
    const agencyScope = await this.getAgencyScopeForUser(userId);
    if (agencyScope === undefined) {
      return true;
    }
    if (agencyScope === null) {
      return false;
    }
    return agencyScope === projectImplementingAgencyId;
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
