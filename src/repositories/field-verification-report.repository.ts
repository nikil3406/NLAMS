import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db';
import {
  fieldVerificationReports,
  type FieldVerificationReport,
} from '../../db/schema/field-verification-reports';
import {
  fieldVerificationEvidence,
  type FieldVerificationEvidence,
} from '../../db/schema/field-verification-evidence';
import {
  fieldVerificationReportReviews,
  type FieldVerificationReportReview,
} from '../../db/schema/field-verification-report-reviews';
import type { TransactionClient } from './parcel.repository';
import { ConflictError } from '../types/errors';
import { discrepancyRepository, type CaseDiscrepancyCounts } from './discrepancy.repository';

export interface FieldVerificationReportWithDetails extends FieldVerificationReport {
  caseParcel: {
    id: string;
    caseId: string;
    parcelId: string;
    proposedAffectedArea: string;
    affectedAreaUnit: string;
  };
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
  project?: {
    id: string;
    name: string;
    projectCode: string;
  };
  verifier: {
    id: string;
    name: string;
    email: string;
  } | null;
  creator: {
    id: string;
    name: string;
    email: string;
  };
  reviewer: {
    id: string;
    name: string;
    email: string;
  } | null;
  evidence: FieldVerificationEvidence[];
  reviews: FieldVerificationReportReview[];
}

export interface CaseVerificationSummary {
  caseId: string;
  totalParcels: number;
  parcelsAwaitingSubmission: number;
  parcelsAwaitingReview: number;
  acceptedParcels: number;
  discrepancyFlaggedParcels: number;
  parcelsWithSubmittedReports: number;
  reportsAwaitingReview: number;
  acceptedReports: number;
  returnedReports: number;
  discrepancyFlaggedReports: number;
  inconclusiveFindings: number;
  outstandingReviewActions: number;
  outstandingDiscrepancies: number;
  discrepanciesSummary?: CaseDiscrepancyCounts;
  areaTotals: {
    recordedParcelArea: {
      total: number | null;
      unit: string | null;
      isCompatible: boolean;
      breakdownByUnit: Record<string, number>;
    };
    proposedAffectedArea: {
      total: number | null;
      unit: string | null;
      isCompatible: boolean;
      breakdownByUnit: Record<string, number>;
    };
  };
  parcelsSummary: Array<{
    caseParcelId: string;
    parcelId: string;
    surveyNumber: string;
    village: string;
    currentVerificationStatus: string;
    latestReportId: string | null;
    latestReportStatus: string | null;
    latestReportOutcome: string | null;
    revisionNumber: number | null;
  }>;
}

export class FieldVerificationReportRepository {
  /**
   * Builds the comprehensive report detail object including relations, evidence, and review history.
   */
  async findReportById(
    reportId: string,
    txClient?: TransactionClient
  ): Promise<FieldVerificationReportWithDetails | null> {
    const executor = (txClient ?? db) as typeof db;

    const result = await executor.execute(sql`
      SELECT
        fvr.id,
        fvr.case_parcel_id AS "caseParcelId",
        fvr.verified_by AS "verifiedBy",
        fvr.verification_date AS "verificationDate",
        fvr.outcome,
        fvr.observations,
        fvr.measured_area AS "measuredArea",
        fvr.measured_area_unit AS "measuredAreaUnit",
        fvr.measurement_method AS "measurementMethod",
        fvr.measurement_notes AS "measurementNotes",
        fvr.status,
        fvr.submitted_at AS "submittedAt",
        fvr.reviewed_by AS "reviewedBy",
        fvr.reviewed_at AS "reviewedAt",
        fvr.review_decision AS "reviewDecision",
        fvr.review_remarks AS "reviewRemarks",
        fvr.previous_report_id AS "previousReportId",
        fvr.revision_number AS "revisionNumber",
        fvr.created_by AS "createdBy",
        fvr.created_at AS "createdAt",
        fvr.updated_at AS "updatedAt",
        acp.id AS "acp_id",
        acp.case_id AS "acp_caseId",
        acp.parcel_id AS "acp_parcelId",
        acp.proposed_affected_area AS "acp_proposedAffectedArea",
        acp.affected_area_unit AS "acp_affectedAreaUnit",
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
        p.id AS "p_id",
        p.name AS "p_name",
        p.project_code AS "p_projectCode",
        u_verif.id AS "u_verif_id",
        u_verif.name AS "u_verif_name",
        u_verif.email AS "u_verif_email",
        u_creator.id AS "u_creator_id",
        u_creator.name AS "u_creator_name",
        u_creator.email AS "u_creator_email",
        u_reviewer.id AS "u_reviewer_id",
        u_reviewer.name AS "u_reviewer_name",
        u_reviewer.email AS "u_reviewer_email"
      FROM field_verification_reports fvr
      INNER JOIN acquisition_case_parcels acp ON acp.id = fvr.case_parcel_id
      INNER JOIN land_parcels lp ON lp.id = acp.parcel_id
      INNER JOIN acquisition_cases ac ON ac.id = acp.case_id
      INNER JOIN projects p ON p.id = ac.project_id
      INNER JOIN users u_creator ON u_creator.id = fvr.created_by
      LEFT JOIN users u_verif ON u_verif.id = fvr.verified_by
      LEFT JOIN users u_reviewer ON u_reviewer.id = fvr.reviewed_by
      WHERE fvr.id = ${reportId}::uuid
      LIMIT 1
    `);

    const row = result[0];
    if (!row) return null;

    const evidenceRows = await executor
      .select()
      .from(fieldVerificationEvidence)
      .where(eq(fieldVerificationEvidence.reportId, reportId))
      .orderBy(fieldVerificationEvidence.createdAt);

    const reviewRows = await executor
      .select()
      .from(fieldVerificationReportReviews)
      .where(eq(fieldVerificationReportReviews.reportId, reportId))
      .orderBy(desc(fieldVerificationReportReviews.createdAt));

    return this.mapRowToDetails(row, evidenceRows, reviewRows);
  }

