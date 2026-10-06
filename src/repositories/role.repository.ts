import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { roles, type Role } from '../../db/schema/roles';
import { userRoles } from '../../db/schema/user-roles';

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
   * Assigns a role to a user.
   */
  async assignRoleToUser(userId: string, roleId: string, assignedBy: string): Promise<void> {
    await db
      .insert(userRoles)
      .values({ userId, roleId, assignedBy })
      .onConflictDoNothing();
  }
}

export const roleRepository = new RoleRepository();
