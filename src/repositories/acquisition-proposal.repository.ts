import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  acquisitionProposals,
  acquisitionProposalVersions,
  acquisitionProposalWorkflowHistory,
  type AcquisitionProposal,
  type NewAcquisitionProposal,
  type AcquisitionProposalVersion,
  type NewAcquisitionProposalVersion,
  type AcquisitionProposalWorkflowHistory,
  type NewAcquisitionProposalWorkflowHistory,
} from '../../db/schema/acquisition-proposals';
import { acquisitionCases } from '../../db/schema/acquisition-cases';
import { projects } from '../../db/schema/projects';
import { implementingAgencies } from '../../db/schema/implementing-agencies';
import { verifiedLandInventories } from '../../db/schema/verified-land-inventories';
import { administrativeUnits } from '../../db/schema/administrative-units';
import { users } from '../../db/schema/users';

type TransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface ProposalFilterOptions {
  search?: string;
  status?: string;
  projectId?: string;
  acquisitionCaseId?: string;
  scopedUnitIds?: string[];
  limit?: number;
  offset?: number;
}

export interface ProposalListItem {
  id: string;
  proposalNumber: string;
  acquisitionCaseId: string;
  projectId: string;
  implementingAgencyId: string;
  createdBy: string;
  linkedInventoryId: string;
  linkedInventoryVersionId: string;
  currentVersionId: string | null;
  currentVersionNumber: number;
  currentStatus: string;
  createdAt: Date;
  updatedAt: Date;
  project: {
    id: string;
    projectCode: string;
    name: string;
    administrativeUnitId: string;
  };
  acquisitionCase: {
    id: string;
    caseReference: string;
    title: string;
    status: string;
  };
  implementingAgency: {
    id: string;
    name: string;
    code: string;
  };
  creator: {
    id: string;
    name: string;
    email: string;
  };
}

export interface ProposalWithDetails extends AcquisitionProposal {
  project: {
    id: string;
    projectCode: string;
    name: string;
    projectType: string;
    implementingAgencyId: string;
    administrativeUnitId: string;
    administrativeUnit: {
      id: string;
      name: string;
      code: string;
      type: string;
    };
  };
  implementingAgency: {
    id: string;
    name: string;
    code: string;
    agencyType: string;
  };
  acquisitionCase: {
    id: string;
    caseReference: string;
    title: string;
    status: string;
    projectId: string;
  };
  creator: {
    id: string;
    name: string;
    email: string;
  };
  linkedInventory: {
    id: string;
    caseId: string;
    versionNumber: number;
    status: string;
    totalParcelCount: number;
    aggregateRecordedArea: string;
    aggregateAffectedArea: string;
    areaUnit: string;
    generatedAt: Date;
    reviewedAt: Date | null;
  };
  currentVersion: AcquisitionProposalVersion | null;
  workflowHistory: (AcquisitionProposalWorkflowHistory & {
    actor: {
      id: string;
      name: string;
      email: string;
    };
  })[];
}

export class AcquisitionProposalRepository {
  /**
   * Generates the next sequential proposal number concurrency-safely via sequence.
   * Format: NLAMS-PROP-000001
   */
  async generateProposalNumber(): Promise<string> {
    try {
      const result = await db.execute<{ seq: string | number }>(
        sql`SELECT nextval('acquisition_proposal_ref_seq') as seq;`
      );
      const seqValue = Number(result[0]?.seq ?? 1);
      return `NLAMS-PROP-${String(seqValue).padStart(6, '0')}`;
    } catch {
      // Fallback: Safe query from existing table
      const [maxProposal] = await db
        .select({ code: acquisitionProposals.proposalNumber })
        .from(acquisitionProposals)
        .orderBy(desc(acquisitionProposals.proposalNumber))
        .limit(1);

      let nextNum = 1;
      if (maxProposal?.code) {
        const match = maxProposal.code.match(/(\d+)$/);
        if (match) {
          nextNum = parseInt(match[1], 10) + 1;
        }
      }
      return `NLAMS-PROP-${String(nextNum).padStart(6, '0')}`;
    }
  }