  /**
   * Creates a new draft field verification report, atomically creating any initial evidence items.
   */
  async createReport(
    data: {
      caseParcelId: string;
      verificationDate?: Date | null;
      outcome?: string | null;
      observations?: string | null;
      measuredArea?: string | null;
      measuredAreaUnit?: string | null;
      measurementMethod?: string | null;
      measurementNotes?: string | null;
      createdBy: string;
      previousReportId?: string | null;
      revisionNumber?: number;
    },
    evidence?: {
      evidenceType: string;
      fileReference: string;
      caption?: string | null;
      description?: string | null;
    }[],
    txClient?: TransactionClient
  ): Promise<FieldVerificationReportWithDetails> {
    const runInTx = async (tx: TransactionClient) => {
      const [inserted] = await tx
        .insert(fieldVerificationReports)
        .values({
          caseParcelId: data.caseParcelId,
          verificationDate: data.verificationDate ?? null,
          outcome: data.outcome ?? null,
          observations: data.observations ?? null,
          measuredArea: data.measuredArea ? data.measuredArea : null,
          measuredAreaUnit: data.measuredAreaUnit ?? null,
          measurementMethod: data.measurementMethod ?? null,
          measurementNotes: data.measurementNotes ?? null,
          status: 'DRAFT',
          previousReportId: data.previousReportId ?? null,
          revisionNumber: data.revisionNumber ?? 1,
          createdBy: data.createdBy,
        })
        .returning();

      if (evidence && evidence.length > 0) {
        await tx.insert(fieldVerificationEvidence).values(
          evidence.map((item) => ({
            reportId: inserted.id,
            evidenceType: item.evidenceType,
            fileReference: item.fileReference,
            caption: item.caption ?? null,
            description: item.description ?? null,
            createdBy: data.createdBy,
          }))
        );
      }

      const fullReport = await this.findReportById(inserted.id, tx);
      if (!fullReport) throw new Error('Failed to retrieve newly created report');
      return fullReport;
    };

    if (txClient) {
      return runInTx(txClient);
    }
    return db.transaction(runInTx);
  }

  /**
   * Updates an editable draft report.
   */
  async updateReport(
    reportId: string,
    data: {
      verificationDate?: Date | null;
      outcome?: string | null;
      observations?: string | null;
      measuredArea?: string | null;
      measuredAreaUnit?: string | null;
      measurementMethod?: string | null;
      measurementNotes?: string | null;
    },
    txClient?: TransactionClient
  ): Promise<FieldVerificationReportWithDetails> {
    const executor = (txClient ?? db) as typeof db;

    const valuesToUpdate: Partial<typeof fieldVerificationReports.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (data.verificationDate !== undefined) valuesToUpdate.verificationDate = data.verificationDate;
    if (data.outcome !== undefined) valuesToUpdate.outcome = data.outcome;
    if (data.observations !== undefined) valuesToUpdate.observations = data.observations;
    if (data.measuredArea !== undefined) valuesToUpdate.measuredArea = data.measuredArea;
    if (data.measuredAreaUnit !== undefined) valuesToUpdate.measuredAreaUnit = data.measuredAreaUnit;
    if (data.measurementMethod !== undefined) valuesToUpdate.measurementMethod = data.measurementMethod;
    if (data.measurementNotes !== undefined) valuesToUpdate.measurementNotes = data.measurementNotes;

    await executor
      .update(fieldVerificationReports)
      .set(valuesToUpdate)
      .where(
        and(
          eq(fieldVerificationReports.id, reportId),
          eq(fieldVerificationReports.status, 'DRAFT')
        )
      );

    const updated = await this.findReportById(reportId, txClient);
    if (!updated) throw new Error(`Report with ID '${reportId}' not found after update`);
    return updated;
  }

  /**
   * Atomically transitions a report from DRAFT to SUBMITTED.
   * Concurrency-safe: conditional WHERE status = 'DRAFT' prevents duplicate submissions.
   */
  async submitReport(
    reportId: string,
    verifiedByUserId: string,
    txClient?: TransactionClient
  ): Promise<FieldVerificationReportWithDetails | null> {
    const executor = (txClient ?? db) as typeof db;

    const [updatedRow] = await executor
      .update(fieldVerificationReports)
      .set({
        status: 'SUBMITTED',
        verifiedBy: verifiedByUserId,
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(fieldVerificationReports.id, reportId),
          eq(fieldVerificationReports.status, 'DRAFT')
        )
      )
      .returning();

    if (!updatedRow) {
      return null;
    }

    return this.findReportById(reportId, txClient);
  }

