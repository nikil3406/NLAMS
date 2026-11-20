import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '../../db';
import { users, type User } from '../../db/schema/users';
import { roles, type Role } from '../../db/schema/roles';
import { userRoles } from '../../db/schema/user-roles';
import { administrativeUnits } from '../../db/schema/administrative-units';
import { userAssignments } from '../../db/schema/user-assignments';
import {
  authorityUserAssignments,
  competentAuthorities,
} from '../../db/schema/competent-authorities';

export interface UserAssignmentDetail {
  id: string;
  administrativeUnitId: string;
  administrativeUnitName: string;
  administrativeUnitCode: string;
  administrativeUnitType: string;
  status: 'ACTIVE' | 'INACTIVE';
  startDate: string;
  endDate: string | null;
  assignedBy: string;
  createdAt: Date;
}

export interface UserAuthorityAssignmentDetail {
  id: string;
  authorityId: string;
  authorityCode: string;
  authorityName: string;
  designation: string;
  authorityLevel: string;
  status: 'ACTIVE' | 'INACTIVE';
  effectiveFrom: string;
  effectiveUntil: string | null;
  assignedBy: string;
  createdAt: Date;
}

export interface UserWithDetails {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  createdAt: Date;
  updatedAt: Date;
  roles: Role[];
  assignments: UserAssignmentDetail[];
  authorityAssignments?: UserAuthorityAssignmentDetail[];
}

