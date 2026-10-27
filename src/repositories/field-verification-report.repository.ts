import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  fieldVerificationReports,
  type FieldVerificationReport,
} from '../../db/schema/field-verification-reports';
import {
  fieldVerificationEvidence,
  type FieldVerificationEvidence,
} from '../../db/schema/field-verification-evidence';
import { acquisitionCaseParcels } from '../../db/schema/acquisition-case-parcels';
import { landParcels } from '../../db/schema/land-parcels';
import { acquisitionCases } from '../../db/schema/acquisition-cases';
import type { TransactionClient } from './parcel.repository';

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
  evidence: FieldVerificationEvidence[];
}

export class FieldVerificationReportRepository {
  /**
   * Builds the comprehensive report detail object including relations and evidence.
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
        u_verif.id AS "u_verif_id",
        u_verif.name AS "u_verif_name",
        u_verif.email AS "u_verif_email",
        u_creator.id AS "u_creator_id",
        u_creator.name AS "u_creator_name",
        u_creator.email AS "u_creator_email"
      FROM field_verification_reports fvr
      INNER JOIN acquisition_case_parcels acp ON acp.id = fvr.case_parcel_id
      INNER JOIN land_parcels lp ON lp.id = acp.parcel_id
      INNER JOIN acquisition_cases ac ON ac.id = acp.case_id
      INNER JOIN users u_creator ON u_creator.id = fvr.created_by
      LEFT JOIN users u_verif ON u_verif.id = fvr.verified_by
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

    return this.mapRowToDetails(row, evidenceRows);
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
   * Lists reports for a specific parcel association, ordered deterministically by
   * verification date descending (nulls last) and created_at descending.
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
        u_verif.id AS "u_verif_id",
        u_verif.name AS "u_verif_name",
        u_verif.email AS "u_verif_email",
        u_creator.id AS "u_creator_id",
        u_creator.name AS "u_creator_name",
        u_creator.email AS "u_creator_email"
      FROM field_verification_reports fvr
      INNER JOIN acquisition_case_parcels acp ON acp.id = fvr.case_parcel_id
      INNER JOIN land_parcels lp ON lp.id = acp.parcel_id
      INNER JOIN acquisition_cases ac ON ac.id = acp.case_id
      INNER JOIN users u_creator ON u_creator.id = fvr.created_by
      LEFT JOIN users u_verif ON u_verif.id = fvr.verified_by
      WHERE fvr.case_parcel_id = ${caseParcelId}::uuid
      ORDER BY fvr.verification_date DESC NULLS LAST, fvr.created_at DESC
      LIMIT ${options.limit} OFFSET ${offset}
    `);

    const data: FieldVerificationReportWithDetails[] = [];
    for (const row of rows) {
      const evidenceRows = await executor
        .select()
        .from(fieldVerificationEvidence)
        .where(eq(fieldVerificationEvidence.reportId, String(row.id)))
        .orderBy(fieldVerificationEvidence.createdAt);
      data.push(this.mapRowToDetails(row, evidenceRows));
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
        u_verif.id AS "u_verif_id",
        u_verif.name AS "u_verif_name",
        u_verif.email AS "u_verif_email",
        u_creator.id AS "u_creator_id",
        u_creator.name AS "u_creator_name",
        u_creator.email AS "u_creator_email"
      FROM field_verification_reports fvr
      INNER JOIN acquisition_case_parcels acp ON acp.id = fvr.case_parcel_id
      INNER JOIN land_parcels lp ON lp.id = acp.parcel_id
      INNER JOIN acquisition_cases ac ON ac.id = acp.case_id
      INNER JOIN users u_creator ON u_creator.id = fvr.created_by
      LEFT JOIN users u_verif ON u_verif.id = fvr.verified_by
      WHERE acp.case_id = ${caseId}::uuid
      ORDER BY fvr.verification_date DESC NULLS LAST, fvr.created_at DESC
      LIMIT ${options.limit} OFFSET ${offset}
    `);

    const data: FieldVerificationReportWithDetails[] = [];
    for (const row of rows) {
      const evidenceRows = await executor
        .select()
        .from(fieldVerificationEvidence)
        .where(eq(fieldVerificationEvidence.reportId, String(row.id)))
        .orderBy(fieldVerificationEvidence.createdAt);
      data.push(this.mapRowToDetails(row, evidenceRows));
    }

    return { data, total };
  }

  private mapRowToDetails(
    row: Record<string, unknown>,
    evidence: FieldVerificationEvidence[]
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
      evidence,
    };
  }
}

export const fieldVerificationReportRepository = new FieldVerificationReportRepository();
