import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  acquisitionProposals,
  acquisitionProposalVersions,
  acquisitionProposalWorkflowHistory,
  proposalScrutinyObservations,
  proposalScrutinyDecisions,
  type AcquisitionProposal,
  type NewAcquisitionProposal,
  type AcquisitionProposalVersion,
  type NewAcquisitionProposalVersion,
  type AcquisitionProposalWorkflowHistory,
  type NewAcquisitionProposalWorkflowHistory,
  type ProposalScrutinyObservation,
  type NewProposalScrutinyObservation,
  type ProposalScrutinyDecision,
  type NewProposalScrutinyDecision,
} from '../../db/schema/acquisition-proposals';
import { acquisitionCases } from '../../db/schema/acquisition-cases';
import { projects } from '../../db/schema/projects';
import { implementingAgencies } from '../../db/schema/implementing-agencies';
import { verifiedLandInventories } from '../../db/schema/verified-land-inventories';
import { administrativeUnits } from '../../db/schema/administrative-units';
import { users } from '../../db/schema/users';
import {
  competentAuthorities,
  proposalAuthorityAssignments,
} from '../../db/schema/competent-authorities';

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
  versionCount: number;
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

export interface CompetentAuthorityReviewFilterOptions {
  authorityIds: string[];
  status?: string;
  projectId?: string;
  caseId?: string;
  agencyId?: string;
  submittedFrom?: string;
  submittedTo?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'submissionDate' | 'proposalNumber' | 'status' | 'projectName';
  sortOrder?: 'asc' | 'desc';
}

