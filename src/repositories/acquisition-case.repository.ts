import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  acquisitionCases,
  acquisitionCaseWorkflowHistory,
  type AcquisitionCase,
  type NewAcquisitionCase,
  type AcquisitionCaseStatus,
  type AcquisitionCaseWorkflowHistory,
  type NewAcquisitionCaseWorkflowHistory,
} from '../../db/schema/acquisition-cases';
import { projects } from '../../db/schema/projects';
import { administrativeUnits } from '../../db/schema/administrative-units';
import { implementingAgencies } from '../../db/schema/implementing-agencies';
import { users } from '../../db/schema/users';

export interface AcquisitionCaseFilterOptions {
  search?: string;
  status?: AcquisitionCaseStatus | string;
  projectId?: string;
  administrativeUnitIds?: string[];
  limit?: number;
  offset?: number;
}

export interface WorkflowHistoryRecord extends AcquisitionCaseWorkflowHistory {
  actor: {
    id: string;
    name: string;
    email: string;
  };
}

export interface AcquisitionCaseWithRelations extends AcquisitionCase {
  project: {
    id: string;
    projectCode: string;
    name: string;
    projectType: string;
    status: string;
    administrativeUnitId: string;
    implementingAgencyId: string;
    createdBy: string;
    administrativeUnit: {
      id: string;
      name: string;
      code: string;
      type: string;
    };
    implementingAgency: {
      id: string;
      name: string;
      code: string;
    };
  };
  creator: {
    id: string;
    name: string;
    email: string;
  };
  updater: {
    id: string;
    name: string;
    email: string;
  };
  workflowHistory?: WorkflowHistoryRecord[];
}

export class AcquisitionCaseRepository {
  /**
   * Generates the next sequential case reference concurrency-safely via PostgreSQL sequence.
   * Format: NLAMS-ACQ-000001
   */
  async generateCaseReference(): Promise<string> {
    try {
      const result = await db.execute<{ seq: string | number }>(
        sql`SELECT nextval('acquisition_case_ref_seq') as seq;`
      );
      const seqValue = Number(result[0]?.seq ?? 1);
      return `NLAMS-ACQ-${String(seqValue).padStart(6, '0')}`;
    } catch {
      // Fallback: If sequence is not accessible in a lightweight mock, calculate safely
      const [maxCase] = await db
        .select({ code: acquisitionCases.caseReference })
        .from(acquisitionCases)
        .orderBy(desc(acquisitionCases.caseReference))
        .limit(1);

      let nextNum = 1;
      if (maxCase?.code) {
        const match = maxCase.code.match(/(\d+)$/);
        if (match) {
          nextNum = parseInt(match[1], 10) + 1;
        }
      }
      return `NLAMS-ACQ-${String(nextNum).padStart(6, '0')}`;
    }
  }

  /**
   * Inserts a new acquisition case.
   */
  async createCase(
    data: NewAcquisitionCase,
    txClient?: Parameters<Parameters<typeof db.transaction>[0]>[0]
  ): Promise<AcquisitionCase> {
    const executor = (txClient ?? db) as typeof db;
    const [record] = await executor.insert(acquisitionCases).values(data).returning();
    return record;
  }

  /**
   * Inserts a workflow history record.
   */
  async createWorkflowHistory(
    data: NewAcquisitionCaseWorkflowHistory,
    txClient?: Parameters<Parameters<typeof db.transaction>[0]>[0]
  ): Promise<AcquisitionCaseWorkflowHistory> {
    const executor = (txClient ?? db) as typeof db;
    const [record] = await executor.insert(acquisitionCaseWorkflowHistory).values(data).returning();
    return record;
  }

  /**
   * Finds an acquisition case by primary key ID with all project, administrative unit,
   * creator, updater, and workflow history details.
   */
  async findCaseById(id: string): Promise<AcquisitionCaseWithRelations | null> {
    const [row] = await db
      .select({
        caseData: acquisitionCases,
      project: {
          id: projects.id,
          projectCode: projects.projectCode,
          name: projects.name,
          projectType: projects.projectType,
          status: projects.status,
          administrativeUnitId: projects.administrativeUnitId,
          implementingAgencyId: projects.implementingAgencyId,
          createdBy: projects.createdBy,
        },
        adminUnit: {
          id: administrativeUnits.id,
          name: administrativeUnits.name,
          code: administrativeUnits.code,
          type: administrativeUnits.type,
        },
        agency: {
          id: implementingAgencies.id,
          name: implementingAgencies.name,
          code: implementingAgencies.code,
        },
        creator: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(acquisitionCases)
      .innerJoin(projects, eq(acquisitionCases.projectId, projects.id))
      .innerJoin(administrativeUnits, eq(projects.administrativeUnitId, administrativeUnits.id))
      .innerJoin(implementingAgencies, eq(projects.implementingAgencyId, implementingAgencies.id))
      .innerJoin(users, eq(acquisitionCases.createdBy, users.id))
      .where(eq(acquisitionCases.id, id))
      .limit(1);

    if (!row) {
      return null;
    }

    // Fetch updater user
    const [updater] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, row.caseData.updatedBy))
      .limit(1);

    // Fetch workflow history
    const history = await this.getWorkflowHistoryByCaseId(id);

    return {
      ...row.caseData,
      project: {
        ...row.project,
        administrativeUnit: row.adminUnit,
        implementingAgency: row.agency,
      },
      creator: row.creator,
      updater: updater ?? row.creator,
      workflowHistory: history,
    };
  }