  /**
   * Creates a new acquisition proposal header.
   */
  async createProposal(
    data: NewAcquisitionProposal,
    txClient?: TransactionClient
  ): Promise<AcquisitionProposal> {
    const executor = (txClient ?? db) as typeof db;
    const [inserted] = await executor
      .insert(acquisitionProposals)
      .values(data)
      .returning();
    return inserted;
  }

  /**
   * Creates an acquisition proposal version record.
   */
  async createProposalVersion(
    data: NewAcquisitionProposalVersion,
    txClient?: TransactionClient
  ): Promise<AcquisitionProposalVersion> {
    const executor = (txClient ?? db) as typeof db;
    const [inserted] = await executor
      .insert(acquisitionProposalVersions)
      .values(data)
      .returning();
    return inserted;
  }

  /**
   * Updates an acquisition proposal header.
   */
  async updateProposal(
    id: string,
    data: Partial<NewAcquisitionProposal>,
    txClient?: TransactionClient
  ): Promise<AcquisitionProposal | null> {
    const executor = (txClient ?? db) as typeof db;
    const [updated] = await executor
      .update(acquisitionProposals)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(acquisitionProposals.id, id))
      .returning();
    return updated ?? null;
  }

  /**
   * Updates an acquisition proposal version.
   */
  async updateProposalVersion(
    id: string,
    data: Partial<NewAcquisitionProposalVersion>,
    txClient?: TransactionClient
  ): Promise<AcquisitionProposalVersion | null> {
    const executor = (txClient ?? db) as typeof db;
    const [updated] = await executor
      .update(acquisitionProposalVersions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(acquisitionProposalVersions.id, id))
      .returning();
    return updated ?? null;
  }

  /**
   * Records a workflow history event.
   */
  async createWorkflowHistory(
    data: NewAcquisitionProposalWorkflowHistory,
    txClient?: TransactionClient
  ): Promise<AcquisitionProposalWorkflowHistory> {
    const executor = (txClient ?? db) as typeof db;
    const [inserted] = await executor
      .insert(acquisitionProposalWorkflowHistory)
      .values(data)
      .returning();
    return inserted;
  }

  /**
   * Finds a proposal by its ID with complete relations.
   */
  async findProposalById(
    id: string,
    txClient?: TransactionClient
  ): Promise<ProposalWithDetails | null> {
    const executor = (txClient ?? db) as typeof db;

    const [header] = await executor
      .select()
      .from(acquisitionProposals)
      .where(eq(acquisitionProposals.id, id))
      .limit(1);

    if (!header) {
      return null;
    }

    // Project & Administrative Unit
    const [projectData] = await executor
      .select({
        id: projects.id,
        projectCode: projects.projectCode,
        name: projects.name,
        projectType: projects.projectType,
        implementingAgencyId: projects.implementingAgencyId,
        administrativeUnitId: projects.administrativeUnitId,
        adminUnitId: administrativeUnits.id,
        adminUnitName: administrativeUnits.name,
        adminUnitCode: administrativeUnits.code,
        adminUnitType: administrativeUnits.type,
      })
      .from(projects)
      .innerJoin(
        administrativeUnits,
        eq(projects.administrativeUnitId, administrativeUnits.id)
      )
      .where(eq(projects.id, header.projectId))
      .limit(1);

    // Implementing Agency
    const [agency] = await executor
      .select({
        id: implementingAgencies.id,
        name: implementingAgencies.name,
        code: implementingAgencies.code,
        agencyType: implementingAgencies.agencyType,
      })
      .from(implementingAgencies)
      .where(eq(implementingAgencies.id, header.implementingAgencyId))
      .limit(1);

    // Acquisition Case
    const [acqCase] = await executor
      .select({
        id: acquisitionCases.id,
        caseReference: acquisitionCases.caseReference,
        title: acquisitionCases.title,
        status: acquisitionCases.status,
        projectId: acquisitionCases.projectId,
      })
      .from(acquisitionCases)
      .where(eq(acquisitionCases.id, header.acquisitionCaseId))
      .limit(1);

    // Creator
    const [creator] = await executor
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, header.createdBy))
      .limit(1);

    // Linked Inventory
    const [inventory] = await executor
      .select({
        id: verifiedLandInventories.id,
        caseId: verifiedLandInventories.caseId,
        versionNumber: verifiedLandInventories.versionNumber,
        status: verifiedLandInventories.status,
        totalParcelCount: verifiedLandInventories.totalParcelCount,
        aggregateRecordedArea: verifiedLandInventories.aggregateRecordedArea,
        aggregateAffectedArea: verifiedLandInventories.aggregateAffectedArea,
        areaUnit: verifiedLandInventories.areaUnit,
        generatedAt: verifiedLandInventories.generatedAt,
        reviewedAt: verifiedLandInventories.reviewedAt,
      })
      .from(verifiedLandInventories)
      .where(eq(verifiedLandInventories.id, header.linkedInventoryId))
      .limit(1);

    // Fetch current version
    let currentVersion: AcquisitionProposalVersion | null = null;
    if (header.currentVersionId) {
      const [ver] = await executor
        .select()
        .from(acquisitionProposalVersions)
        .where(eq(acquisitionProposalVersions.id, header.currentVersionId))
        .limit(1);
      currentVersion = ver ?? null;
    } else {
      const [ver] = await executor
        .select()
        .from(acquisitionProposalVersions)
        .where(
          and(
            eq(acquisitionProposalVersions.proposalId, id),
            eq(
              acquisitionProposalVersions.versionNumber,
              header.currentVersionNumber
            )
          )
        )
        .limit(1);
      currentVersion = ver ?? null;
    }

    // Fetch workflow history
    const historyRows = await executor
      .select({
        history: acquisitionProposalWorkflowHistory,
        actor: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(acquisitionProposalWorkflowHistory)
      .innerJoin(users, eq(acquisitionProposalWorkflowHistory.actorId, users.id))
      .where(eq(acquisitionProposalWorkflowHistory.proposalId, id))
      .orderBy(desc(acquisitionProposalWorkflowHistory.createdAt));

    const workflowHistory = historyRows.map((h) => ({
      ...h.history,
      actor: h.actor,
    }));

    return {
      ...header,
      project: {
        id: projectData.id,
        projectCode: projectData.projectCode,
        name: projectData.name,
        projectType: projectData.projectType,
        implementingAgencyId: projectData.implementingAgencyId,
        administrativeUnitId: projectData.administrativeUnitId,
        administrativeUnit: {
          id: projectData.adminUnitId,
          name: projectData.adminUnitName,
          code: projectData.adminUnitCode,
          type: projectData.adminUnitType,
        },
      },
      implementingAgency: agency,
      acquisitionCase: acqCase,
      creator,
      linkedInventory: inventory,
      currentVersion,
      workflowHistory,
    };
  }

  /**
   * Finds proposal for row locking in transactions.
   */
  async findProposalForUpdate(
    id: string,
    txClient: TransactionClient
  ): Promise<AcquisitionProposal | null> {
    const [row] = await txClient
      .select()
      .from(acquisitionProposals)
      .where(eq(acquisitionProposals.id, id))
      .for('update')
      .limit(1);
    return row ?? null;
  }

  /**
   * Finds an acquisition proposal by acquisition case ID.
   */
  async findProposalByCaseId(
    caseId: string,
    txClient?: TransactionClient
  ): Promise<AcquisitionProposal | null> {
    const executor = (txClient ?? db) as typeof db;
    const [proposal] = await executor
      .select()
      .from(acquisitionProposals)
      .where(eq(acquisitionProposals.acquisitionCaseId, caseId))
      .limit(1);
    return proposal ?? null;
  }

  /**
   * Retrieves a paginated list of proposals.
   * Returns one row per proposal (never duplicates per version).
   */
  async findProposals(
    options: ProposalFilterOptions = {}
  ): Promise<ProposalListItem[]> {
    const conditions = [];

    if (options.status) {
      conditions.push(eq(acquisitionProposals.currentStatus, options.status));
    }

    if (options.projectId) {
      conditions.push(eq(acquisitionProposals.projectId, options.projectId));
    }

    if (options.acquisitionCaseId) {
      conditions.push(
        eq(acquisitionProposals.acquisitionCaseId, options.acquisitionCaseId)
      );
    }

    if (options.scopedUnitIds && options.scopedUnitIds.length > 0) {
      conditions.push(
        inArray(projects.administrativeUnitId, options.scopedUnitIds)
      );
    }

    if (options.search && options.search.trim()) {
      const term = `%${options.search.trim()}%`;
      conditions.push(
        or(
          ilike(acquisitionProposals.proposalNumber, term),
          ilike(acquisitionCases.caseReference, term),
          ilike(acquisitionCases.title, term),
          ilike(projects.name, term),
          ilike(projects.projectCode, term)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let query = db
      .select({
        id: acquisitionProposals.id,
        proposalNumber: acquisitionProposals.proposalNumber,
        acquisitionCaseId: acquisitionProposals.acquisitionCaseId,
        projectId: acquisitionProposals.projectId,
        implementingAgencyId: acquisitionProposals.implementingAgencyId,
        createdBy: acquisitionProposals.createdBy,
        linkedInventoryId: acquisitionProposals.linkedInventoryId,
        linkedInventoryVersionId: acquisitionProposals.linkedInventoryVersionId,
        currentVersionId: acquisitionProposals.currentVersionId,
        currentVersionNumber: acquisitionProposals.currentVersionNumber,
        currentStatus: acquisitionProposals.currentStatus,
        createdAt: acquisitionProposals.createdAt,
        updatedAt: acquisitionProposals.updatedAt,
        project: {
          id: projects.id,
          projectCode: projects.projectCode,
          name: projects.name,
          administrativeUnitId: projects.administrativeUnitId,
        },
        acquisitionCase: {
          id: acquisitionCases.id,
          caseReference: acquisitionCases.caseReference,
          title: acquisitionCases.title,
          status: acquisitionCases.status,
        },
        implementingAgency: {
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
      .from(acquisitionProposals)
      .innerJoin(projects, eq(acquisitionProposals.projectId, projects.id))
      .innerJoin(
        acquisitionCases,
        eq(acquisitionProposals.acquisitionCaseId, acquisitionCases.id)
      )
      .innerJoin(
        implementingAgencies,
        eq(acquisitionProposals.implementingAgencyId, implementingAgencies.id)
      )
      .innerJoin(users, eq(acquisitionProposals.createdBy, users.id))
      .orderBy(desc(acquisitionProposals.createdAt))
      .$dynamic();

    if (whereClause) {
      query = query.where(whereClause);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.offset(options.offset);
    }

    return query;
  }

  /**
   * Counts proposals matching filters.
   */
  async countProposals(options: ProposalFilterOptions = {}): Promise<number> {
    const conditions = [];

    if (options.status) {
      conditions.push(eq(acquisitionProposals.currentStatus, options.status));
    }

    if (options.projectId) {
      conditions.push(eq(acquisitionProposals.projectId, options.projectId));
    }

    if (options.acquisitionCaseId) {
      conditions.push(
        eq(acquisitionProposals.acquisitionCaseId, options.acquisitionCaseId)
      );
    }

    if (options.scopedUnitIds && options.scopedUnitIds.length > 0) {
      conditions.push(
        inArray(projects.administrativeUnitId, options.scopedUnitIds)
      );
    }

    if (options.search && options.search.trim()) {
      const term = `%${options.search.trim()}%`;
      conditions.push(
        or(
          ilike(acquisitionProposals.proposalNumber, term),
          ilike(acquisitionCases.caseReference, term),
          ilike(acquisitionCases.title, term),
          ilike(projects.name, term),
          ilike(projects.projectCode, term)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let query = db
      .select({ count: sql<number>`count(*)::int` })
      .from(acquisitionProposals)
      .innerJoin(projects, eq(acquisitionProposals.projectId, projects.id))
      .innerJoin(
        acquisitionCases,
        eq(acquisitionProposals.acquisitionCaseId, acquisitionCases.id)
      )
      .$dynamic();

    if (whereClause) {
      query = query.where(whereClause);
    }

    const [row] = await query;
    return row?.count ?? 0;
  }
}

export const acquisitionProposalRepository = new AcquisitionProposalRepository();