export interface ListUsersRepoOptions {
  allowedUnitIds?: string[];
  search?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  roleId?: string;
  administrativeUnitId?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedUsersResult {
  users: UserWithDetails[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateUserData {
  name: string;
  email: string;
  phone?: string | null;
  passwordHash: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  roleId: string;
  administrativeUnitId: string;
  competentAuthorityId?: string | null;
  assignedBy: string;
}

/**
 * User repository providing data access methods for users, roles, and administrative assignments.
 * All Drizzle queries and transactions are contained within this repository.
 */
export class UserRepository {
  /**
   * Find an active or existing user by email (case-insensitive).
   */
  async findUserByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const [user] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${normalizedEmail}`)
      .limit(1);

    return user ?? null;
  }

  /**
   * Find a user by primary key ID.
   */
  async findUserById(id: string): Promise<User | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return user ?? null;
  }

  /**
   * Checks whether an email address is already in use, optionally excluding a user ID.
   */
  async isEmailTaken(email: string, excludeUserId?: string): Promise<boolean> {
    const normalizedEmail = email.trim().toLowerCase();
    const conditions = [sql`lower(${users.email}) = ${normalizedEmail}`];
    if (excludeUserId) {
      conditions.push(sql`${users.id} != ${excludeUserId}::uuid`);
    }

    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(...conditions))
      .limit(1);

    return Number(row?.count ?? 0) > 0;
  }

  /**
   * Retrieves a user by ID with full role and administrative assignment details.
   */
  async findUserDetailsById(id: string): Promise<UserWithDetails | null> {
    const user = await this.findUserById(id);
    if (!user) {
      return null;
    }

    const [userRolesList, assignmentsList, authorityAssignmentsList] = await Promise.all([
      db
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
        .where(eq(userRoles.userId, id))
        .orderBy(roles.name),
      db
        .select({
          id: userAssignments.id,
          administrativeUnitId: administrativeUnits.id,
          administrativeUnitName: administrativeUnits.name,
          administrativeUnitCode: administrativeUnits.code,
          administrativeUnitType: administrativeUnits.type,
          status: userAssignments.status,
          startDate: userAssignments.startDate,
          endDate: userAssignments.endDate,
          assignedBy: userAssignments.assignedBy,
          createdAt: userAssignments.createdAt,
        })
        .from(userAssignments)
        .innerJoin(
          administrativeUnits,
          eq(userAssignments.administrativeUnitId, administrativeUnits.id)
        )
        .where(eq(userAssignments.userId, id))
        .orderBy(desc(userAssignments.createdAt)),
      db
        .select({
          id: authorityUserAssignments.id,
          authorityId: competentAuthorities.id,
          authorityCode: competentAuthorities.authorityCode,
          authorityName: competentAuthorities.authorityName,
          designation: competentAuthorities.designation,
          authorityLevel: competentAuthorities.authorityLevel,
          status: authorityUserAssignments.status,
          effectiveFrom: authorityUserAssignments.effectiveFrom,
          effectiveUntil: authorityUserAssignments.effectiveUntil,
          assignedBy: authorityUserAssignments.assignedBy,
          createdAt: authorityUserAssignments.createdAt,
        })
        .from(authorityUserAssignments)
        .innerJoin(
          competentAuthorities,
          eq(authorityUserAssignments.authorityId, competentAuthorities.id)
        )
        .where(eq(authorityUserAssignments.userId, id))
        .orderBy(desc(authorityUserAssignments.createdAt)),
    ]);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      roles: userRolesList,
      assignments: assignmentsList,
      authorityAssignments: authorityAssignmentsList as UserAuthorityAssignmentDetail[],
    };
  }

  /**
   * Lists users visible within an authorized scope, with search, filtering, and pagination.
   */
  async listUsers(options: ListUsersRepoOptions): Promise<PaginatedUsersResult> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.max(1, Math.min(100, options.limit ?? 10));
    const offset = (page - 1) * limit;

    // Scope condition: If allowedUnitIds is defined, user must have an active assignment in those units
    if (options.allowedUnitIds !== undefined && options.allowedUnitIds.length === 0) {
      return {
        users: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      };
    }

    const conditions = [];

    // Filter by allowed administrative scope (if specified)
    if (options.allowedUnitIds !== undefined) {
      conditions.push(
        sql`${users.id} IN (
          SELECT user_id FROM user_assignments
          WHERE administrative_unit_id IN (${sql.join(
            options.allowedUnitIds.map((id) => sql`${id}::uuid`),
            sql`, `
          )})
          AND status = 'ACTIVE'
        )`
      );
    }

    // Filter by specific administrative unit (if requested)
    if (options.administrativeUnitId) {
      conditions.push(
        sql`${users.id} IN (
          SELECT user_id FROM user_assignments
          WHERE administrative_unit_id = ${options.administrativeUnitId}::uuid
          AND status = 'ACTIVE'
        )`
      );
    }

    // Filter by role (if requested)
    if (options.roleId) {
      conditions.push(
        sql`${users.id} IN (
          SELECT user_id FROM user_roles
          WHERE role_id = ${options.roleId}::uuid
        )`
      );
    }

    // Filter by status (if requested)
    if (options.status) {
      conditions.push(eq(users.status, options.status));
    }

    // Search query: case-insensitive name or email
    if (options.search && options.search.trim().length > 0) {
      const searchPattern = `%${options.search.trim()}%`;
      conditions.push(
        or(
          ilike(users.name, searchPattern),
          ilike(users.email, searchPattern)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Count total matches
    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(whereClause);

    const total = Number(countRow?.count ?? 0);
    const totalPages = Math.ceil(total / limit);

    if (total === 0) {
      return {
        users: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      };
    }

    // Fetch paginated user records
    const userRows = await db
      .select()
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    if (userRows.length === 0) {
      return {
        users: [],
        total,
        page,
        limit,
        totalPages,
      };
    }

    const userIds = userRows.map((u) => u.id);

    // Fetch roles, assignments, and authority assignments concurrently
    const [allRoles, allAssignments, allAuthAssignments] = await Promise.all([
      db
        .select({
          userId: userRoles.userId,
          role: roles,
        })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(inArray(userRoles.userId, userIds))
        .orderBy(roles.name),
      db
        .select({
          userId: userAssignments.userId,
          assignment: {
            id: userAssignments.id,
            administrativeUnitId: administrativeUnits.id,
            administrativeUnitName: administrativeUnits.name,
            administrativeUnitCode: administrativeUnits.code,
            administrativeUnitType: administrativeUnits.type,
            status: userAssignments.status,
            startDate: userAssignments.startDate,
            endDate: userAssignments.endDate,
            assignedBy: userAssignments.assignedBy,
            createdAt: userAssignments.createdAt,
          },
        })
        .from(userAssignments)
        .innerJoin(
          administrativeUnits,
          eq(userAssignments.administrativeUnitId, administrativeUnits.id)
        )
        .where(inArray(userAssignments.userId, userIds))
        .orderBy(desc(userAssignments.createdAt)),
      db
        .select({
          userId: authorityUserAssignments.userId,
          assignment: {
            id: authorityUserAssignments.id,
            authorityId: competentAuthorities.id,
            authorityCode: competentAuthorities.authorityCode,
            authorityName: competentAuthorities.authorityName,
            designation: competentAuthorities.designation,
            authorityLevel: competentAuthorities.authorityLevel,
            status: authorityUserAssignments.status,
            effectiveFrom: authorityUserAssignments.effectiveFrom,
            effectiveUntil: authorityUserAssignments.effectiveUntil,
            assignedBy: authorityUserAssignments.assignedBy,
            createdAt: authorityUserAssignments.createdAt,
          },
        })
        .from(authorityUserAssignments)
        .innerJoin(
          competentAuthorities,
          eq(authorityUserAssignments.authorityId, competentAuthorities.id)
        )
        .where(inArray(authorityUserAssignments.userId, userIds))
        .orderBy(desc(authorityUserAssignments.createdAt)),
    ]);

    const rolesMap = new Map<string, Role[]>();
    for (const r of allRoles) {
      const list = rolesMap.get(r.userId) ?? [];
      list.push(r.role);
      rolesMap.set(r.userId, list);
    }

    const assignmentsMap = new Map<string, UserAssignmentDetail[]>();
    for (const a of allAssignments) {
      const list = assignmentsMap.get(a.userId) ?? [];
      list.push(a.assignment);
      assignmentsMap.set(a.userId, list);
    }

    const authAssignmentsMap = new Map<string, UserAuthorityAssignmentDetail[]>();
    for (const a of allAuthAssignments) {
      const list = authAssignmentsMap.get(a.userId) ?? [];
      list.push(a.assignment as UserAuthorityAssignmentDetail);
      authAssignmentsMap.set(a.userId, list);
    }

    const enrichedUsers: UserWithDetails[] = userRows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      status: u.status,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      roles: rolesMap.get(u.id) ?? [],
      assignments: assignmentsMap.get(u.id) ?? [],
      authorityAssignments: authAssignmentsMap.get(u.id) ?? [],
    }));

    return {
      users: enrichedUsers,
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Creates a user atomically within a database transaction,
   * including the user record, initial role, and initial administrative assignment.
   */
  async createUserWithInitialAssignment(
    data: CreateUserData
  ): Promise<UserWithDetails> {
    return await db.transaction(async (tx) => {
      // 1. Insert user
      const [user] = await tx
        .insert(users)
        .values({
          name: data.name.trim(),
          email: data.email.trim().toLowerCase(),
          phone: data.phone?.trim() || null,
          passwordHash: data.passwordHash,
          status: data.status ?? 'ACTIVE',
        })
        .returning();

      // 2. Insert initial role
      await tx.insert(userRoles).values({
        userId: user.id,
        roleId: data.roleId,
        assignedBy: data.assignedBy,
      });

      // 3. Insert initial administrative assignment
      const today = new Date().toISOString().split('T')[0];
      await tx.insert(userAssignments).values({
        userId: user.id,
        administrativeUnitId: data.administrativeUnitId,
        assignedBy: data.assignedBy,
        startDate: today,
        status: 'ACTIVE',
      });

      // 3b. Insert initial Competent Authority assignment if provided
      let createdAuthAssignment: UserAuthorityAssignmentDetail | null = null;
      if (data.competentAuthorityId) {
        const [authAssign] = await tx
          .insert(authorityUserAssignments)
          .values({
            authorityId: data.competentAuthorityId,
            userId: user.id,
            assignedBy: data.assignedBy,
            effectiveFrom: today,
            status: 'ACTIVE',
          })
          .returning();

        const [auth] = await tx
          .select()
          .from(competentAuthorities)
          .where(eq(competentAuthorities.id, data.competentAuthorityId))
          .limit(1);

        if (auth && authAssign) {
          createdAuthAssignment = {
            id: authAssign.id,
            authorityId: auth.id,
            authorityCode: auth.authorityCode,
            authorityName: auth.authorityName,
            designation: auth.designation,
            authorityLevel: auth.authorityLevel,
            status: authAssign.status as 'ACTIVE' | 'INACTIVE',
            effectiveFrom: authAssign.effectiveFrom,
            effectiveUntil: authAssign.effectiveUntil,
            assignedBy: authAssign.assignedBy,
            createdAt: authAssign.createdAt,
          };
        }
      }

      // 4. Fetch the role and administrative unit details for the return value
      const [role] = await tx
        .select()
        .from(roles)
        .where(eq(roles.id, data.roleId))
        .limit(1);

      const [unit] = await tx
        .select()
        .from(administrativeUnits)
        .where(eq(administrativeUnits.id, data.administrativeUnitId))
        .limit(1);

      const [assignment] = await tx
        .select()
        .from(userAssignments)
        .where(
          and(
            eq(userAssignments.userId, user.id),
            eq(userAssignments.administrativeUnitId, data.administrativeUnitId)
          )
        )
        .limit(1);

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        roles: role ? [role] : [],
        assignments: unit && assignment
          ? [
              {
                id: assignment.id,
                administrativeUnitId: unit.id,
                administrativeUnitName: unit.name,
                administrativeUnitCode: unit.code,
                administrativeUnitType: unit.type,
                status: assignment.status,
                startDate: assignment.startDate,
                endDate: assignment.endDate,
                assignedBy: assignment.assignedBy,
                createdAt: assignment.createdAt,
              },
            ]
          : [],
        authorityAssignments: createdAuthAssignment ? [createdAuthAssignment] : [],
      };
    });
  }

  /**
   * Updates administrative user account attributes (status).
   * Personal information (name, email, phone) cannot be altered after account creation.
   */
  async updateUser(
    id: string,
    data: {
      status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
    }
  ): Promise<User | null> {
    const updateData: Partial<User> = {
      updatedAt: new Date(),
    };

    if (data.status !== undefined) {
      updateData.status = data.status;
    }

    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();

    return updated ?? null;
  }

  /**
   * Updates an authenticated user's own personal profile information (name, email, phone).
   * Used exclusively for self-service profile management.
   */
  async updatePersonalProfile(
    id: string,
    data: {
      name?: string;
      email?: string;
      phone?: string | null;
    }
  ): Promise<User | null> {
    const updateData: Partial<User> = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) {
      updateData.name = data.name.trim();
    }
    if (data.email !== undefined) {
      updateData.email = data.email.trim().toLowerCase();
    }
    if (data.phone !== undefined) {
      updateData.phone = data.phone?.trim() || null;
    }

    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();

    return updated ?? null;
  }

  /**
   * Retrieves all authority assignments for a specific user.
   */
  async findAuthorityAssignmentsByUserId(
    userId: string
  ): Promise<UserAuthorityAssignmentDetail[]> {
    const rows = await db
      .select({
        id: authorityUserAssignments.id,
        authorityId: competentAuthorities.id,
        authorityCode: competentAuthorities.authorityCode,
        authorityName: competentAuthorities.authorityName,
        designation: competentAuthorities.designation,
        authorityLevel: competentAuthorities.authorityLevel,
        status: authorityUserAssignments.status,
        effectiveFrom: authorityUserAssignments.effectiveFrom,
        effectiveUntil: authorityUserAssignments.effectiveUntil,
        assignedBy: authorityUserAssignments.assignedBy,
        createdAt: authorityUserAssignments.createdAt,
      })
      .from(authorityUserAssignments)
      .innerJoin(
        competentAuthorities,
        eq(authorityUserAssignments.authorityId, competentAuthorities.id)
      )
      .where(eq(authorityUserAssignments.userId, userId))
      .orderBy(desc(authorityUserAssignments.createdAt));

    return rows as UserAuthorityAssignmentDetail[];
  }

  /**
   * Updates an existing authority user assignment (e.g. status, effectiveUntil).
   */
  async updateAuthorityUserAssignment(
    assignmentId: string,
    data: {
      status?: 'ACTIVE' | 'INACTIVE';
      effectiveUntil?: string | null;
    }
  ) {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (data.status !== undefined) updateData.status = data.status;
    if (data.effectiveUntil !== undefined) updateData.effectiveUntil = data.effectiveUntil;

    const [updated] = await db
      .update(authorityUserAssignments)
      .set(updateData)
      .where(eq(authorityUserAssignments.id, assignmentId))
      .returning();

    return updated ?? null;
  }

  /**
   * Deactivates all active authority assignments for a user without deleting history.
   */
  async deactivateActiveAuthorityAssignmentsForUser(userId: string) {
    const today = new Date().toISOString().split('T')[0];
    await db
      .update(authorityUserAssignments)
      .set({
        status: 'INACTIVE',
        effectiveUntil: today,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(authorityUserAssignments.userId, userId),
          eq(authorityUserAssignments.status, 'ACTIVE')
        )
      );
  }

  /**
   * Assigns or updates a user's authority assignment transactionally.
   * Preserves history by deactivating any existing active assignment for that user.
   */
  async reassignUserAuthority(
    userId: string,
    authorityId: string,
    assignedBy: string,
    effectiveFrom?: string,
    effectiveUntil?: string | null
  ): Promise<UserAuthorityAssignmentDetail> {
    const today = effectiveFrom || new Date().toISOString().split('T')[0];
    return await db.transaction(async (tx) => {
      // 1. Deactivate existing active assignments (preserve historical records)
      await tx
        .update(authorityUserAssignments)
        .set({
          status: 'INACTIVE',
          effectiveUntil: today,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(authorityUserAssignments.userId, userId),
            eq(authorityUserAssignments.status, 'ACTIVE')
          )
        );

      // 2. Insert new active assignment
      const [newAssign] = await tx
        .insert(authorityUserAssignments)
        .values({
          authorityId,
          userId,
          assignedBy,
          effectiveFrom: today,
          effectiveUntil: effectiveUntil || null,
          status: 'ACTIVE',
        })
        .returning();

      // 3. Fetch details
      const [auth] = await tx
        .select()
        .from(competentAuthorities)
        .where(eq(competentAuthorities.id, authorityId))
        .limit(1);

      return {
        id: newAssign.id,
        authorityId: auth.id,
        authorityCode: auth.authorityCode,
        authorityName: auth.authorityName,
        designation: auth.designation,
        authorityLevel: auth.authorityLevel,
        status: newAssign.status as 'ACTIVE' | 'INACTIVE',
        effectiveFrom: newAssign.effectiveFrom,
        effectiveUntil: newAssign.effectiveUntil,
        assignedBy: newAssign.assignedBy,
        createdAt: newAssign.createdAt,
      };
    });
  }
}


export const userRepository = new UserRepository();