  /**
   * Applies a Land Officer review decision to a SUBMITTED report atomically.
   * Concurrency-safe: conditional WHERE status = 'SUBMITTED' prevents conflicting reviews.
   * Also appends an entry to the auditable review history table.
   */
  async reviewReport(
    reportId: string,
    reviewerId: string,
    decision: 'ACCEPTED' | 'RETURNED_FOR_CORRECTION' | 'DISCREPANCY_FLAGGED',
    remarks?: string | null,
    txClient?: TransactionClient
  ): Promise<FieldVerificationReportWithDetails | null> {
    const runInTx = async (tx: TransactionClient) => {
      const now = new Date();
      const [updatedRow] = await tx
        .update(fieldVerificationReports)
        .set({
          status: decision,
          reviewedBy: reviewerId,
          reviewedAt: now,
          reviewDecision: decision,
          reviewRemarks: remarks ?? null,
          updatedAt: now,
        })
        .where(
          and(
            eq(fieldVerificationReports.id, reportId),
            eq(fieldVerificationReports.status, 'SUBMITTED')
          )
        )
        .returning();

      if (!updatedRow) {
        return null;
      }

      const [reviewEntry] = await tx
        .insert(fieldVerificationReportReviews)
        .values({
          reportId,
          reviewerId,
          decision,
          fromStatus: 'SUBMITTED',
          toStatus: decision,
          remarks: remarks ?? null,
          createdAt: now,
        })
        .returning();

      // If decision is DISCREPANCY_FLAGGED, create or link formal discrepancy record transactionally
      if (decision === 'DISCREPANCY_FLAGGED') {
        const [acpRow] = await tx.execute(sql`
          SELECT acp.case_id AS "caseId", acp.id AS "caseParcelId"
          FROM field_verification_reports fvr
          INNER JOIN acquisition_case_parcels acp ON acp.id = fvr.case_parcel_id
          WHERE fvr.id = ${reportId}::uuid
          LIMIT 1
        `);
        if (acpRow) {
          await discrepancyRepository.findOrCreateDiscrepancyForReport(
            {
              caseId: String(acpRow.caseId),
              caseParcelId: String(acpRow.caseParcelId),
              reportId,
              reviewId: reviewEntry?.id ?? null,
              category: 'OTHER',
              description: remarks ?? 'Discrepancy flagged during field verification review',
              createdBy: reviewerId,
            },
            tx
          );
        }
      }

      const fullReport = await this.findReportById(reportId, tx);
      return fullReport;
    };

    if (txClient) {
      return runInTx(txClient);
    }
    return db.transaction(runInTx);
  }

  /**
   * Creates a new draft revision for a report that was returned for correction.
   * Preserves previous report and creates revision with copied details and evidence.
   */
  async createCorrectionDraft(
    reportId: string,
    authorId: string,
    txClient?: TransactionClient
  ): Promise<FieldVerificationReportWithDetails> {
    const runInTx = async (tx: TransactionClient) => {
      const existing = await this.findReportById(reportId, tx);
      if (!existing) {
        throw new Error(`Report with ID '${reportId}' not found`);
      }
      if (existing.status !== 'RETURNED_FOR_CORRECTION') {
        throw new Error(`Cannot initiate correction: report status is '${existing.status}'`);
      }

      // Check if there is already an active (DRAFT or SUBMITTED) revision for this report
      const [existingActive] = await tx.execute(sql`
        SELECT id FROM field_verification_reports
        WHERE previous_report_id = ${reportId}::uuid
          AND status IN ('DRAFT', 'SUBMITTED')
        LIMIT 1
      `);
      if (existingActive) {
        throw new ConflictError(
          `An active correction revision already exists for this report (ID: ${existingActive.id})`
        );
      }

      const nextRevisionNumber = (existing.revisionNumber || 1) + 1;

      const [inserted] = await tx
        .insert(fieldVerificationReports)
        .values({
          caseParcelId: existing.caseParcelId,
          verificationDate: existing.verificationDate,
          outcome: existing.outcome,
          observations: existing.observations,
          measuredArea: existing.measuredArea,
          measuredAreaUnit: existing.measuredAreaUnit,
          measurementMethod: existing.measurementMethod,
          measurementNotes: existing.measurementNotes,
          status: 'DRAFT',
          previousReportId: reportId,
          revisionNumber: nextRevisionNumber,
          createdBy: authorId,
        })
        .returning();

      // Copy previous evidence items into the new revision draft
      if (existing.evidence && existing.evidence.length > 0) {
        await tx.insert(fieldVerificationEvidence).values(
          existing.evidence.map((ev) => ({
            reportId: inserted.id,
            evidenceType: ev.evidenceType,
            fileReference: ev.fileReference,
            caption: ev.caption,
            description: ev.description,
            createdBy: authorId,
          }))
        );
      }

      const fullReport = await this.findReportById(inserted.id, tx);
      if (!fullReport) throw new Error('Failed to retrieve newly created correction draft');
      return fullReport;
    };

    if (txClient) {
      return runInTx(txClient);
    }
    return db.transaction(runInTx);
  }

