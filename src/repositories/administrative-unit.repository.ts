import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  administrativeUnits,
  type AdministrativeUnit,
  type NewAdministrativeUnit,
} from '../../db/schema/administrative-units';

export interface UnitQueryOptions {
  activeOnly?: boolean;
}

/**
 * Administrative Unit repository managing hierarchical boundary data and
 * executing recursive hierarchy traversal queries.
 */
export class AdministrativeUnitRepository {
  /**
   * Retrieves an administrative unit by primary key ID.
   */
  async getAdministrativeUnitById(id: string): Promise<AdministrativeUnit | null> {
    const [unit] = await db
      .select()
      .from(administrativeUnits)
      .where(eq(administrativeUnits.id, id))
      .limit(1);

    return unit ?? null;
  }

  /**
   * Alias for getAdministrativeUnitById for backward compatibility.
   */
  async findUnitById(id: string): Promise<AdministrativeUnit | null> {
    return this.getAdministrativeUnitById(id);
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
   * Retrieves all root administrative units (parent_id IS NULL).
   */
  async getRootAdministrativeUnits(options: UnitQueryOptions = { activeOnly: true }): Promise<AdministrativeUnit[]> {
    const conditions = [isNull(administrativeUnits.parentId)];
    if (options.activeOnly !== false) {
      conditions.push(eq(administrativeUnits.isActive, true));
    }

    return db
      .select()
      .from(administrativeUnits)
      .where(and(...conditions))
      .orderBy(asc(administrativeUnits.name));
  }

  /**
   * Retrieves all immediate child administrative units for a given parent ID.
   */
  async getChildAdministrativeUnits(
    parentId: string,
    options: UnitQueryOptions = { activeOnly: true }
  ): Promise<AdministrativeUnit[]> {
    const conditions = [eq(administrativeUnits.parentId, parentId)];
    if (options.activeOnly !== false) {
      conditions.push(eq(administrativeUnits.isActive, true));
    }

    return db
      .select()
      .from(administrativeUnits)
      .where(and(...conditions))
      .orderBy(asc(administrativeUnits.name));
  }

  /**
   * Alias for getChildAdministrativeUnits.
   */
  async getAdministrativeUnitChildren(
    parentId: string,
    options?: UnitQueryOptions
  ): Promise<AdministrativeUnit[]> {
    return this.getChildAdministrativeUnits(parentId, options);
  }

  /**
   * Retrieves all ancestor administrative units for a given unit ID,
   * ordered from the top-most root ancestor down to the immediate parent.
   */
  async getAdministrativeUnitAncestors(unitId: string): Promise<AdministrativeUnit[]> {
    const result = await db.execute<AdministrativeUnit>(sql`
      WITH RECURSIVE ancestors AS (
        SELECT id, name, code, type, parent_id, is_active, created_at, updated_at, 1 as depth
        FROM administrative_units
        WHERE id = ${unitId}::uuid
        UNION ALL
        SELECT u.id, u.name, u.code, u.type, u.parent_id, u.is_active, u.created_at, u.updated_at, a.depth + 1
        FROM administrative_units u
        INNER JOIN ancestors a ON u.id = a.parent_id
      )
      SELECT
        id,
        name,
        code,
        type,
        parent_id AS "parentId",
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM ancestors
      WHERE id != ${unitId}::uuid
      ORDER BY depth DESC
    `);

    return result as unknown as AdministrativeUnit[];
  }

  /**
   * Retrieves all descendant administrative units for a given unit ID.
   */
  async getAdministrativeUnitDescendants(
    unitId: string,
    options: UnitQueryOptions = { activeOnly: true }
  ): Promise<AdministrativeUnit[]> {
    const activeClause = options.activeOnly !== false ? sql`AND u.is_active = true` : sql``;

    const result = await db.execute<AdministrativeUnit>(sql`
      WITH RECURSIVE descendants AS (
        SELECT id, name, code, type, parent_id, is_active, created_at, updated_at, 1 as depth
        FROM administrative_units
        WHERE parent_id = ${unitId}::uuid ${options.activeOnly !== false ? sql`AND is_active = true` : sql``}
        UNION ALL
        SELECT u.id, u.name, u.code, u.type, u.parent_id, u.is_active, u.created_at, u.updated_at, d.depth + 1
        FROM administrative_units u
        INNER JOIN descendants d ON u.parent_id = d.id
        WHERE 1=1 ${activeClause}
      )
      SELECT
        id,
        name,
        code,
        type,
        parent_id AS "parentId",
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM descendants
      ORDER BY depth ASC, name ASC
    `);

    return result as unknown as AdministrativeUnit[];
  }

  /**
   * Retrieves all administrative units in the system.
   */
  async getAllAdministrativeUnits(options: UnitQueryOptions = {}): Promise<AdministrativeUnit[]> {
    if (options.activeOnly) {
      return db
        .select()
        .from(administrativeUnits)
        .where(eq(administrativeUnits.isActive, true))
        .orderBy(asc(administrativeUnits.name));
    }

    return db
      .select()
      .from(administrativeUnits)
      .orderBy(asc(administrativeUnits.name));
  }

  /**
   * Counts the number of immediate direct children of a unit.
   */
  async countDirectChildren(unitId: string): Promise<number> {
    const result = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*)::text as count
      FROM administrative_units
      WHERE parent_id = ${unitId}::uuid AND is_active = true
    `);

    return parseInt(result[0]?.count ?? '0', 10);
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
   * Creates a new administrative unit.
   */
  async createAdministrativeUnit(data: NewAdministrativeUnit): Promise<AdministrativeUnit> {
    const [created] = await db
      .insert(administrativeUnits)
      .values(data)
      .returning();
    return created;
  }

  /**
   * Alias for createAdministrativeUnit for backward compatibility.
   */
  async createUnit(data: NewAdministrativeUnit): Promise<AdministrativeUnit> {
    return this.createAdministrativeUnit(data);
  }

  /**
   * Updates an existing administrative unit.
   */
  async updateAdministrativeUnit(
    id: string,
    data: Partial<NewAdministrativeUnit>
  ): Promise<AdministrativeUnit | null> {
    const [updated] = await db
      .update(administrativeUnits)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(administrativeUnits.id, id))
      .returning();

    return updated ?? null;
  }
}

export const administrativeUnitRepository = new AdministrativeUnitRepository();
