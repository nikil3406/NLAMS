import { and, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db';
import { parcelDiscrepancies } from '../../db/schema/parcel-discrepancies';
import { discrepancyInvestigations } from '../../db/schema/discrepancy-investigations';
import { discrepancyResolutionHistory } from '../../db/schema/discrepancy-resolution-history';
import {
  fieldVerificationEvidence,
  type FieldVerificationEvidence,
} from '../../db/schema/field-verification-evidence';
import { ConflictError, NotFoundError } from '../types/errors';

export type TransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface DiscrepancyInvestigationWithDetails {
  id: string;
  discrepancyId: string;
  investigatorId: string;
  investigator: {
    id: string;
    name: string;
    email: string;
  };
  findings: string | null;
  notes: string | null;
  status: string;
  startedAt: Date;
  submittedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  evidence: FieldVerificationEvidence[];
}

export interface DiscrepancyResolutionWithDetails {
  id: string;
  discrepancyId: string;
  investigationId: string | null;
  decision: string;
  remarks: string;
  resolvedBy: string;
  resolver: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: Date;
}

export interface DiscrepancyWithDetails {
  id: string;
  caseId: string;
  caseParcelId: string;
  reportId: string;
  reviewId: string | null;
  category: string;
  description: string;
  status: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  parcel: {
    id: string;
    parcelId: string;
    surveyNumber: string;
    subdivisionNumber: string | null;
    village: string;
    taluk: string;
    district: string;
    state: string;
    totalArea: string;
    areaUnit: string;
  };
  case: {
    id: string;
    caseReference: string;
    title: string;
    status: string;
    projectId: string;
  };
  report: {
    id: string;
    outcome: string | null;
    observations: string | null;
    status: string;
    submittedAt: Date | null;
    reviewedAt: Date | null;
    reviewDecision: string | null;
    reviewRemarks: string | null;
    revisionNumber: number;
  };
  creator: {
    id: string;
    name: string;
    email: string;
  };
  investigations: DiscrepancyInvestigationWithDetails[];
  resolutionHistory: DiscrepancyResolutionWithDetails[];
}

export interface CaseDiscrepancyCounts {
  totalDiscrepancies: number;
  openDiscrepancies: number;
  underInvestigationDiscrepancies: number;
  submittedForResolutionDiscrepancies: number;
  resolvedDiscrepancies: number;
}

export class DiscrepancyRepository {
  /**
   * Finds or creates a formal discrepancy record for a triggering report.
   * Prevents duplicate active discrepancy records for the same triggering report.
   */
  async findOrCreateDiscrepancyForReport(
    data: {
      caseId: string;
      caseParcelId: string;
      reportId: string;
      reviewId?: string | null;
      category?: string;
      description: string;
      createdBy: string;
    },
    txClient?: TransactionClient
  ): Promise<DiscrepancyWithDetails> {
    const runInTx = async (tx: TransactionClient) => {
      // 1. Check for existing active discrepancy for this report
      const [existing] = await tx
        .select({ id: parcelDiscrepancies.id })
        .from(parcelDiscrepancies)
        .where(
          and(
            eq(parcelDiscrepancies.reportId, data.reportId),
            sql`${parcelDiscrepancies.status} != 'RESOLVED'`
          )
        )
        .limit(1);

      if (existing) {
        const full = await this.findDiscrepancyById(existing.id, tx);
        if (full) return full;
      }

      // 2. Insert new discrepancy
      const [inserted] = await tx
        .insert(parcelDiscrepancies)
        .values({
          caseId: data.caseId,
          caseParcelId: data.caseParcelId,
          reportId: data.reportId,
          reviewId: data.reviewId ?? null,
          category: data.category ?? 'OTHER',
          description: data.description,
          status: 'OPEN',
          createdBy: data.createdBy,
        })
        .returning();

      const full = await this.findDiscrepancyById(inserted.id, tx);
      if (!full) throw new Error('Failed to retrieve newly created discrepancy');
      return full;
    };

    if (txClient) return runInTx(txClient);
    return db.transaction(runInTx);
  }

  /**
   * Retrieves an individual discrepancy by ID with full relations and history.
   */
  async findDiscrepancyById(
    id: string,
    txClient?: TransactionClient
  ): Promise<DiscrepancyWithDetails | null> {
    const executor = (txClient ?? db) as typeof db;

    const rows = await executor.execute(sql`
      SELECT
        pd.id,
        pd.case_id AS "caseId",
        pd.case_parcel_id AS "caseParcelId",
        pd.report_id AS "reportId",
        pd.review_id AS "reviewId",
        pd.category,
        pd.description,
        pd.status,
        pd.created_by AS "createdBy",
        pd.created_at AS "createdAt",
        pd.updated_at AS "updatedAt",
        lp.id AS "lp_id",
        lp.parcel_id AS "lp_parcelId",
        lp.survey_number AS "lp_surveyNumber",
        lp.subdivision_number AS "lp_subdivisionNumber",
        lp.village AS "lp_village",
        lp.taluk AS "lp_taluk",
        lp.district AS "lp_district",
        lp.state AS "lp_state",
        lp.total_area AS "lp_totalArea",
        lp.area_unit AS "lp_areaUnit",
        ac.id AS "ac_id",
        ac.case_reference AS "ac_caseReference",
        ac.title AS "ac_title",
        ac.status AS "ac_status",
        ac.project_id AS "ac_projectId",
        fvr.id AS "fvr_id",
        fvr.outcome AS "fvr_outcome",
        fvr.observations AS "fvr_observations",
        fvr.status AS "fvr_status",
        fvr.submitted_at AS "fvr_submittedAt",
        fvr.reviewed_at AS "fvr_reviewedAt",
        fvr.review_decision AS "fvr_reviewDecision",
        fvr.review_remarks AS "fvr_reviewRemarks",
        fvr.revision_number AS "fvr_revisionNumber",
        u_creator.id AS "u_creator_id",
        u_creator.name AS "u_creator_name",
        u_creator.email AS "u_creator_email"
      FROM parcel_discrepancies pd
      INNER JOIN acquisition_cases ac ON ac.id = pd.case_id
      INNER JOIN acquisition_case_parcels acp ON acp.id = pd.case_parcel_id
      INNER JOIN land_parcels lp ON lp.id = acp.parcel_id
      INNER JOIN field_verification_reports fvr ON fvr.id = pd.report_id
      INNER JOIN users u_creator ON u_creator.id = pd.created_by
      WHERE pd.id = ${id}::uuid
      LIMIT 1
    `);

    const row = rows[0];
    if (!row) return null;

    // Load investigations with investigator details and evidence
    const investigationRows = await executor.execute(sql`
      SELECT
        di.id,
        di.discrepancy_id AS "discrepancyId",
        di.investigator_id AS "investigatorId",
        di.findings,
        di.notes,
        di.status,
        di.started_at AS "startedAt",
        di.submitted_at AS "submittedAt",
        di.created_by AS "createdBy",
        di.created_at AS "createdAt",
        di.updated_at AS "updatedAt",
        u_inv.id AS "u_inv_id",
        u_inv.name AS "u_inv_name",
        u_inv.email AS "u_inv_email"
      FROM discrepancy_investigations di
      INNER JOIN users u_inv ON u_inv.id = di.investigator_id
      WHERE di.discrepancy_id = ${id}::uuid
      ORDER BY di.created_at DESC
    `);

    const investigations: DiscrepancyInvestigationWithDetails[] = [];
    for (const invRow of investigationRows) {
      const evidenceRows = await executor
        .select()
        .from(fieldVerificationEvidence)
        .where(eq(fieldVerificationEvidence.investigationId, String(invRow.id)))
        .orderBy(fieldVerificationEvidence.createdAt);

      investigations.push({
        id: String(invRow.id),
        discrepancyId: String(invRow.discrepancyId),
        investigatorId: String(invRow.investigatorId),
        investigator: {
          id: String(invRow.u_inv_id),
          name: String(invRow.u_inv_name),
          email: String(invRow.u_inv_email),
        },
        findings: invRow.findings ? String(invRow.findings) : null,
        notes: invRow.notes ? String(invRow.notes) : null,
        status: String(invRow.status),
        startedAt: new Date(String(invRow.startedAt)),
        submittedAt: invRow.submittedAt ? new Date(String(invRow.submittedAt)) : null,
        createdBy: String(invRow.createdBy),
        createdAt: new Date(String(invRow.createdAt)),
        updatedAt: new Date(String(invRow.updatedAt)),
        evidence: evidenceRows,
      });
    }

    // Load resolution history
    const resolutionRows = await executor.execute(sql`
      SELECT
        drh.id,
        drh.discrepancy_id AS "discrepancyId",
        drh.investigation_id AS "investigationId",
        drh.decision,
        drh.remarks,
        drh.resolved_by AS "resolvedBy",
        drh.created_at AS "createdAt",
        u_res.id AS "u_res_id",
        u_res.name AS "u_res_name",
        u_res.email AS "u_res_email"
      FROM discrepancy_resolution_history drh
      INNER JOIN users u_res ON u_res.id = drh.resolved_by
      WHERE drh.discrepancy_id = ${id}::uuid
      ORDER BY drh.created_at DESC
    `);

    const resolutionHistory: DiscrepancyResolutionWithDetails[] = resolutionRows.map((resRow) => ({
      id: String(resRow.id),
      discrepancyId: String(resRow.discrepancyId),
      investigationId: resRow.investigationId ? String(resRow.investigationId) : null,
      decision: String(resRow.decision),
      remarks: String(resRow.remarks),
      resolvedBy: String(resRow.resolvedBy),
      resolver: {
        id: String(resRow.u_res_id),
        name: String(resRow.u_res_name),
        email: String(resRow.u_res_email),
      },
      createdAt: new Date(String(resRow.createdAt)),
    }));

    return {
      id: String(row.id),
      caseId: String(row.caseId),
      caseParcelId: String(row.caseParcelId),
      reportId: String(row.reportId),
      reviewId: row.reviewId ? String(row.reviewId) : null,
      category: String(row.category),
      description: String(row.description),
      status: String(row.status),
      createdBy: String(row.createdBy),
      createdAt: new Date(String(row.createdAt)),
      updatedAt: new Date(String(row.updatedAt)),
      parcel: {
        id: String(row.lp_id),
        parcelId: String(row.lp_parcelId),
        surveyNumber: String(row.lp_surveyNumber),
        subdivisionNumber: row.lp_subdivisionNumber ? String(row.lp_subdivisionNumber) : null,
        village: String(row.lp_village),
        taluk: String(row.lp_taluk),
        district: String(row.lp_district),
        state: String(row.lp_state),
        totalArea: String(row.lp_totalArea),
        areaUnit: String(row.lp_areaUnit),
      },
      case: {
        id: String(row.ac_id),
        caseReference: String(row.ac_caseReference),
        title: String(row.ac_title),
        status: String(row.ac_status),
        projectId: String(row.ac_projectId),
      },
      report: {
        id: String(row.fvr_id),
        outcome: row.fvr_outcome ? String(row.fvr_outcome) : null,
        observations: row.fvr_observations ? String(row.fvr_observations) : null,
        status: String(row.fvr_status),
        submittedAt: row.fvr_submittedAt ? new Date(String(row.fvr_submittedAt)) : null,
        reviewedAt: row.fvr_reviewedAt ? new Date(String(row.fvr_reviewedAt)) : null,
        reviewDecision: row.fvr_reviewDecision ? String(row.fvr_reviewDecision) : null,
        reviewRemarks: row.fvr_reviewRemarks ? String(row.fvr_reviewRemarks) : null,
        revisionNumber: Number(row.fvr_revisionNumber ?? 1),
      },
      creator: {
        id: String(row.u_creator_id),
        name: String(row.u_creator_name),
        email: String(row.u_creator_email),
      },
      investigations,
      resolutionHistory,
    };
  }

  /**
   * Lists discrepancies for an acquisition case with filtering and pagination.
   */
  async listDiscrepanciesByCaseId(
    caseId: string,
    options: {
      page: number;
      limit: number;
      status?: string;
      category?: string;
      caseParcelId?: string;
    },
    txClient?: TransactionClient
  ): Promise<{ data: DiscrepancyWithDetails[]; total: number }> {
    const executor = (txClient ?? db) as typeof db;
    const offset = (options.page - 1) * options.limit;

    const whereConditions: SQL[] = [sql`pd.case_id = ${caseId}::uuid`];

    if (options.status && options.status !== 'ALL') {
      whereConditions.push(sql`pd.status = ${options.status}`);
    }

    if (options.category && options.category !== 'ALL') {
      whereConditions.push(sql`pd.category = ${options.category}`);
    }

    if (options.caseParcelId) {
      whereConditions.push(sql`pd.case_parcel_id = ${options.caseParcelId}::uuid`);
    }

    const whereClause = sql.join(whereConditions, sql` AND `);

    const [countResult] = await executor.execute(sql`
      SELECT count(*)::int AS count
      FROM parcel_discrepancies pd
      WHERE ${whereClause}
    `);
    const total = Number(countResult?.count ?? 0);

    const rows = await executor.execute(sql`
      SELECT pd.id
      FROM parcel_discrepancies pd
      WHERE ${whereClause}
      ORDER BY pd.created_at DESC
      LIMIT ${options.limit} OFFSET ${offset}
    `);

    const data: DiscrepancyWithDetails[] = [];
    for (const r of rows) {
      const item = await this.findDiscrepancyById(String(r.id), txClient);
      if (item) data.push(item);
    }

    return { data, total };
  }

  /**
   * Starts an investigation for an open discrepancy.
   * Atomically transitions discrepancy status to UNDER_INVESTIGATION.
   */
  async startInvestigation(
    data: {
      discrepancyId: string;
      investigatorId: string;
      notes?: string | null;
      createdBy: string;
    },
    txClient?: TransactionClient
  ): Promise<{ discrepancy: DiscrepancyWithDetails; investigation: DiscrepancyInvestigationWithDetails }> {
    const runInTx = async (tx: TransactionClient) => {
      const discrepancy = await this.findDiscrepancyById(data.discrepancyId, tx);
      if (!discrepancy) {
        throw new NotFoundError(`Discrepancy with ID '${data.discrepancyId}' not found`);
      }

      if (discrepancy.status === 'RESOLVED') {
        throw new ConflictError(
          'Cannot start investigation: discrepancy has already been RESOLVED'
        );
      }

      // Check if there is already an active (DRAFT) investigation
      const [existingDraft] = await tx
        .select({ id: discrepancyInvestigations.id })
        .from(discrepancyInvestigations)
        .where(
          and(
            eq(discrepancyInvestigations.discrepancyId, data.discrepancyId),
            eq(discrepancyInvestigations.status, 'DRAFT')
          )
        )
        .limit(1);

      if (existingDraft) {
        throw new ConflictError(
          `An active investigation draft already exists (ID: ${existingDraft.id})`
        );
      }

      const now = new Date();

      const [insertedInv] = await tx
        .insert(discrepancyInvestigations)
        .values({
          discrepancyId: data.discrepancyId,
          investigatorId: data.investigatorId,
          notes: data.notes ?? null,
          status: 'DRAFT',
          startedAt: now,
          createdBy: data.createdBy,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      // Transition discrepancy status to UNDER_INVESTIGATION if not already
      await tx
        .update(parcelDiscrepancies)
        .set({
          status: 'UNDER_INVESTIGATION',
          updatedAt: now,
        })
        .where(eq(parcelDiscrepancies.id, data.discrepancyId));

      const updatedDiscrepancy = await this.findDiscrepancyById(data.discrepancyId, tx);
      if (!updatedDiscrepancy) throw new Error('Failed to retrieve updated discrepancy');

      const invDetails = updatedDiscrepancy.investigations.find(
        (i) => i.id === insertedInv.id
      );
      if (!invDetails) throw new Error('Failed to retrieve new investigation details');

      return {
        discrepancy: updatedDiscrepancy,
        investigation: invDetails,
      };
    };

    if (txClient) return runInTx(txClient);
    return db.transaction(runInTx);
  }

  /**
   * Updates an investigation draft (findings, notes).
   */
  async updateInvestigation(
    investigationId: string,
    data: {
      findings?: string | null;
      notes?: string | null;
    },
    txClient?: TransactionClient
  ): Promise<DiscrepancyInvestigationWithDetails> {
    const executor = (txClient ?? db) as typeof db;

    const [existing] = await executor
      .select()
      .from(discrepancyInvestigations)
      .where(eq(discrepancyInvestigations.id, investigationId))
      .limit(1);

    if (!existing) {
      throw new NotFoundError(`Investigation with ID '${investigationId}' not found`);
    }

    if (existing.status !== 'DRAFT') {
      throw new ConflictError(
        `Cannot edit investigation: investigation status is '${existing.status}' (only DRAFT investigations can be modified)`
      );
    }

    const now = new Date();
    await executor
      .update(discrepancyInvestigations)
      .set({
        findings: data.findings !== undefined ? data.findings : existing.findings,
        notes: data.notes !== undefined ? data.notes : existing.notes,
        updatedAt: now,
      })
      .where(eq(discrepancyInvestigations.id, investigationId));

    const discrepancy = await this.findDiscrepancyById(existing.discrepancyId, txClient);
    const updated = discrepancy?.investigations.find((i) => i.id === investigationId);
    if (!updated) throw new Error('Failed to load updated investigation');
    return updated;
  }

  /**
   * Attaches evidence to an investigation.
   */
  async addInvestigationEvidence(
    investigationId: string,
    data: {
      evidenceType: string;
      fileReference: string;
      caption?: string | null;
      description?: string | null;
      createdBy: string;
    },
    txClient?: TransactionClient
  ): Promise<FieldVerificationEvidence> {
    const executor = (txClient ?? db) as typeof db;

    const [existing] = await executor
      .select({ id: discrepancyInvestigations.id, status: discrepancyInvestigations.status })
      .from(discrepancyInvestigations)
      .where(eq(discrepancyInvestigations.id, investigationId))
      .limit(1);

    if (!existing) {
      throw new NotFoundError(`Investigation with ID '${investigationId}' not found`);
    }

    if (existing.status !== 'DRAFT') {
      throw new ConflictError(
        `Cannot attach evidence: investigation is already in '${existing.status}' status`
      );
    }

    const [inserted] = await executor
      .insert(fieldVerificationEvidence)
      .values({
        investigationId,
        evidenceType: data.evidenceType,
        fileReference: data.fileReference,
        caption: data.caption ?? null,
        description: data.description ?? null,
        createdBy: data.createdBy,
      })
      .returning();

    return inserted;
  }

  /**
   * Submits an investigation's findings for resolution.
   * Atomically transitions discrepancy status to SUBMITTED_FOR_RESOLUTION.
   */
  async submitInvestigation(
    investigationId: string,
    findings: string,
    notes?: string | null,
    txClient?: TransactionClient
  ): Promise<{ discrepancy: DiscrepancyWithDetails; investigation: DiscrepancyInvestigationWithDetails }> {
    const runInTx = async (tx: TransactionClient) => {
      const [existing] = await tx
        .select()
        .from(discrepancyInvestigations)
        .where(eq(discrepancyInvestigations.id, investigationId))
        .limit(1);

      if (!existing) {
        throw new NotFoundError(`Investigation with ID '${investigationId}' not found`);
      }

      if (existing.status !== 'DRAFT') {
        throw new ConflictError(
          `Cannot submit investigation: investigation is already in '${existing.status}' status`
        );
      }

      const now = new Date();

      await tx
        .update(discrepancyInvestigations)
        .set({
          status: 'SUBMITTED',
          findings,
          notes: notes !== undefined ? notes : existing.notes,
          submittedAt: now,
          updatedAt: now,
        })
        .where(eq(discrepancyInvestigations.id, investigationId));

      await tx
        .update(parcelDiscrepancies)
        .set({
          status: 'SUBMITTED_FOR_RESOLUTION',
          updatedAt: now,
        })
        .where(eq(parcelDiscrepancies.id, existing.discrepancyId));

      const updatedDiscrepancy = await this.findDiscrepancyById(existing.discrepancyId, tx);
      if (!updatedDiscrepancy) throw new Error('Failed to retrieve updated discrepancy');

      const invDetails = updatedDiscrepancy.investigations.find((i) => i.id === investigationId);
      if (!invDetails) throw new Error('Failed to retrieve submitted investigation');

      return {
        discrepancy: updatedDiscrepancy,
        investigation: invDetails,
      };
    };

    if (txClient) return runInTx(txClient);
    return db.transaction(runInTx);
  }

  /**
   * Records an authorized resolution decision on a submitted discrepancy.
   * Decisions:
   * - RESOLVED: updates discrepancy status to RESOLVED
   * - RETURNED_FOR_FURTHER_INVESTIGATION: updates discrepancy status back to UNDER_INVESTIGATION
   *
   * Concurrency protection: Serialized conditional update ensuring status is SUBMITTED_FOR_RESOLUTION.
   */
  async resolveDiscrepancy(
    discrepancyId: string,
    data: {
      investigationId?: string | null;
      decision: 'RESOLVED' | 'RETURNED_FOR_FURTHER_INVESTIGATION';
      remarks: string;
      resolvedBy: string;
    },
    txClient?: TransactionClient
  ): Promise<DiscrepancyWithDetails> {
    const runInTx = async (tx: TransactionClient) => {
      const now = new Date();

      const nextStatus =
        data.decision === 'RESOLVED'
          ? 'RESOLVED'
          : 'UNDER_INVESTIGATION';

      // Atomic conditional update ensuring discrepancy is in SUBMITTED_FOR_RESOLUTION
      const [updated] = await tx
        .update(parcelDiscrepancies)
        .set({
          status: nextStatus,
          updatedAt: now,
        })
        .where(
          and(
            eq(parcelDiscrepancies.id, discrepancyId),
            eq(parcelDiscrepancies.status, 'SUBMITTED_FOR_RESOLUTION')
          )
        )
        .returning();

      if (!updated) {
        const current = await this.findDiscrepancyById(discrepancyId, tx);
        if (!current) {
          throw new NotFoundError(`Discrepancy with ID '${discrepancyId}' not found`);
        }
        throw new ConflictError(
          `Cannot resolve discrepancy: current status is '${current.status}'. Decisions can only be made on discrepancies in 'SUBMITTED_FOR_RESOLUTION' status.`
        );
      }

      // Record immutable resolution decision history
      await tx.insert(discrepancyResolutionHistory).values({
        discrepancyId,
        investigationId: data.investigationId ?? null,
        decision: data.decision,
        remarks: data.remarks,
        resolvedBy: data.resolvedBy,
        createdAt: now,
      });

      const full = await this.findDiscrepancyById(discrepancyId, tx);
      if (!full) throw new Error('Failed to retrieve resolved discrepancy');
      return full;
    };

    if (txClient) return runInTx(txClient);
    return db.transaction(runInTx);
  }

  /**
   * Calculates derived discrepancy counts for an acquisition case.
   */
  async getCaseDiscrepancyCounts(
    caseId: string,
    txClient?: TransactionClient
  ): Promise<CaseDiscrepancyCounts> {
    const executor = (txClient ?? db) as typeof db;

    const [result] = await executor.execute(sql`
      SELECT
        count(*)::int AS "total",
        count(*) FILTER (WHERE status = 'OPEN')::int AS "open",
        count(*) FILTER (WHERE status = 'UNDER_INVESTIGATION')::int AS "underInvestigation",
        count(*) FILTER (WHERE status = 'SUBMITTED_FOR_RESOLUTION')::int AS "submittedForResolution",
        count(*) FILTER (WHERE status = 'RESOLVED')::int AS "resolved"
      FROM parcel_discrepancies
      WHERE case_id = ${caseId}::uuid
    `);

    return {
      totalDiscrepancies: Number(result?.total ?? 0),
      openDiscrepancies: Number(result?.open ?? 0),
      underInvestigationDiscrepancies: Number(result?.underInvestigation ?? 0),
      submittedForResolutionDiscrepancies: Number(result?.submittedForResolution ?? 0),
      resolvedDiscrepancies: Number(result?.resolved ?? 0),
    };
  }
}

export const discrepancyRepository = new DiscrepancyRepository();
