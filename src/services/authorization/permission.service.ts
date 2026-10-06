import { roleRepository } from '../../repositories/role.repository';
import { permissionRepository } from '../../repositories/permission.repository';
import { ForbiddenError } from '../../types/authorization';

/**
 * Service managing role and permission evaluation for system users.
 */
export class PermissionService {
  /**
   * Retrieves all role names assigned to a user.
   */
  async getUserRoles(userId: string): Promise<string[]> {
    const roles = await roleRepository.findRolesByUserId(userId);
    return roles.map((r) => r.name);
  }

  /**
   * Checks whether a user holds a specific role.
   */
  async hasRole(userId: string, roleName: string): Promise<boolean> {
    const roles = await this.getUserRoles(userId);
    return roles.includes(roleName);
  }

  /**
   * Checks whether a user holds the SUPER_ADMIN system role.
   */
  async isSuperAdmin(userId: string): Promise<boolean> {
    return this.hasRole(userId, 'SUPER_ADMIN');
  }

  /**
   * Retrieves all unique permission names granted to a user through their roles.
   */
  async getUserPermissions(userId: string): Promise<string[]> {
    const perms = await permissionRepository.findPermissionsByUserId(userId);
    return perms.map((p) => p.name);
  }

  /**
   * Evaluates if a user possesses a specific permission.
   * Super Admins automatically bypass permission checks.
   */
  async hasPermission(userId: string, permissionName: string): Promise<boolean> {
    if (await this.isSuperAdmin(userId)) {
      return true;
    }
    return permissionRepository.hasPermission(userId, permissionName);
  }

  /**
   * Evaluates if a user possesses at least one of the specified permissions.
   */
  async hasAnyPermission(userId: string, permissionNames: string[]): Promise<boolean> {
    if (await this.isSuperAdmin(userId)) {
      return true;
    }
    const perms = await this.getUserPermissions(userId);
    const permSet = new Set(perms);
    return permissionNames.some((name) => permSet.has(name));
  }

  /**
   * Evaluates if a user possesses all of the specified permissions.
   */
  async hasAllPermissions(userId: string, permissionNames: string[]): Promise<boolean> {
    if (await this.isSuperAdmin(userId)) {
      return true;
    }
    const perms = await this.getUserPermissions(userId);
    const permSet = new Set(perms);
    return permissionNames.every((name) => permSet.has(name));
  }

  /**
   * Enforces that a user has a specific permission.
   * Throws ForbiddenError (403) if missing.
   */
  async requirePermission(userId: string, permissionName: string): Promise<void> {
    const granted = await this.hasPermission(userId, permissionName);
    if (!granted) {
      throw new ForbiddenError(`Forbidden: missing required permission '${permissionName}'`);
    }
  }

  /**
   * Enforces that a user has a specific role.
   * Throws ForbiddenError (403) if missing.
   */
  async requireRole(userId: string, roleName: string): Promise<void> {
    const has = await this.hasRole(userId, roleName);
    if (!has) {
      throw new ForbiddenError(`Forbidden: missing required role '${roleName}'`);
    }
  }
}

export const permissionService = new PermissionService();
