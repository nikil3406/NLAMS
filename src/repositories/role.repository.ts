import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { roles, type Role } from '../../db/schema/roles';
import { userRoles } from '../../db/schema/user-roles';
import { rolePermissions } from '../../db/schema/role-permissions';
import { permissions, type Permission } from '../../db/schema/permissions';

export interface RoleWithPermissions extends Role {
  permissions: Permission[];
}

/**
 * Role repository providing data access for system roles and user-role assignments.
 */
export class RoleRepository {
  /**
   * Retrieves all roles assigned to a specific user.
   */
  async findRolesByUserId(userId: string): Promise<Role[]> {
    const rows = await db
      .select({
        id: roles.id,
        name: roles.name,
        description: roles.description,
        isSystemRole: roles.isSystemRole,
        createdAt: roles.createdAt,
        updatedAt: roles.updatedAt,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId));

    return rows;
  }

  /**
   * Finds a role by its unique system name (e.g. 'SUPER_ADMIN').
   */
  async findRoleByName(name: string): Promise<Role | null> {
    const [role] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, name))
      .limit(1);

    return role ?? null;
  }

  /**
   * Finds a role by its primary key ID.
   */
  async findRoleById(id: string): Promise<Role | null> {
    const [role] = await db
      .select()
      .from(roles)
      .where(eq(roles.id, id))
      .limit(1);

    return role ?? null;
  }

  /**
   * Retrieves all available roles in the system.
   */
  async findAllRoles(): Promise<Role[]> {
    return db.select().from(roles).orderBy(roles.name);
  }

  /**
   * Retrieves all roles with their associated permissions.
   */
  async findAllRolesWithPermissions(): Promise<RoleWithPermissions[]> {
    const allRoles = await db.select().from(roles).orderBy(roles.name);

    const result: RoleWithPermissions[] = [];
    for (const role of allRoles) {
      const perms = await db
        .select({
          id: permissions.id,
          name: permissions.name,
          description: permissions.description,
          createdAt: permissions.createdAt,
        })
        .from(rolePermissions)
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(eq(rolePermissions.roleId, role.id))
        .orderBy(permissions.name);

      result.push({ ...role, permissions: perms });
    }
    return result;
  }

  /**
   * Retrieves a single role with its permissions.
   */
  async findRoleWithPermissions(roleId: string): Promise<RoleWithPermissions | null> {
    const role = await this.findRoleById(roleId);
    if (!role) return null;

    const perms = await db
      .select({
        id: permissions.id,
        name: permissions.name,
        description: permissions.description,
        createdAt: permissions.createdAt,
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, roleId))
      .orderBy(permissions.name);

    return { ...role, permissions: perms };
  }

  /**
   * Grants a permission to a role (idempotent).
   */
  async addPermissionToRole(roleId: string, permissionId: string): Promise<void> {
    await db
      .insert(rolePermissions)
      .values({ roleId, permissionId })
      .onConflictDoNothing();
  }

  /**
   * Revokes a permission from a role.
   * Returns true if a record was actually deleted.
   */
  async removePermissionFromRole(roleId: string, permissionId: string): Promise<boolean> {
    const deleted = await db
      .delete(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, roleId),
          eq(rolePermissions.permissionId, permissionId)
        )
      )
      .returning();
    return deleted.length > 0;
  }

  /**
   * Assigns a role to a user.
   */
  async assignRoleToUser(userId: string, roleId: string, assignedBy: string): Promise<void> {
    await db
      .insert(userRoles)
      .values({ userId, roleId, assignedBy })
      .onConflictDoNothing();
  }

  /**
   * Revokes a role from a user.
   */
  async revokeRoleFromUser(userId: string, roleId: string): Promise<boolean> {
    const deleted = await db
      .delete(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)))
      .returning();

    return deleted.length > 0;
  }

  /**
   * Checks if a user has a specific role assigned.
   */
  async hasUserRole(userId: string, roleId: string): Promise<boolean> {
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)))
      .limit(1);

    return Number(row?.count ?? 0) > 0;
  }

  /**
   * Counts total number of active users with the SUPER_ADMIN role.
   */
  async countSuperAdmins(): Promise<number> {
    const [superAdminRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, 'SUPER_ADMIN'))
      .limit(1);

    if (!superAdminRole) return 0;

    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(userRoles)
      .where(eq(userRoles.roleId, superAdminRole.id));

    return Number(row?.count ?? 0);
  }
}

export const roleRepository = new RoleRepository();

