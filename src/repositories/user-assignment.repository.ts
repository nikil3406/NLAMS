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
