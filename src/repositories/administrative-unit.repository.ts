import { eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  administrativeUnits,
  type AdministrativeUnit,
  type NewAdministrativeUnit,
} from '../../db/schema/administrative-units';

/**
 * Administrative Unit repository managing hierarchical boundary data and
 * executing recursive hierarchy traversal queries.
 */
export class AdministrativeUnitRepository {
  /**
   * Retrieves an administrative unit by primary key ID.
   */
  async findUnitById(id: string): Promise<AdministrativeUnit | null> {
    const [unit] = await db
      .select()
      .from(administrativeUnits)
      .where(eq(administrativeUnits.id, id))
      .limit(1);

    return unit ?? null;
  }

  /**
   * Retrieves an administrative unit by unique system code (e.g. 'KA-BLR').
   */
  async findUnitByCode(code: string): Promise<AdministrativeUnit | null> {
    const [unit] = await db
      .select()
      .from(administrativeUnits)
      .where(eq(administrativeUnits.code, code))
      .limit(1);

    return unit ?? null;
  }

  /**
   * Recursively resolves all descendant administrative unit IDs (including self).
   * Executes a PostgreSQL recursive CTE for arbitrary hierarchy depth.
   */
  async getDescendantUnitIds(unitId: string): Promise<string[]> {
    const result = await db.execute<{ id: string }>(sql`
      WITH RECURSIVE descendants AS (
        SELECT id FROM administrative_units
        WHERE id = ${unitId}::uuid AND is_active = true
        UNION ALL
        SELECT u.id FROM administrative_units u
        INNER JOIN descendants d ON u.parent_id = d.id
        WHERE u.is_active = true
      )
      SELECT id FROM descendants
    `);

    return result.map((row) => row.id);
  }

  /**
   * Recursively resolves all ancestor administrative unit IDs (including self).
   */
  async getAncestorUnitIds(unitId: string): Promise<string[]> {
    const result = await db.execute<{ id: string }>(sql`
      WITH RECURSIVE ancestors AS (
        SELECT id, parent_id FROM administrative_units
        WHERE id = ${unitId}::uuid AND is_active = true
        UNION ALL
        SELECT u.id, u.parent_id FROM administrative_units u
        INNER JOIN ancestors a ON u.id = a.parent_id
        WHERE u.is_active = true
      )
      SELECT id FROM ancestors
    `);

    return result.map((row) => row.id);
  }

  /**
   * Checks whether candidateUnitId is the same unit or a descendant of ancestorUnitId.
   */
  async isDescendantOrSelf(ancestorUnitId: string, candidateUnitId: string): Promise<boolean> {
    if (ancestorUnitId === candidateUnitId) {
      return true;
    }

    const result = await db.execute<{ exists: number }>(sql`
      WITH RECURSIVE descendants AS (
        SELECT id FROM administrative_units
        WHERE id = ${ancestorUnitId}::uuid AND is_active = true
        UNION ALL
        SELECT u.id FROM administrative_units u
        INNER JOIN descendants d ON u.parent_id = d.id
        WHERE u.is_active = true
      )
      SELECT 1 AS exists FROM descendants
      WHERE id = ${candidateUnitId}::uuid
      LIMIT 1
    `);

    return result.length > 0;
  }

  /**
   * Checks whether candidateUnitId is strictly a descendant (subordinate) of ancestorUnitId.
   */
  async isSubordinate(ancestorUnitId: string, candidateUnitId: string): Promise<boolean> {
    if (ancestorUnitId === candidateUnitId) {
      return false;
    }
    return this.isDescendantOrSelf(ancestorUnitId, candidateUnitId);
  }

  /**
   * Creates a new administrative unit (used for tests and seeds).
   */
  async createUnit(data: NewAdministrativeUnit): Promise<AdministrativeUnit> {
    const [created] = await db
      .insert(administrativeUnits)
      .values(data)
      .returning();
    return created;
  }
}

export const administrativeUnitRepository = new AdministrativeUnitRepository();
