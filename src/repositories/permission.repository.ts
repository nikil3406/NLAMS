import { eq, and } from 'drizzle-orm';
import { db } from '../../db';
import { permissions, type Permission } from '../../db/schema/permissions';
import { rolePermissions } from '../../db/schema/role-permissions';
import { userRoles } from '../../db/schema/user-roles';

/**
 * Permission repository providing data access for system permissions
 * and role-permission mappings.
 */
export class PermissionRepository {
  /**
   * Retrieves all unique permissions granted to a user through all their assigned roles.
   */
  async findPermissionsByUserId(userId: string): Promise<Permission[]> {
    const rows = await db
      .selectDistinct({
        id: permissions.id,
        name: permissions.name,
        description: permissions.description,
        createdAt: permissions.createdAt,
      })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(userRoles.userId, userId));

    return rows;
  }

  /**
   * Retrieves all permissions mapped to a specific role.
   */
  async findPermissionsByRoleId(roleId: string): Promise<Permission[]> {
    const rows = await db
      .select({
        id: permissions.id,
        name: permissions.name,
        description: permissions.description,
        createdAt: permissions.createdAt,
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, roleId));

    return rows;
  }

  /**
   * Retrieves all system permissions, ordered alphabetically.
   */
  async findAllPermissions(): Promise<Permission[]> {
    return db.select().from(permissions).orderBy(permissions.name);
  }

  /**
   * Checks directly if a user has a specific permission by name.
   */
  async hasPermission(userId: string, permissionName: string): Promise<boolean> {
    const rows = await db
      .select({ id: permissions.id })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(
        and(
          eq(userRoles.userId, userId),
          eq(permissions.name, permissionName)
        )
      )
      .limit(1);

    return rows.length > 0;
  }
}

export const permissionRepository = new PermissionRepository();
