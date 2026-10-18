import { eq, and } from 'drizzle-orm';
import { db } from '../../db';
import {
  userAssignments,
  type UserAssignment,
  type NewUserAssignment,
} from '../../db/schema/user-assignments';
import {
  administrativeUnits,
  type AdministrativeUnit,
} from '../../db/schema/administrative-units';

export interface UserAssignmentWithUnit {
  assignment: UserAssignment;
  administrativeUnit: AdministrativeUnit;
}

/**
 * User Assignment repository managing user links to administrative units.
 */
export class UserAssignmentRepository {
  /**
   * Retrieves active assignments for a user.
   */
  async findActiveAssignmentsByUserId(userId: string): Promise<UserAssignment[]> {
    const rows = await db
      .select()
      .from(userAssignments)
      .where(
        and(
          eq(userAssignments.userId, userId),
          eq(userAssignments.status, 'ACTIVE')
        )
      );

    return rows;
  }

  /**
   * Retrieves active assignments joined with their corresponding administrative unit details.
   */
  async findActiveAssignmentsWithUnitsByUserId(
    userId: string
  ): Promise<UserAssignmentWithUnit[]> {
    const rows = await db
      .select({
        assignment: userAssignments,
        administrativeUnit: administrativeUnits,
      })
      .from(userAssignments)
      .innerJoin(
        administrativeUnits,
        eq(userAssignments.administrativeUnitId, administrativeUnits.id)
      )
      .where(
        and(
          eq(userAssignments.userId, userId),
          eq(userAssignments.status, 'ACTIVE')
        )
      );

    return rows;
  }

  /**
   * Retrieves an assignment by ID.
   */
  async findAssignmentById(id: string): Promise<UserAssignment | null> {
    const [row] = await db
      .select()
      .from(userAssignments)
      .where(eq(userAssignments.id, id))
      .limit(1);

    return row ?? null;
  }

  /**
   * Retrieves an assignment joined with unit details by assignment ID.
   */
  async findAssignmentWithUnitById(id: string): Promise<UserAssignmentWithUnit | null> {
    const [row] = await db
      .select({
        assignment: userAssignments,
        administrativeUnit: administrativeUnits,
      })
      .from(userAssignments)
      .innerJoin(
        administrativeUnits,
        eq(userAssignments.administrativeUnitId, administrativeUnits.id)
      )
      .where(eq(userAssignments.id, id))
      .limit(1);

    return row ?? null;
  }

  /**
   * Retrieves all assignments (active and inactive) for a user with unit details.
   */
  async findAllAssignmentsWithUnitsByUserId(
    userId: string
  ): Promise<UserAssignmentWithUnit[]> {
    const rows = await db
      .select({
        assignment: userAssignments,
        administrativeUnit: administrativeUnits,
      })
      .from(userAssignments)
      .innerJoin(
        administrativeUnits,
        eq(userAssignments.administrativeUnitId, administrativeUnits.id)
      )
      .where(eq(userAssignments.userId, userId))
      .orderBy(userAssignments.createdAt);

    return rows;
  }

  /**
   * Checks if a user already has an active assignment for the given unit.
   */
  async findActiveAssignmentByUserAndUnit(
    userId: string,
    administrativeUnitId: string
  ): Promise<UserAssignment | null> {
    const [row] = await db
      .select()
      .from(userAssignments)
      .where(
        and(
          eq(userAssignments.userId, userId),
          eq(userAssignments.administrativeUnitId, administrativeUnitId),
          eq(userAssignments.status, 'ACTIVE')
        )
      )
      .limit(1);

    return row ?? null;
  }

  /**
   * Updates an existing administrative assignment.
   */
  async updateAssignment(
    id: string,
    data: Partial<{
      status: 'ACTIVE' | 'INACTIVE';
      endDate: string | null;
    }>
  ): Promise<UserAssignment | null> {
    const [updated] = await db
      .update(userAssignments)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(userAssignments.id, id))
      .returning();

    return updated ?? null;
  }

  /**
   * Creates a new user administrative assignment.
   */
  async createAssignment(data: NewUserAssignment): Promise<UserAssignment> {
    const [created] = await db
      .insert(userAssignments)
      .values(data)
      .returning();
    return created;
  }

  /**
   * Deactivates an assignment.
   */
  async deactivateAssignment(id: string): Promise<void> {
    await db
      .update(userAssignments)
      .set({ status: 'INACTIVE', updatedAt: new Date() })
      .where(eq(userAssignments.id, id));
  }
}

export const userAssignmentRepository = new UserAssignmentRepository();

