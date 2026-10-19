import { and, eq, ilike, or, sql, asc } from 'drizzle-orm';
import { db } from '../../db';
import {
  implementingAgencies,
  type ImplementingAgency,
  type AgencyType,
  type AgencyStatus,
} from '../../db/schema/implementing-agencies';
import { administrativeUnits } from '../../db/schema/administrative-units';

export interface AgencyFilterOptions {
  search?: string;
  type?: AgencyType | string;
  status?: AgencyStatus | string;
  limit?: number;
  offset?: number;
}

export interface AgencyWithRelations extends ImplementingAgency {
  parentAgency?: ImplementingAgency | null;
  administrativeUnit?: {
    id: string;
    name: string;
    code: string;
    type: string;
  } | null;
}

export class ImplementingAgencyRepository {
  /**
   * Finds an agency by its UUID primary key.
   */
  async findAgencyById(id: string): Promise<AgencyWithRelations | null> {
    const [row] = await db
      .select({
        agency: implementingAgencies,
        adminUnit: {
          id: administrativeUnits.id,
          name: administrativeUnits.name,
          code: administrativeUnits.code,
          type: administrativeUnits.type,
        },
      })
      .from(implementingAgencies)
      .leftJoin(
        administrativeUnits,
        eq(implementingAgencies.administrativeUnitId, administrativeUnits.id)
      )
      .where(eq(implementingAgencies.id, id))
      .limit(1);

    if (!row) {
      return null;
    }

    let parentAgency: ImplementingAgency | null = null;
    if (row.agency.parentAgencyId) {
      const [parent] = await db
        .select()
        .from(implementingAgencies)
        .where(eq(implementingAgencies.id, row.agency.parentAgencyId))
        .limit(1);
      parentAgency = parent ?? null;
    }

    return {
      ...row.agency,
      parentAgency,
      administrativeUnit: row.adminUnit?.id ? row.adminUnit : null,
    };
  }

  /**
   * Finds an agency by its unique code (e.g. 'NHAI').
   */
  async findAgencyByCode(code: string): Promise<ImplementingAgency | null> {
    const [agency] = await db
      .select()
      .from(implementingAgencies)
      .where(eq(implementingAgencies.code, code))
      .limit(1);

    return agency ?? null;
  }

  /**
   * Finds agencies matching filters and pagination.
   */
  async findAgencies(options: AgencyFilterOptions): Promise<AgencyWithRelations[]> {
    const conditions = [];

    if (options.status) {
      conditions.push(eq(implementingAgencies.status, options.status));
    }

    if (options.type) {
      conditions.push(eq(implementingAgencies.agencyType, options.type));
    }

    if (options.search?.trim()) {
      const term = `%${options.search.trim()}%`;
      conditions.push(
        or(
          ilike(implementingAgencies.name, term),
          ilike(implementingAgencies.code, term)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let query = db
      .select({
        agency: implementingAgencies,
        adminUnit: {
          id: administrativeUnits.id,
          name: administrativeUnits.name,
          code: administrativeUnits.code,
          type: administrativeUnits.type,
        },
      })
      .from(implementingAgencies)
      .leftJoin(
        administrativeUnits,
        eq(implementingAgencies.administrativeUnitId, administrativeUnits.id)
      )
      .orderBy(asc(implementingAgencies.name))
      .$dynamic();

    if (whereClause) {
      query = query.where(whereClause);
    }

    if (typeof options.limit === 'number') {
      query = query.limit(options.limit);
    }

    if (typeof options.offset === 'number') {
      query = query.offset(options.offset);
    }

    const rows = await query;

    return rows.map((r) => ({
      ...r.agency,
      administrativeUnit: r.adminUnit?.id ? r.adminUnit : null,
    }));
  }

  /**
   * Counts agencies matching criteria.
   */
  async countAgencies(options: AgencyFilterOptions): Promise<number> {
    const conditions = [];

    if (options.status) {
      conditions.push(eq(implementingAgencies.status, options.status));
    }

    if (options.type) {
      conditions.push(eq(implementingAgencies.agencyType, options.type));
    }

    if (options.search?.trim()) {
      const term = `%${options.search.trim()}%`;
      conditions.push(
        or(
          ilike(implementingAgencies.name, term),
          ilike(implementingAgencies.code, term)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(implementingAgencies)
      .where(whereClause);

    return Number(result?.count ?? 0);
  }

  /**
   * Retrieves child agencies for a given parent agency.
   */
  async findChildAgencies(parentAgencyId: string): Promise<ImplementingAgency[]> {
    return db
      .select()
      .from(implementingAgencies)
      .where(eq(implementingAgencies.parentAgencyId, parentAgencyId))
      .orderBy(asc(implementingAgencies.name));
  }
}

export const implementingAgencyRepository = new ImplementingAgencyRepository();