export interface CompetentAuthorityReviewItem {
  id: string;
  proposalNumber: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  acquisitionCaseId: string;
  acquisitionCaseReference: string;
  acquisitionCaseTitle: string;
  implementingAgencyId: string;
  implementingAgencyName: string;
  implementingAgencyCode: string;
  currentVersionId: string | null;
  versionNumber: number;
  submissionDate: Date | null;
  submittedBy: { id: string; name: string; email: string } | null;
  authorityId: string;
  authorityCode: string;
  authorityName: string;
  authorityDesignation: string;
  authorityLevel: string;
  status: string;
  createdAt: Date;
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
  selectedAuthority?: {
    id: string;
    authorityCode: string;
    authorityName: string;
    designation: string;
    authorityLevel: string;
    status: string;
    assignment?: {
      id: string;
      assignedAt: Date;
      assignedBy: string;
      assignmentStatus: string;
    } | null;
  } | null;
  workflowHistory: (AcquisitionProposalWorkflowHistory & {
    actor: {
      id: string;
      name: string;
      email: string;
    };
  })[];
  observations?: (ProposalScrutinyObservation & {
    author: {
      id: string;
      name: string;
      email: string;
    };
  })[];
  decisions?: (ProposalScrutinyDecision & {
    decider: {
      id: string;
      name: string;
      email: string;
    };
    authority: {
      id: string;
      authorityName: string;
      designation: string;
      authorityCode: string;
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

    // Fetch active authority assignment if present
    let selectedAuthority: ProposalWithDetails['selectedAuthority'] = null;
    if (currentVersion?.id) {
      const [authRow] = await executor
        .select({
          assignment: proposalAuthorityAssignments,
          authority: competentAuthorities,
        })
        .from(proposalAuthorityAssignments)
        .innerJoin(
          competentAuthorities,
          eq(proposalAuthorityAssignments.authorityId, competentAuthorities.id)
        )
        .where(
          and(
            eq(proposalAuthorityAssignments.proposalVersionId, currentVersion.id),
            eq(proposalAuthorityAssignments.assignmentStatus, 'ACTIVE')
          )
        )
        .orderBy(desc(proposalAuthorityAssignments.assignedAt))
        .limit(1);

      if (authRow) {
        selectedAuthority = {
          id: authRow.authority.id,
          authorityCode: authRow.authority.authorityCode,
          authorityName: authRow.authority.authorityName,
          designation: authRow.authority.designation,
          authorityLevel: authRow.authority.authorityLevel,
          status: authRow.authority.status,
          assignment: {
            id: authRow.assignment.id,
            assignedAt: authRow.assignment.assignedAt,
            assignedBy: authRow.assignment.assignedBy,
            assignmentStatus: authRow.assignment.assignmentStatus,
          },
        };
      } else if (currentVersion.selectedAuthorityId) {
        const [auth] = await executor
          .select()
          .from(competentAuthorities)
          .where(eq(competentAuthorities.id, currentVersion.selectedAuthorityId))
          .limit(1);
        if (auth) {
          selectedAuthority = {
            id: auth.id,
            authorityCode: auth.authorityCode,
            authorityName: auth.authorityName,
            designation: auth.designation,
            authorityLevel: auth.authorityLevel,
            status: auth.status,
            assignment: null,
          };
        }
      }
    }

    // Fetch scrutiny observations
    const observationRows = await executor
      .select({
        observation: proposalScrutinyObservations,
        author: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(proposalScrutinyObservations)
      .innerJoin(users, eq(proposalScrutinyObservations.createdBy, users.id))
      .where(eq(proposalScrutinyObservations.proposalId, id))
      .orderBy(desc(proposalScrutinyObservations.createdAt));

    const observations = observationRows.map((o) => ({
      ...o.observation,
      author: o.author,
    }));

    // Fetch scrutiny decisions
    const decisionRows = await executor
      .select({
        decision: proposalScrutinyDecisions,
        decider: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
        authority: {
          id: competentAuthorities.id,
          authorityName: competentAuthorities.authorityName,
          designation: competentAuthorities.designation,
          authorityCode: competentAuthorities.authorityCode,
        },
      })
      .from(proposalScrutinyDecisions)
      .innerJoin(users, eq(proposalScrutinyDecisions.decidedBy, users.id))
      .innerJoin(
        competentAuthorities,
        eq(proposalScrutinyDecisions.competentAuthorityId, competentAuthorities.id)
      )
      .where(eq(proposalScrutinyDecisions.proposalId, id))
      .orderBy(desc(proposalScrutinyDecisions.decidedAt));

    const decisions = decisionRows.map((d) => ({
      ...d.decision,
      decider: d.decider,
      authority: d.authority,
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
      selectedAuthority,
      workflowHistory,
      observations,
      decisions,
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
        versionCount: sql<number>`(SELECT count(*)::int FROM acquisition_proposal_versions WHERE acquisition_proposal_versions.proposal_id = ${acquisitionProposals.id})`,
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

  /**
   * Retrieves all versions for a proposal, sorted by version number.
   */
  async findProposalVersions(
    proposalId: string,
    txClient?: TransactionClient
  ): Promise<
    (AcquisitionProposalVersion & {
      creator: { id: string; name: string; email: string };
      submitter?: { id: string; name: string; email: string } | null;
      reviewer?: { id: string; name: string; email: string } | null;
    })[]
  > {
    const executor = (txClient ?? db) as typeof db;

    const versions = await executor
      .select()
      .from(acquisitionProposalVersions)
      .where(eq(acquisitionProposalVersions.proposalId, proposalId))
      .orderBy(desc(acquisitionProposalVersions.versionNumber));

    if (versions.length === 0) return [];

    // Collect all unique user IDs across versions to eliminate N+1 queries
    const userIdSet = new Set<string>();
    for (const v of versions) {
      if (v.createdBy) userIdSet.add(v.createdBy);
      if (v.submittedBy) userIdSet.add(v.submittedBy);
      if (v.reviewedBy) userIdSet.add(v.reviewedBy);
    }

    const userMap = new Map<string, { id: string; name: string; email: string }>();
    if (userIdSet.size > 0) {
      const userRows = await executor
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(inArray(users.id, Array.from(userIdSet)));
      for (const u of userRows) {
        userMap.set(u.id, u);
      }
    }

    return versions.map((v) => ({
      ...v,
      creator: userMap.get(v.createdBy) ?? { id: v.createdBy, name: 'Unknown', email: '' },
      submitter: v.submittedBy ? userMap.get(v.submittedBy) ?? null : null,
      reviewer: v.reviewedBy ? userMap.get(v.reviewedBy) ?? null : null,
    }));
  }

  /**
   * Finds a specific version by its version ID.
   */
  async findProposalVersionById(
    versionId: string,
    txClient?: TransactionClient
  ): Promise<
    | (AcquisitionProposalVersion & {
        creator: { id: string; name: string; email: string };
        submitter?: { id: string; name: string; email: string } | null;
        reviewer?: { id: string; name: string; email: string } | null;
      })
    | null
  > {
    const executor = (txClient ?? db) as typeof db;

    const [ver] = await executor
      .select()
      .from(acquisitionProposalVersions)
      .where(eq(acquisitionProposalVersions.id, versionId))
      .limit(1);

    if (!ver) return null;

    const [creator] = await executor
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, ver.createdBy))
      .limit(1);

    let submitter = null;
    if (ver.submittedBy) {
      const [sub] = await executor
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, ver.submittedBy))
        .limit(1);
      submitter = sub ?? null;
    }

    let reviewer = null;
    if (ver.reviewedBy) {
      const [rev] = await executor
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, ver.reviewedBy))
        .limit(1);
      reviewer = rev ?? null;
    }

    return {
      ...ver,
      creator: creator ?? { id: ver.createdBy, name: 'Unknown', email: '' },
      submitter,
      reviewer,
    };
  }

  /**
   * Finds a specific version by proposal ID and version number.
   */
  async findProposalVersionByNumber(
    proposalId: string,
    versionNumber: number,
    txClient?: TransactionClient
  ): Promise<
    | (AcquisitionProposalVersion & {
        creator: { id: string; name: string; email: string };
        submitter?: { id: string; name: string; email: string } | null;
        reviewer?: { id: string; name: string; email: string } | null;
      })
    | null
  > {
    const executor = (txClient ?? db) as typeof db;

    const [ver] = await executor
      .select()
      .from(acquisitionProposalVersions)
      .where(
        and(
          eq(acquisitionProposalVersions.proposalId, proposalId),
          eq(acquisitionProposalVersions.versionNumber, versionNumber)
        )
      )
      .limit(1);

    if (!ver) return null;

    const [creator] = await executor
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, ver.createdBy))
      .limit(1);

    let submitter = null;
    if (ver.submittedBy) {
      const [sub] = await executor
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, ver.submittedBy))
        .limit(1);
      submitter = sub ?? null;
    }

    let reviewer = null;
    if (ver.reviewedBy) {
      const [rev] = await executor
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, ver.reviewedBy))
        .limit(1);
      reviewer = rev ?? null;
    }

    return {
      ...ver,
      creator: creator ?? { id: ver.createdBy, name: 'Unknown', email: '' },
      submitter,
      reviewer,
    };
  }

  /**
   * Gets the highest version number recorded for a proposal.
   */
  async getMaxVersionNumber(
    proposalId: string,
    txClient?: TransactionClient
  ): Promise<number> {
    const executor = (txClient ?? db) as typeof db;
    const [row] = await executor
      .select({ maxVer: sql<number>`max(${acquisitionProposalVersions.versionNumber})::int` })
      .from(acquisitionProposalVersions)
      .where(eq(acquisitionProposalVersions.proposalId, proposalId));
    return row?.maxVer ?? 0;
  }

  /**
   * Retrieves proposals submitted to Competent Authorities for scrutiny review.
   * Only includes proposals assigned to the specified authorityIds.
   */
  async findProposalsForCompetentAuthorityReview(
    options: CompetentAuthorityReviewFilterOptions
  ): Promise<CompetentAuthorityReviewItem[]> {
    if (!options.authorityIds || options.authorityIds.length === 0) {
      return [];
    }

    const conditions = [
      inArray(competentAuthorities.id, options.authorityIds),
      eq(proposalAuthorityAssignments.assignmentStatus, 'ACTIVE'),
    ];

    if (options.status) {
      conditions.push(eq(acquisitionProposals.currentStatus, options.status));
    }

    if (options.projectId) {
      conditions.push(eq(acquisitionProposals.projectId, options.projectId));
    }

    if (options.caseId) {
      conditions.push(eq(acquisitionProposals.acquisitionCaseId, options.caseId));
    }

    if (options.agencyId) {
      conditions.push(eq(acquisitionProposals.implementingAgencyId, options.agencyId));
    }

    if (options.submittedFrom) {
      conditions.push(
        sql`${acquisitionProposalVersions.submittedAt} >= ${options.submittedFrom}::timestamptz`
      );
    }

    if (options.submittedTo) {
      conditions.push(
        sql`${acquisitionProposalVersions.submittedAt} <= ${options.submittedTo}::timestamptz`
      );
    }

    if (options.search && options.search.trim()) {
      const term = `%${options.search.trim()}%`;
      const searchClause = or(
        ilike(acquisitionProposals.proposalNumber, term),
        ilike(acquisitionCases.caseReference, term),
        ilike(acquisitionCases.title, term),
        ilike(projects.name, term),
        ilike(projects.projectCode, term),
        ilike(implementingAgencies.name, term)
      );
      if (searchClause) {
        conditions.push(searchClause);
      }
    }

    let orderExpr;
    if (options.sortBy === 'proposalNumber') {
      orderExpr = options.sortOrder === 'asc' ? asc(acquisitionProposals.proposalNumber) : desc(acquisitionProposals.proposalNumber);
    } else if (options.sortBy === 'status') {
      orderExpr = options.sortOrder === 'asc' ? asc(acquisitionProposals.currentStatus) : desc(acquisitionProposals.currentStatus);
    } else if (options.sortBy === 'projectName') {
      orderExpr = options.sortOrder === 'asc' ? asc(projects.name) : desc(projects.name);
    } else {
      orderExpr = options.sortOrder === 'asc' ? asc(acquisitionProposalVersions.submittedAt) : desc(acquisitionProposalVersions.submittedAt);
    }

    let query = db
      .select({
        id: acquisitionProposals.id,
        proposalNumber: acquisitionProposals.proposalNumber,
        projectId: projects.id,
        projectName: projects.name,
        projectCode: projects.projectCode,
        acquisitionCaseId: acquisitionCases.id,
        acquisitionCaseReference: acquisitionCases.caseReference,
        acquisitionCaseTitle: acquisitionCases.title,
        implementingAgencyId: implementingAgencies.id,
        implementingAgencyName: implementingAgencies.name,
        implementingAgencyCode: implementingAgencies.code,
        currentVersionId: acquisitionProposalVersions.id,
        versionNumber: acquisitionProposalVersions.versionNumber,
        submissionDate: acquisitionProposalVersions.submittedAt,
        submittedById: users.id,
        submittedByName: users.name,
        submittedByEmail: users.email,
        authorityId: competentAuthorities.id,
        authorityCode: competentAuthorities.authorityCode,
        authorityName: competentAuthorities.authorityName,
        authorityDesignation: competentAuthorities.designation,
        authorityLevel: competentAuthorities.authorityLevel,
        status: acquisitionProposals.currentStatus,
        createdAt: acquisitionProposals.createdAt,
      })
      .from(acquisitionProposals)
      .innerJoin(
        acquisitionProposalVersions,
        eq(acquisitionProposals.currentVersionId, acquisitionProposalVersions.id)
      )
      .innerJoin(
        proposalAuthorityAssignments,
        eq(proposalAuthorityAssignments.proposalVersionId, acquisitionProposalVersions.id)
      )
      .innerJoin(
        competentAuthorities,
        eq(proposalAuthorityAssignments.authorityId, competentAuthorities.id)
      )
      .innerJoin(projects, eq(acquisitionProposals.projectId, projects.id))
      .innerJoin(acquisitionCases, eq(acquisitionProposals.acquisitionCaseId, acquisitionCases.id))
      .innerJoin(implementingAgencies, eq(acquisitionProposals.implementingAgencyId, implementingAgencies.id))
      .leftJoin(users, eq(acquisitionProposalVersions.submittedBy, users.id))
      .where(and(...conditions))
      .orderBy(orderExpr)
      .$dynamic();

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.offset(options.offset);
    }

    const rows = await query;

    return rows.map((r) => ({
      id: r.id,
      proposalNumber: r.proposalNumber,
      projectId: r.projectId,
      projectName: r.projectName,
      projectCode: r.projectCode,
      acquisitionCaseId: r.acquisitionCaseId,
      acquisitionCaseReference: r.acquisitionCaseReference,
      acquisitionCaseTitle: r.acquisitionCaseTitle,
      implementingAgencyId: r.implementingAgencyId,
      implementingAgencyName: r.implementingAgencyName,
      implementingAgencyCode: r.implementingAgencyCode,
      currentVersionId: r.currentVersionId,
      versionNumber: r.versionNumber,
      submissionDate: r.submissionDate,
      submittedBy: r.submittedById ? { id: r.submittedById, name: r.submittedByName ?? 'Unknown', email: r.submittedByEmail ?? '' } : null,
      authorityId: r.authorityId,
      authorityCode: r.authorityCode,
      authorityName: r.authorityName,
      authorityDesignation: r.authorityDesignation,
      authorityLevel: r.authorityLevel,
      status: r.status,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Counts proposals submitted to Competent Authorities for scrutiny review.
   */
  async countProposalsForCompetentAuthorityReview(
    options: CompetentAuthorityReviewFilterOptions
  ): Promise<number> {
    if (!options.authorityIds || options.authorityIds.length === 0) {
      return 0;
    }

    const conditions = [
      inArray(competentAuthorities.id, options.authorityIds),
      eq(proposalAuthorityAssignments.assignmentStatus, 'ACTIVE'),
    ];

    if (options.status) {
      conditions.push(eq(acquisitionProposals.currentStatus, options.status));
    }

    if (options.projectId) {
      conditions.push(eq(acquisitionProposals.projectId, options.projectId));
    }

    if (options.caseId) {
      conditions.push(eq(acquisitionProposals.acquisitionCaseId, options.caseId));
    }

    if (options.agencyId) {
      conditions.push(eq(acquisitionProposals.implementingAgencyId, options.agencyId));
    }

    if (options.submittedFrom) {
      conditions.push(
        sql`${acquisitionProposalVersions.submittedAt} >= ${options.submittedFrom}::timestamptz`
      );
    }

    if (options.submittedTo) {
      conditions.push(
        sql`${acquisitionProposalVersions.submittedAt} <= ${options.submittedTo}::timestamptz`
      );
    }

    if (options.search && options.search.trim()) {
      const term = `%${options.search.trim()}%`;
      const searchClause = or(
        ilike(acquisitionProposals.proposalNumber, term),
        ilike(acquisitionCases.caseReference, term),
        ilike(acquisitionCases.title, term),
        ilike(projects.name, term),
        ilike(projects.projectCode, term),
        ilike(implementingAgencies.name, term)
      );
      if (searchClause) {
        conditions.push(searchClause);
      }
    }

    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(acquisitionProposals)
      .innerJoin(
        acquisitionProposalVersions,
        eq(acquisitionProposals.currentVersionId, acquisitionProposalVersions.id)
      )
      .innerJoin(
        proposalAuthorityAssignments,
        eq(proposalAuthorityAssignments.proposalVersionId, acquisitionProposalVersions.id)
      )
      .innerJoin(
        competentAuthorities,
        eq(proposalAuthorityAssignments.authorityId, competentAuthorities.id)
      )
      .innerJoin(projects, eq(acquisitionProposals.projectId, projects.id))
      .innerJoin(acquisitionCases, eq(acquisitionProposals.acquisitionCaseId, acquisitionCases.id))
      .innerJoin(implementingAgencies, eq(acquisitionProposals.implementingAgencyId, implementingAgencies.id))
      .where(and(...conditions));

    return row?.count ?? 0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3C: Scrutiny Observations & Decisions Repository Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Inserts a new scrutiny observation record against a proposal version.
   */
  async createScrutinyObservation(
    data: NewProposalScrutinyObservation,
    tx?: TransactionClient
  ): Promise<ProposalScrutinyObservation> {
    const executor = tx ?? db;
    const [inserted] = await executor
      .insert(proposalScrutinyObservations)
      .values(data)
      .returning();
    return inserted;
  }

  /**
   * Finds observations recorded for a proposal, optionally filtered by version.
   */
  async findObservationsByProposalId(
    proposalId: string,
    versionId?: string,
    tx?: TransactionClient
  ): Promise<
    (ProposalScrutinyObservation & {
      author: { id: string; name: string; email: string };
    })[]
  > {
    const executor = tx ?? db;
    const conditions = [eq(proposalScrutinyObservations.proposalId, proposalId)];
    if (versionId) {
      conditions.push(eq(proposalScrutinyObservations.proposalVersionId, versionId));
    }

    const rows = await executor
      .select({
        observation: proposalScrutinyObservations,
        author: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(proposalScrutinyObservations)
      .innerJoin(users, eq(proposalScrutinyObservations.createdBy, users.id))
      .where(and(...conditions))
      .orderBy(desc(proposalScrutinyObservations.createdAt));

    return rows.map((r) => ({
      ...r.observation,
      author: r.author,
    }));
  }

  /**
   * Inserts a new scrutiny decision record against a proposal version.
   */
  async createScrutinyDecision(
    data: NewProposalScrutinyDecision,
    tx?: TransactionClient
  ): Promise<ProposalScrutinyDecision> {
    const executor = tx ?? db;
    const [inserted] = await executor
      .insert(proposalScrutinyDecisions)
      .values(data)
      .returning();
    return inserted;
  }

  /**
   * Finds all scrutiny decisions recorded for a proposal.
   */
  async findDecisionsByProposalId(
    proposalId: string,
    tx?: TransactionClient
  ): Promise<
    (ProposalScrutinyDecision & {
      decider: { id: string; name: string; email: string };
      authority: {
        id: string;
        authorityName: string;
        designation: string;
        authorityCode: string;
      };
    })[]
  > {
    const executor = tx ?? db;
    const rows = await executor
      .select({
        decision: proposalScrutinyDecisions,
        decider: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
        authority: {
          id: competentAuthorities.id,
          authorityName: competentAuthorities.authorityName,
          designation: competentAuthorities.designation,
          authorityCode: competentAuthorities.authorityCode,
        },
      })
      .from(proposalScrutinyDecisions)
      .innerJoin(users, eq(proposalScrutinyDecisions.decidedBy, users.id))
      .innerJoin(
        competentAuthorities,
        eq(proposalScrutinyDecisions.competentAuthorityId, competentAuthorities.id)
      )
      .where(eq(proposalScrutinyDecisions.proposalId, proposalId))
      .orderBy(desc(proposalScrutinyDecisions.decidedAt));

    return rows.map((r) => ({
      ...r.decision,
      decider: r.decider,
      authority: r.authority,
    }));
  }

  /**
   * Finds the scrutiny decision recorded for a specific proposal version.
   */
  async findDecisionByVersionId(
    proposalVersionId: string,
    tx?: TransactionClient
  ): Promise<
    | (ProposalScrutinyDecision & {
        decider: { id: string; name: string; email: string };
        authority: {
          id: string;
          authorityName: string;
          designation: string;
          authorityCode: string;
        };
      })
    | null
  > {
    const executor = tx ?? db;
    const [row] = await executor
      .select({
        decision: proposalScrutinyDecisions,
        decider: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
        authority: {
          id: competentAuthorities.id,
          authorityName: competentAuthorities.authorityName,
          designation: competentAuthorities.designation,
          authorityCode: competentAuthorities.authorityCode,
        },
      })
      .from(proposalScrutinyDecisions)
      .innerJoin(users, eq(proposalScrutinyDecisions.decidedBy, users.id))
      .innerJoin(
        competentAuthorities,
        eq(proposalScrutinyDecisions.competentAuthorityId, competentAuthorities.id)
      )
      .where(eq(proposalScrutinyDecisions.proposalVersionId, proposalVersionId))
      .limit(1);

    if (!row) return null;
    return {
      ...row.decision,
      decider: row.decider,
      authority: row.authority,
    };
  }

  /**
   * Finds workflow audit history for a proposal.
   */
  async findWorkflowHistoryByProposalId(
    proposalId: string,
    tx?: TransactionClient
  ): Promise<
    (AcquisitionProposalWorkflowHistory & {
      actor: { id: string; name: string; email: string };
    })[]
  > {
    const executor = tx ?? db;
    const rows = await executor
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
      .where(eq(acquisitionProposalWorkflowHistory.proposalId, proposalId))
      .orderBy(desc(acquisitionProposalWorkflowHistory.createdAt));

    return rows.map((h) => ({
      ...h.history,
      actor: h.actor,
    }));
  }
}

export const acquisitionProposalRepository = new AcquisitionProposalRepository();