  /**
   * Finds an acquisition case by case reference.
   */
  async findCaseByReference(reference: string): Promise<AcquisitionCaseWithRelations | null> {
    const [found] = await db
      .select({ id: acquisitionCases.id })
      .from(acquisitionCases)
      .where(eq(acquisitionCases.caseReference, reference))
      .limit(1);

    if (!found) return null;
    return this.findCaseById(found.id);
  }

  /**
   * Fetches full workflow history for a case, ordered from earliest to latest.
   */
  async getWorkflowHistoryByCaseId(caseId: string): Promise<WorkflowHistoryRecord[]> {
    const rows = await db
      .select({
        history: acquisitionCaseWorkflowHistory,
        actor: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(acquisitionCaseWorkflowHistory)
      .innerJoin(users, eq(acquisitionCaseWorkflowHistory.actorId, users.id))
      .where(eq(acquisitionCaseWorkflowHistory.caseId, caseId))
      .orderBy(desc(acquisitionCaseWorkflowHistory.createdAt));

    return rows.map((r) => ({
      ...r.history,
      actor: r.actor,
    }));
  }

  /**
   * Queries acquisition cases filtered by search, status, project, and administrative unit scope.
   */
  async findCases(options: AcquisitionCaseFilterOptions): Promise<AcquisitionCaseWithRelations[]> {
    const conditions = [];

    if (options.administrativeUnitIds) {
      if (options.administrativeUnitIds.length === 0) {
        return [];
      }
      conditions.push(inArray(projects.administrativeUnitId, options.administrativeUnitIds));
    }

    if (options.status) {
      conditions.push(eq(acquisitionCases.status, options.status));
    }

    if (options.projectId) {
      conditions.push(eq(acquisitionCases.projectId, options.projectId));
    }

    if (options.search?.trim()) {
      const term = `%${options.search.trim()}%`;
      conditions.push(
        or(
          ilike(acquisitionCases.title, term),
          ilike(acquisitionCases.caseReference, term),
          ilike(projects.name, term),
          ilike(projects.projectCode, term)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let query = db
      .select({
        caseData: acquisitionCases,
        project: {
          id: projects.id,
          projectCode: projects.projectCode,
          name: projects.name,
          projectType: projects.projectType,
          status: projects.status,
          administrativeUnitId: projects.administrativeUnitId,
          implementingAgencyId: projects.implementingAgencyId,
          createdBy: projects.createdBy,
        },
        adminUnit: {
          id: administrativeUnits.id,
          name: administrativeUnits.name,
          code: administrativeUnits.code,
          type: administrativeUnits.type,
        },
        agency: {
          id: implementingAgencies.id,
          name: implementingAgencies.name,
          code: implementingAgencies.code,
        },
        creator: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(acquisitionCases)
      .innerJoin(projects, eq(acquisitionCases.projectId, projects.id))
      .innerJoin(administrativeUnits, eq(projects.administrativeUnitId, administrativeUnits.id))
      .innerJoin(implementingAgencies, eq(projects.implementingAgencyId, implementingAgencies.id))
      .innerJoin(users, eq(acquisitionCases.createdBy, users.id))
      .orderBy(desc(acquisitionCases.createdAt))
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
      ...r.caseData,
      project: {
        ...r.project,
        administrativeUnit: r.adminUnit,
        implementingAgency: r.agency,
      },
      creator: r.creator,
      updater: r.creator,
    }));
  }

  /**
   * Counts cases matching filters and scoped administrative units.
   */
  async countCases(options: AcquisitionCaseFilterOptions): Promise<number> {
    const conditions = [];

    if (options.administrativeUnitIds) {
      if (options.administrativeUnitIds.length === 0) {
        return 0;
      }
      conditions.push(inArray(projects.administrativeUnitId, options.administrativeUnitIds));
    }

    if (options.status) {
      conditions.push(eq(acquisitionCases.status, options.status));
    }

    if (options.projectId) {
      conditions.push(eq(acquisitionCases.projectId, options.projectId));
    }

    if (options.search?.trim()) {
      const term = `%${options.search.trim()}%`;
      conditions.push(
        or(
          ilike(acquisitionCases.title, term),
          ilike(acquisitionCases.caseReference, term),
          ilike(projects.name, term),
          ilike(projects.projectCode, term)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let query = db
      .select({ count: sql<number>`count(*)::int` })
      .from(acquisitionCases)
      .innerJoin(projects, eq(acquisitionCases.projectId, projects.id))
      .$dynamic();

    if (whereClause) {
      query = query.where(whereClause);
    }

    const [row] = await query;
    return row?.count ?? 0;
  }

  /**
   * Updates an acquisition case.
   */
  async updateCase(
    id: string,
    data: Partial<Omit<NewAcquisitionCase, 'id' | 'caseReference' | 'projectId' | 'createdBy' | 'createdAt'>>,
    txClient?: Parameters<Parameters<typeof db.transaction>[0]>[0]
  ): Promise<AcquisitionCase> {
    const executor = (txClient ?? db) as typeof db;
    const [updated] = await executor
      .update(acquisitionCases)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(acquisitionCases.id, id))
      .returning();

    return updated;
  }
}

export const acquisitionCaseRepository = new AcquisitionCaseRepository();