  /**
   * Adds an evidence item to a report.
   */
  async addEvidence(
    reportId: string,
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

    const [inserted] = await executor
      .insert(fieldVerificationEvidence)
      .values({
        reportId,
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
   * Counts evidence items linked to a report.
   */
  async countEvidenceByReportId(
    reportId: string,
    txClient?: TransactionClient
  ): Promise<number> {
    const executor = (txClient ?? db) as typeof db;
    const [result] = await executor
      .select({ count: sql<number>`count(*)::int` })
      .from(fieldVerificationEvidence)
      .where(eq(fieldVerificationEvidence.reportId, reportId));
    return result?.count ?? 0;
  }

  /**
   * Lists all evidence items for a given report.
   */
  async getEvidenceByReportId(
    reportId: string,
    txClient?: TransactionClient
  ): Promise<FieldVerificationEvidence[]> {
    const executor = (txClient ?? db) as typeof db;
    return executor
      .select()
      .from(fieldVerificationEvidence)
      .where(eq(fieldVerificationEvidence.reportId, reportId))
      .orderBy(fieldVerificationEvidence.createdAt);
  }

  /**
   * Checks whether a parcel has an ACCEPTED field verification report.
   */
  async isParcelAccepted(caseParcelId: string, txClient?: TransactionClient): Promise<boolean> {
    const executor = (txClient ?? db) as typeof db;
    const [row] = await executor.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM field_verification_reports
        WHERE case_parcel_id = ${caseParcelId}::uuid AND status = 'ACCEPTED'
      ) AS "isAccepted"
    `);
    return Boolean(row?.isAccepted);
  }

  /**
   * Lists reports for a specific parcel association, ordered deterministically by
   * revision number desc, verification date descending, and created_at descending.
   */
  async listReportsByCaseParcelId(
    caseParcelId: string,
    options: { page: number; limit: number },
    txClient?: TransactionClient
  ): Promise<{ data: FieldVerificationReportWithDetails[]; total: number }> {
    const executor = (txClient ?? db) as typeof db;
    const offset = (options.page - 1) * options.limit;

    const [countResult] = await executor
      .select({ count: sql<number>`count(*)::int` })
      .from(fieldVerificationReports)
      .where(eq(fieldVerificationReports.caseParcelId, caseParcelId));
    const total = countResult?.count ?? 0;

    const rows = await executor.execute(sql`
      SELECT
        fvr.id,
        fvr.case_parcel_id AS "caseParcelId",
        fvr.verified_by AS "verifiedBy",
        fvr.verification_date AS "verificationDate",
        fvr.outcome,
        fvr.observations,
        fvr.measured_area AS "measuredArea",
        fvr.measured_area_unit AS "measuredAreaUnit",
        fvr.measurement_method AS "measurementMethod",
        fvr.measurement_notes AS "measurementNotes",
        fvr.status,
        fvr.submitted_at AS "submittedAt",
        fvr.reviewed_by AS "reviewedBy",
        fvr.reviewed_at AS "reviewedAt",
        fvr.review_decision AS "reviewDecision",
        fvr.review_remarks AS "reviewRemarks",
        fvr.previous_report_id AS "previousReportId",
        fvr.revision_number AS "revisionNumber",
        fvr.created_by AS "createdBy",
        fvr.created_at AS "createdAt",
        fvr.updated_at AS "updatedAt",
        acp.id AS "acp_id",
        acp.case_id AS "acp_caseId",
        acp.parcel_id AS "acp_parcelId",
        acp.proposed_affected_area AS "acp_proposedAffectedArea",
        acp.affected_area_unit AS "acp_affectedAreaUnit",
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
        p.id AS "p_id",
        p.name AS "p_name",
        p.project_code AS "p_projectCode",
        u_verif.id AS "u_verif_id",
        u_verif.name AS "u_verif_name",
        u_verif.email AS "u_verif_email",
        u_creator.id AS "u_creator_id",
        u_creator.name AS "u_creator_name",
        u_creator.email AS "u_creator_email",
        u_reviewer.id AS "u_reviewer_id",
        u_reviewer.name AS "u_reviewer_name",
        u_reviewer.email AS "u_reviewer_email"
      FROM field_verification_reports fvr
      INNER JOIN acquisition_case_parcels acp ON acp.id = fvr.case_parcel_id
      INNER JOIN land_parcels lp ON lp.id = acp.parcel_id
      INNER JOIN acquisition_cases ac ON ac.id = acp.case_id
      INNER JOIN projects p ON p.id = ac.project_id
      INNER JOIN users u_creator ON u_creator.id = fvr.created_by
      LEFT JOIN users u_verif ON u_verif.id = fvr.verified_by
      LEFT JOIN users u_reviewer ON u_reviewer.id = fvr.reviewed_by
      WHERE fvr.case_parcel_id = ${caseParcelId}::uuid
      ORDER BY fvr.revision_number DESC, fvr.verification_date DESC NULLS LAST, fvr.created_at DESC
      LIMIT ${options.limit} OFFSET ${offset}
    `);

    const data: FieldVerificationReportWithDetails[] = [];
    for (const row of rows) {
      const evidenceRows = await executor
        .select()
        .from(fieldVerificationEvidence)
        .where(eq(fieldVerificationEvidence.reportId, String(row.id)))
        .orderBy(fieldVerificationEvidence.createdAt);

      const reviewRows = await executor
        .select()
        .from(fieldVerificationReportReviews)
        .where(eq(fieldVerificationReportReviews.reportId, String(row.id)))
        .orderBy(desc(fieldVerificationReportReviews.createdAt));

      data.push(this.mapRowToDetails(row, evidenceRows, reviewRows));
    }

    return { data, total };
  }

  /**
   * Lists all reports for an entire acquisition case (across all its associated parcels).
   */
  async listReportsByCaseId(
    caseId: string,
    options: { page: number; limit: number },
    txClient?: TransactionClient
  ): Promise<{ data: FieldVerificationReportWithDetails[]; total: number }> {
    const executor = (txClient ?? db) as typeof db;
    const offset = (options.page - 1) * options.limit;

    const [countResult] = await executor.execute(sql`
      SELECT count(*)::int AS count
      FROM field_verification_reports fvr
      INNER JOIN acquisition_case_parcels acp ON acp.id = fvr.case_parcel_id
      WHERE acp.case_id = ${caseId}::uuid
    `);
    const total = Number(countResult?.count ?? 0);

    const rows = await executor.execute(sql`
      SELECT
        fvr.id,
        fvr.case_parcel_id AS "caseParcelId",
        fvr.verified_by AS "verifiedBy",
        fvr.verification_date AS "verificationDate",
        fvr.outcome,
        fvr.observations,
        fvr.measured_area AS "measuredArea",
        fvr.measured_area_unit AS "measuredAreaUnit",
        fvr.measurement_method AS "measurementMethod",
        fvr.measurement_notes AS "measurementNotes",
        fvr.status,
        fvr.submitted_at AS "submittedAt",
        fvr.reviewed_by AS "reviewedBy",
        fvr.reviewed_at AS "reviewedAt",
        fvr.review_decision AS "reviewDecision",
        fvr.review_remarks AS "reviewRemarks",
        fvr.previous_report_id AS "previousReportId",
        fvr.revision_number AS "revisionNumber",
        fvr.created_by AS "createdBy",
        fvr.created_at AS "createdAt",
        fvr.updated_at AS "updatedAt",
        acp.id AS "acp_id",
        acp.case_id AS "acp_caseId",
        acp.parcel_id AS "acp_parcelId",
        acp.proposed_affected_area AS "acp_proposedAffectedArea",
        acp.affected_area_unit AS "acp_affectedAreaUnit",
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
        p.id AS "p_id",
        p.name AS "p_name",
        p.project_code AS "p_projectCode",
        u_verif.id AS "u_verif_id",
        u_verif.name AS "u_verif_name",
        u_verif.email AS "u_verif_email",
        u_creator.id AS "u_creator_id",
        u_creator.name AS "u_creator_name",
        u_creator.email AS "u_creator_email",
        u_reviewer.id AS "u_reviewer_id",
        u_reviewer.name AS "u_reviewer_name",
        u_reviewer.email AS "u_reviewer_email"
      FROM field_verification_reports fvr
      INNER JOIN acquisition_case_parcels acp ON acp.id = fvr.case_parcel_id
      INNER JOIN land_parcels lp ON lp.id = acp.parcel_id
      INNER JOIN acquisition_cases ac ON ac.id = acp.case_id
      INNER JOIN projects p ON p.id = ac.project_id
      INNER JOIN users u_creator ON u_creator.id = fvr.created_by
      LEFT JOIN users u_verif ON u_verif.id = fvr.verified_by
      LEFT JOIN users u_reviewer ON u_reviewer.id = fvr.reviewed_by
      WHERE acp.case_id = ${caseId}::uuid
      ORDER BY fvr.revision_number DESC, fvr.verification_date DESC NULLS LAST, fvr.created_at DESC
      LIMIT ${options.limit} OFFSET ${offset}
    `);

    const data: FieldVerificationReportWithDetails[] = [];
    for (const row of rows) {
      const evidenceRows = await executor
        .select()
        .from(fieldVerificationEvidence)
        .where(eq(fieldVerificationEvidence.reportId, String(row.id)))
        .orderBy(fieldVerificationEvidence.createdAt);

      const reviewRows = await executor
        .select()
        .from(fieldVerificationReportReviews)
        .where(eq(fieldVerificationReportReviews.reportId, String(row.id)))
        .orderBy(desc(fieldVerificationReportReviews.createdAt));

      data.push(this.mapRowToDetails(row, evidenceRows, reviewRows));
    }

    return { data, total };
  }

  /**
   * Lists submitted reports for the Land Officer review queue.
   * Strictly excludes DRAFT reports.
   * Supports filtering by review status, outcome, caseId, and administrative unit scope.
   */
  async listReviewQueue(
    options: {
      page: number;
      limit: number;
      reviewStatus?: string;
      outcome?: string;
      caseId?: string;
      allowedUnitIds?: string[];
    },
    txClient?: TransactionClient
  ): Promise<{ data: FieldVerificationReportWithDetails[]; total: number }> {
    const executor = (txClient ?? db) as typeof db;
    const offset = (options.page - 1) * options.limit;

    // Build filter expressions
    const whereConditions: SQL[] = [sql`fvr.status != 'DRAFT'`];

    if (options.reviewStatus && options.reviewStatus !== 'ALL') {
      whereConditions.push(sql`fvr.status = ${options.reviewStatus}`);
    }

    if (options.outcome && options.outcome !== 'ALL') {
      whereConditions.push(sql`fvr.outcome = ${options.outcome}`);
    }

    if (options.caseId) {
      whereConditions.push(sql`acp.case_id = ${options.caseId}::uuid`);
    }

    if (options.allowedUnitIds && options.allowedUnitIds.length > 0) {
      // Build individual uuid literals joined into an ARRAY[...] to avoid
      // driver-level array→uuid[] cast errors (postgres error code 42846).
      const uuidLiterals = options.allowedUnitIds.map((id) => sql`${id}::uuid`);
      whereConditions.push(
        sql`p.administrative_unit_id = ANY(ARRAY[${sql.join(uuidLiterals, sql`, `)}])`
      );
    } else if (options.allowedUnitIds && options.allowedUnitIds.length === 0) {
      // Empty scope means user cannot see any records
      return { data: [], total: 0 };
    }

    const whereClause = sql.join(whereConditions, sql` AND `);

    const [countResult] = await executor.execute(sql`
      SELECT count(*)::int AS count
      FROM field_verification_reports fvr
      INNER JOIN acquisition_case_parcels acp ON acp.id = fvr.case_parcel_id
      INNER JOIN acquisition_cases ac ON ac.id = acp.case_id
      INNER JOIN projects p ON p.id = ac.project_id
      WHERE ${whereClause}
    `);
    const total = Number(countResult?.count ?? 0);

    const rows = await executor.execute(sql`
      SELECT
        fvr.id,
        fvr.case_parcel_id AS "caseParcelId",
        fvr.verified_by AS "verifiedBy",
        fvr.verification_date AS "verificationDate",
        fvr.outcome,
        fvr.observations,
        fvr.measured_area AS "measuredArea",
        fvr.measured_area_unit AS "measuredAreaUnit",
        fvr.measurement_method AS "measurementMethod",
        fvr.measurement_notes AS "measurementNotes",
        fvr.status,
        fvr.submitted_at AS "submittedAt",
        fvr.reviewed_by AS "reviewedBy",
        fvr.reviewed_at AS "reviewedAt",
        fvr.review_decision AS "reviewDecision",
        fvr.review_remarks AS "reviewRemarks",
        fvr.previous_report_id AS "previousReportId",
        fvr.revision_number AS "revisionNumber",
        fvr.created_by AS "createdBy",
        fvr.created_at AS "createdAt",
        fvr.updated_at AS "updatedAt",
        acp.id AS "acp_id",
        acp.case_id AS "acp_caseId",
        acp.parcel_id AS "acp_parcelId",
        acp.proposed_affected_area AS "acp_proposedAffectedArea",
        acp.affected_area_unit AS "acp_affectedAreaUnit",
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
        p.id AS "p_id",
        p.name AS "p_name",
        p.project_code AS "p_projectCode",
        u_verif.id AS "u_verif_id",
        u_verif.name AS "u_verif_name",
        u_verif.email AS "u_verif_email",
        u_creator.id AS "u_creator_id",
        u_creator.name AS "u_creator_name",
        u_creator.email AS "u_creator_email",
        u_reviewer.id AS "u_reviewer_id",
        u_reviewer.name AS "u_reviewer_name",
        u_reviewer.email AS "u_reviewer_email"
      FROM field_verification_reports fvr
      INNER JOIN acquisition_case_parcels acp ON acp.id = fvr.case_parcel_id
      INNER JOIN land_parcels lp ON lp.id = acp.parcel_id
      INNER JOIN acquisition_cases ac ON ac.id = acp.case_id
      INNER JOIN projects p ON p.id = ac.project_id
      INNER JOIN users u_creator ON u_creator.id = fvr.created_by
      LEFT JOIN users u_verif ON u_verif.id = fvr.verified_by
      LEFT JOIN users u_reviewer ON u_reviewer.id = fvr.reviewed_by
      WHERE ${whereClause}
      ORDER BY fvr.submitted_at DESC NULLS LAST, fvr.created_at DESC
      LIMIT ${options.limit} OFFSET ${offset}
    `);

    const data: FieldVerificationReportWithDetails[] = [];
    for (const row of rows) {
      const evidenceRows = await executor
        .select()
        .from(fieldVerificationEvidence)
        .where(eq(fieldVerificationEvidence.reportId, String(row.id)))
        .orderBy(fieldVerificationEvidence.createdAt);

      const reviewRows = await executor
        .select()
        .from(fieldVerificationReportReviews)
        .where(eq(fieldVerificationReportReviews.reportId, String(row.id)))
        .orderBy(desc(fieldVerificationReportReviews.createdAt));

      data.push(this.mapRowToDetails(row, evidenceRows, reviewRows));
    }

    return { data, total };
  }

  /**
   * Computes the derived case-level verification summary across all parcels and reports.
   * Rules:
   * - Counts parcels and reports separately (multiple reports do not inflate parcel count).
   * - Selects latest applicable report/revision per parcel (ordered by revision_number DESC, submitted_at DESC, created_at DESC).
   * - Aggregates areas only when measurement units are compatible; groups by unit if incompatible.
   * - Does not alter case status or auto-complete verification.
   */
  async getCaseVerificationSummary(
    caseId: string,
    txClient?: TransactionClient
  ): Promise<CaseVerificationSummary> {
    const executor = (txClient ?? db) as typeof db;

    // 1. Fetch all distinct parcels linked to this case
    const caseParcelsRows = await executor.execute(sql`
      SELECT
        acp.id AS "caseParcelId",
        acp.parcel_id AS "parcelId",
        acp.proposed_affected_area AS "proposedAffectedArea",
        acp.affected_area_unit AS "affectedAreaUnit",
        lp.id AS "canonicalParcelId",
        lp.parcel_id AS "parcelIdentifier",
        lp.survey_number AS "surveyNumber",
        lp.village AS "village",
        lp.total_area AS "totalArea",
        lp.area_unit AS "areaUnit"
      FROM acquisition_case_parcels acp
      INNER JOIN land_parcels lp ON lp.id = acp.parcel_id
      WHERE acp.case_id = ${caseId}::uuid
      ORDER BY lp.village, lp.survey_number
    `);

    const totalParcels = caseParcelsRows.length;

    // 2. Fetch all reports linked to parcels in this case
    const reportRows = await executor.execute(sql`
      SELECT
        fvr.id,
        fvr.case_parcel_id AS "caseParcelId",
        fvr.status,
        fvr.outcome,
        fvr.revision_number AS "revisionNumber",
        fvr.submitted_at AS "submittedAt",
        fvr.created_at AS "createdAt",
        fvr.reviewed_at AS "reviewedAt",
        fvr.review_decision AS "reviewDecision",
        fvr.review_remarks AS "reviewRemarks",
        acp.parcel_id AS "parcelId"
      FROM field_verification_reports fvr
      INNER JOIN acquisition_case_parcels acp ON acp.id = fvr.case_parcel_id
      WHERE acp.case_id = ${caseId}::uuid
      ORDER BY fvr.case_parcel_id, fvr.revision_number DESC, fvr.submitted_at DESC NULLS LAST, fvr.created_at DESC
    `);

    // 3. Aggregate area totals and verify unit compatibility
    // 3a. Recorded parcel area (unique canonical parcels)
    const recordedUnitsMap: Record<string, number> = {};
    const seenParcelIds = new Set<string>();

    for (const cp of caseParcelsRows) {
      const pid = String(cp.canonicalParcelId);
      if (!seenParcelIds.has(pid)) {
        seenParcelIds.add(pid);
        const area = parseFloat(String(cp.totalArea));
        const unit = String(cp.areaUnit);
        if (!isNaN(area)) {
          recordedUnitsMap[unit] = (recordedUnitsMap[unit] ?? 0) + area;
        }
      }
    }

    const recordedUnitKeys = Object.keys(recordedUnitsMap);
    const recordedIsCompatible = recordedUnitKeys.length <= 1;
    const recordedTotal = recordedIsCompatible && recordedUnitKeys.length === 1
      ? Number(recordedUnitsMap[recordedUnitKeys[0]].toFixed(4))
      : recordedUnitKeys.length === 0
      ? 0
      : null;
    const recordedUnit = recordedIsCompatible && recordedUnitKeys.length === 1
      ? recordedUnitKeys[0]
      : null;

    // 3b. Proposed affected area
    const proposedUnitsMap: Record<string, number> = {};
    for (const cp of caseParcelsRows) {
      const area = parseFloat(String(cp.proposedAffectedArea));
      const unit = String(cp.affectedAreaUnit);
      if (!isNaN(area)) {
        proposedUnitsMap[unit] = (proposedUnitsMap[unit] ?? 0) + area;
      }
    }

    const proposedUnitKeys = Object.keys(proposedUnitsMap);
    const proposedIsCompatible = proposedUnitKeys.length <= 1;
    const proposedTotal = proposedIsCompatible && proposedUnitKeys.length === 1
      ? Number(proposedUnitsMap[proposedUnitKeys[0]].toFixed(4))
      : proposedUnitKeys.length === 0
      ? 0
      : null;
    const proposedUnit = proposedIsCompatible && proposedUnitKeys.length === 1
      ? proposedUnitKeys[0]
      : null;

    // 4. Report counts across all reports in the case
    let reportsAwaitingReview = 0;
    let acceptedReports = 0;
    let returnedReports = 0;
    let discrepancyFlaggedReports = 0;
    let inconclusiveFindings = 0;

    const parcelsWithSubmittedReportsSet = new Set<string>();

    // Map reports by caseParcelId to pick latest applicable revision
    const reportsByCaseParcel: Record<string, any[]> = {};

    for (const rpt of reportRows) {
      const cpId = String(rpt.caseParcelId);
      if (!reportsByCaseParcel[cpId]) {
        reportsByCaseParcel[cpId] = [];
      }
      reportsByCaseParcel[cpId].push(rpt);

      if (rpt.status === 'SUBMITTED') reportsAwaitingReview++;
      if (rpt.status === 'ACCEPTED') acceptedReports++;
      if (rpt.status === 'RETURNED_FOR_CORRECTION') returnedReports++;
      if (rpt.status === 'DISCREPANCY_FLAGGED') discrepancyFlaggedReports++;
      if (rpt.outcome === 'INCONCLUSIVE') inconclusiveFindings++;

      if (rpt.status !== 'DRAFT') {
        parcelsWithSubmittedReportsSet.add(String(rpt.parcelId));
      }
    }

    // 5. Evaluate current verification status for each parcel using selection rule:
    // Highest revision_number, then latest submitted_at, then latest created_at.
    const parcelsSummary = caseParcelsRows.map((cp) => {
      const cpId = String(cp.caseParcelId);
      const parcelReports = reportsByCaseParcel[cpId] ?? [];
      const latestReport = parcelReports[0] ?? null;

      let currentVerificationStatus = 'PENDING_INSPECTION';
      if (latestReport) {
        if (latestReport.status === 'ACCEPTED') {
          currentVerificationStatus = 'VERIFIED_ACCEPTED';
        } else if (latestReport.status === 'SUBMITTED') {
          currentVerificationStatus = 'AWAITING_REVIEW';
        } else if (latestReport.status === 'RETURNED_FOR_CORRECTION') {
          currentVerificationStatus = 'RETURNED_FOR_CORRECTION';
        } else if (latestReport.status === 'DISCREPANCY_FLAGGED') {
          currentVerificationStatus = 'DISCREPANCY_FLAGGED';
        } else if (latestReport.status === 'DRAFT') {
          currentVerificationStatus = 'DRAFT_IN_PROGRESS';
        }
      }

      return {
        caseParcelId: cpId,
        parcelId: String(cp.parcelIdentifier),
        surveyNumber: String(cp.surveyNumber),
        village: String(cp.village),
        currentVerificationStatus,
        latestReportId: latestReport ? String(latestReport.id) : null,
        latestReportStatus: latestReport ? String(latestReport.status) : null,
        latestReportOutcome: latestReport ? String(latestReport.outcome) : null,
        revisionNumber: latestReport ? Number(latestReport.revisionNumber) : null,
      };
    });

    // 6. Outstanding review actions and discrepancies:
    // Outstanding review actions: reports currently in SUBMITTED status awaiting review.
    // Outstanding discrepancies: reports in DISCREPANCY_FLAGGED status OR active parcel findings with DISCREPANCY_FOUND.
    const outstandingReviewActions = reportsAwaitingReview;
    const outstandingDiscrepancies =
      discrepancyFlaggedReports +
      parcelsSummary.filter(
        (p) =>
          p.latestReportOutcome === 'DISCREPANCY_FOUND' &&
          p.latestReportStatus !== 'DISCREPANCY_FLAGGED' &&
          p.latestReportStatus !== 'RETURNED_FOR_CORRECTION'
      ).length;

    const acceptedParcels = parcelsSummary.filter(
      (p) => p.currentVerificationStatus === 'VERIFIED_ACCEPTED'
    ).length;
    const parcelsAwaitingReview = parcelsSummary.filter(
      (p) => p.currentVerificationStatus === 'AWAITING_REVIEW'
    ).length;
    const parcelsAwaitingSubmission = parcelsSummary.filter(
      (p) =>
        p.currentVerificationStatus === 'PENDING_INSPECTION' ||
        p.currentVerificationStatus === 'DRAFT_IN_PROGRESS'
    ).length;
    const discrepancyFlaggedParcels = parcelsSummary.filter(
      (p) => p.currentVerificationStatus === 'DISCREPANCY_FLAGGED'
    ).length;

    const discrepancyCounts = await discrepancyRepository.getCaseDiscrepancyCounts(
      caseId,
      txClient
    );

    return {
      caseId,
      totalParcels,
      parcelsAwaitingSubmission,
      parcelsAwaitingReview,
      acceptedParcels,
      discrepancyFlaggedParcels,
      parcelsWithSubmittedReports: parcelsWithSubmittedReportsSet.size,
      reportsAwaitingReview,
      acceptedReports,
      returnedReports,
      discrepancyFlaggedReports,
      inconclusiveFindings,
      outstandingReviewActions,
      outstandingDiscrepancies,
      discrepanciesSummary: discrepancyCounts,
      areaTotals: {
        recordedParcelArea: {
          total: recordedTotal,
          unit: recordedUnit,
          isCompatible: recordedIsCompatible,
          breakdownByUnit: recordedUnitsMap,
        },
        proposedAffectedArea: {
          total: proposedTotal,
          unit: proposedUnit,
          isCompatible: proposedIsCompatible,
          breakdownByUnit: proposedUnitsMap,
        },
      },
      parcelsSummary,
    };
  }

  private mapRowToDetails(
    row: Record<string, unknown>,
    evidence: FieldVerificationEvidence[],
    reviews: FieldVerificationReportReview[]
  ): FieldVerificationReportWithDetails {
    return {
      id: String(row.id),
      caseParcelId: String(row.caseParcelId),
      verifiedBy: row.verifiedBy ? String(row.verifiedBy) : null,
      verificationDate: row.verificationDate ? new Date(String(row.verificationDate)) : null,
      outcome: row.outcome ? (String(row.outcome) as any) : null,
      observations: row.observations ? String(row.observations) : null,
      measuredArea: row.measuredArea !== null && row.measuredArea !== undefined ? String(row.measuredArea) : null,
      measuredAreaUnit: row.measuredAreaUnit ? String(row.measuredAreaUnit) : null,
      measurementMethod: row.measurementMethod ? String(row.measurementMethod) : null,
      measurementNotes: row.measurementNotes ? String(row.measurementNotes) : null,
      status: String(row.status) as any,
      submittedAt: row.submittedAt ? new Date(String(row.submittedAt)) : null,
      reviewedBy: row.reviewedBy ? String(row.reviewedBy) : null,
      reviewedAt: row.reviewedAt ? new Date(String(row.reviewedAt)) : null,
      reviewDecision: row.reviewDecision ? String(row.reviewDecision) : null,
      reviewRemarks: row.reviewRemarks ? String(row.reviewRemarks) : null,
      previousReportId: row.previousReportId ? String(row.previousReportId) : null,
      revisionNumber: row.revisionNumber !== undefined && row.revisionNumber !== null ? Number(row.revisionNumber) : 1,
      createdBy: String(row.createdBy),
      createdAt: new Date(String(row.createdAt)),
      updatedAt: new Date(String(row.updatedAt)),
      caseParcel: {
        id: String(row.acp_id),
        caseId: String(row.acp_caseId),
        parcelId: String(row.acp_parcelId),
        proposedAffectedArea: String(row.acp_proposedAffectedArea),
        affectedAreaUnit: String(row.acp_affectedAreaUnit),
      },
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
      project: row.p_id
        ? {
            id: String(row.p_id),
            name: String(row.p_name),
            projectCode: String(row.p_projectCode),
          }
        : undefined,
      verifier: row.u_verif_id
        ? {
            id: String(row.u_verif_id),
            name: String(row.u_verif_name),
            email: String(row.u_verif_email),
          }
        : null,
      creator: {
        id: String(row.u_creator_id),
        name: String(row.u_creator_name),
        email: String(row.u_creator_email),
      },
      reviewer: row.u_reviewer_id
        ? {
            id: String(row.u_reviewer_id),
            name: String(row.u_reviewer_name),
            email: String(row.u_reviewer_email),
          }
        : null,
      evidence,
      reviews,
    };
  }
}

export const fieldVerificationReportRepository = new FieldVerificationReportRepository();
