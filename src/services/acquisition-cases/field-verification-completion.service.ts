import { eq, sql } from 'drizzle-orm';
import { db } from '../../../db';
import { acquisitionCases, acquisitionCaseWorkflowHistory } from '../../../db/schema/acquisition-cases';
import { acquisitionCaseParcels } from '../../../db/schema/acquisition-case-parcels';
import { fieldVerificationReports } from '../../../db/schema/field-verification-reports';
import { fieldVerificationEvidence } from '../../../db/schema/field-verification-evidence';
import { fieldVerificationReportReviews } from '../../../db/schema/field-verification-report-reviews';
import { parcelDiscrepancies } from '../../../db/schema/parcel-discrepancies';
import { discrepancyInvestigations } from '../../../db/schema/discrepancy-investigations';
import { discrepancyResolutionHistory } from '../../../db/schema/discrepancy-resolution-history';
import { users } from '../../../db/schema/users';
import { userRoles } from '../../../db/schema/user-roles';
import { roles } from '../../../db/schema/roles';
import { userAssignments } from '../../../db/schema/user-assignments';
import { acquisitionCaseRepository } from '../../repositories/acquisition-case.repository';
import { parcelRepository } from '../../repositories/parcel.repository';
import { userRepository } from '../../repositories/user.repository';
import { permissionService } from '../authorization/permission.service';
import { scopeService } from '../authorization/scope.service';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../types/errors';

export type TransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface UnmetCondition {
  code:
    | 'NO_PARCELS'
    | 'PARCEL_MISSING_ACCEPTED_REPORT'
    | 'LATEST_REPORT_NOT_ACCEPTED'
    | 'REVIEWER_NOT_VERIFIED'
    | 'MISSING_EVIDENCE'
    | 'REPORT_AWAITING_REVIEW'
    | 'INCONCLUSIVE_OR_DISCREPANCY_OUTCOME'
    | 'UNRESOLVED_DISCREPANCY'
    | 'DISCREPANCY_NOT_FORMALLY_RESOLVED'
    | 'MISSING_AUDIT_RECORD'
    | 'INVALID_CASE_STATUS';
  message: string;
  parcelId?: string;
  caseParcelId?: string;
  reportId?: string;
  discrepancyId?: string;
}

export interface CaseCompletionEligibility {
  isEligible: boolean;
  caseId: string;
  caseStatus: string;
  totalRequiredParcels: number;
  acceptedParcels: number;
  reportsAwaitingReview: number;
  unresolvedDiscrepancies: number;
  unmetConditions: UnmetCondition[];
}

export class FieldVerificationCompletionService {
  /**
   * Asserts caller is an active, verified Land Officer with administrative scope over the case.
   * Super Admin cannot bypass the verified Land Officer separation of duties rule for completion.
   */
  async assertAuthorizedCompletingOfficer(caseId: string, userId: string) {
    const user = await userRepository.findUserById(userId);
    if (!user) {
      throw new ForbiddenError('Forbidden: User not found');
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenError(
        `Forbidden: User account status is '${user.status}'. Only active and verified Land Officers may complete field verification.`
      );
    }

    const isSuper = await permissionService.isSuperAdmin(userId);
    const callerRoles = await permissionService.getUserRoles(userId);

    if (!callerRoles.includes('LAND_OFFICER') && !isSuper) {
      throw new ForbiddenError(
        'Forbidden: Only an authorized Land Officer may complete field verification'
      );
    }

    // Role verification: Non-super admin Land Officer must have active unit assignment
    if (!isSuper) {
      const assignedUnits = await scopeService.getUserAssignedUnits(userId);
      if (assignedUnits.length === 0) {
        throw new ForbiddenError(
          'Forbidden: Land Officer has no active administrative unit assignment (unverified status)'
        );
      }
    }

    // Must have ACQUISITION_CASE_VIEW and case in administrative scope
    const acqCase = await acquisitionCaseRepository.findCaseById(caseId);
    if (!acqCase) {
      throw new NotFoundError(`Acquisition case with ID '${caseId}' not found`);
    }

    const inScope = await scopeService.isWithinAdministrativeScope(
      userId,
      acqCase.project.administrativeUnitId
    );
    if (!inScope) {
      throw new ForbiddenError(
        'Forbidden: Acquisition case is outside your authorized administrative scope'
      );
    }

    return acqCase;
  }

  /**
   * Validates all field verification completion requirements for a case.
   * Can run either outside or inside an existing transaction client.
   */
  async validateCaseCompletion(
    caseId: string,
    txClient?: TransactionClient
  ): Promise<CaseCompletionEligibility> {
    const executor = (txClient ?? db) as typeof db;

    // 1. Fetch case
    const [caseRow] = await executor
      .select({
        id: acquisitionCases.id,
        status: acquisitionCases.status,
      })
      .from(acquisitionCases)
      .where(eq(acquisitionCases.id, caseId))
      .limit(1);

    if (!caseRow) {
      throw new NotFoundError(`Acquisition case with ID '${caseId}' not found`);
    }

    const unmetConditions: UnmetCondition[] = [];

    // Check Case Status: Must be AWAITING_FIELD_VERIFICATION
    if (caseRow.status !== 'AWAITING_FIELD_VERIFICATION') {
      unmetConditions.push({
        code: 'INVALID_CASE_STATUS',
        message: `Case status is '${caseRow.status}'. Field verification can only be completed when case is in 'AWAITING_FIELD_VERIFICATION' status.`,
      });
    }

    // 2. Fetch all case parcels
    const caseParcelsRows = await executor.execute(sql`
      SELECT
        acp.id AS "caseParcelId",
        acp.parcel_id AS "parcelId",
        lp.parcel_id AS "parcelIdentifier",
        lp.survey_number AS "surveyNumber"
      FROM acquisition_case_parcels acp
      INNER JOIN land_parcels lp ON lp.id = acp.parcel_id
      WHERE acp.case_id = ${caseId}::uuid
      ORDER BY acp.created_at ASC
    `);

    const totalRequiredParcels = caseParcelsRows.length;
    if (totalRequiredParcels === 0) {
      unmetConditions.push({
        code: 'NO_PARCELS',
        message: 'The case has no linked parcels required for field verification.',
      });
    }

    // 3. Fetch all reports for the case parcels
    const reportsRows = await executor.execute(sql`
      SELECT
        fvr.id,
        fvr.case_parcel_id AS "caseParcelId",
        fvr.status,
        fvr.outcome,
        fvr.reviewed_by AS "reviewedBy",
        fvr.reviewed_at AS "reviewedAt",
        fvr.review_decision AS "reviewDecision",
        fvr.revision_number AS "revisionNumber",
        fvr.submitted_at AS "submittedAt",
        fvr.created_at AS "createdAt",
        u_rev.status AS "reviewerStatus",
        (
          SELECT COUNT(*)::int
          FROM field_verification_evidence fve
          WHERE fve.report_id = fvr.id
        ) AS "evidenceCount",
        (
          SELECT COUNT(*)::int
          FROM field_verification_report_reviews fvrr
          WHERE fvrr.report_id = fvr.id AND fvrr.to_status = 'ACCEPTED'
        ) AS "acceptedReviewAuditCount",
        EXISTS (
          SELECT 1
          FROM user_roles ur
          INNER JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = fvr.reviewed_by AND r.name IN ('LAND_OFFICER', 'SUPER_ADMIN')
        ) AS "reviewerIsLandOfficer",
        EXISTS (
          SELECT 1
          FROM user_assignments ua
          WHERE ua.user_id = fvr.reviewed_by AND ua.status = 'ACTIVE'
        ) AS "reviewerHasActiveAssignment",
        EXISTS (
          SELECT 1
          FROM user_roles ur
          INNER JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = fvr.reviewed_by AND r.name = 'SUPER_ADMIN'
        ) AS "reviewerIsSuperAdmin"
      FROM field_verification_reports fvr
      INNER JOIN acquisition_case_parcels acp ON acp.id = fvr.case_parcel_id
      LEFT JOIN users u_rev ON u_rev.id = fvr.reviewed_by
      WHERE acp.case_id = ${caseId}::uuid
      ORDER BY fvr.case_parcel_id, fvr.revision_number DESC, fvr.submitted_at DESC NULLS LAST, fvr.created_at DESC
    `);

    // Group reports by caseParcelId
    const reportsByCaseParcel = new Map<string, any[]>();
    let reportsAwaitingReview = 0;

    for (const rpt of reportsRows) {
      const cpId = String(rpt.caseParcelId);
      if (!reportsByCaseParcel.has(cpId)) {
        reportsByCaseParcel.set(cpId, []);
      }
      reportsByCaseParcel.get(cpId)!.push(rpt);

      if (rpt.status === 'SUBMITTED') {
        reportsAwaitingReview++;
      }
    }

    let acceptedParcels = 0;

    // Validate per parcel
    for (const cp of caseParcelsRows) {
      const cpId = String(cp.caseParcelId);
      const parcelIdentifier = String(cp.parcelIdentifier || cp.surveyNumber);
      const parcelReports = reportsByCaseParcel.get(cpId) || [];

      if (parcelReports.length === 0) {
        unmetConditions.push({
          code: 'PARCEL_MISSING_ACCEPTED_REPORT',
          caseParcelId: cpId,
          parcelId: parcelIdentifier,
          message: `Parcel ${parcelIdentifier} has no field verification reports submitted or accepted.`,
        });
        continue;
      }

      // Check if any report is currently SUBMITTED awaiting review
      const awaitingReview = parcelReports.find((r) => r.status === 'SUBMITTED');
      if (awaitingReview) {
        unmetConditions.push({
          code: 'REPORT_AWAITING_REVIEW',
          caseParcelId: cpId,
          parcelId: parcelIdentifier,
          reportId: String(awaitingReview.id),
          message: `Parcel ${parcelIdentifier} has a submitted report awaiting review.`,
        });
      }

      // Check latest report
      const latestReport = parcelReports[0];

      // Must be ACCEPTED
      if (latestReport.status !== 'ACCEPTED') {
        unmetConditions.push({
          code: 'LATEST_REPORT_NOT_ACCEPTED',
          caseParcelId: cpId,
          parcelId: parcelIdentifier,
          reportId: String(latestReport.id),
          message: `Parcel ${parcelIdentifier}'s latest report is not accepted (current status: '${latestReport.status}').`,
        });
      } else {
        acceptedParcels++;

        // Outcome must NOT be INCONCLUSIVE
        if (latestReport.outcome === 'INCONCLUSIVE') {
          unmetConditions.push({
            code: 'INCONCLUSIVE_OR_DISCREPANCY_OUTCOME',
            caseParcelId: cpId,
            parcelId: parcelIdentifier,
            reportId: String(latestReport.id),
            message: `Parcel ${parcelIdentifier}'s accepted report has an inconclusive outcome.`,
          });
        }

        // Reviewer must be verified Land Officer
        const isSuper = Boolean(latestReport.reviewerIsSuperAdmin);
        const isLO = Boolean(latestReport.reviewerIsLandOfficer);
        const isActiveLO =
          latestReport.reviewerStatus === 'ACTIVE' &&
          (isSuper || (isLO && Boolean(latestReport.reviewerHasActiveAssignment)));

        if (!isActiveLO) {
          unmetConditions.push({
            code: 'REVIEWER_NOT_VERIFIED',
            caseParcelId: cpId,
            parcelId: parcelIdentifier,
            reportId: String(latestReport.id),
            message: `Parcel ${parcelIdentifier}'s report was not reviewed by a verified and active Land Officer.`,
          });
        }

        // Must satisfy evidence requirements (at least 1 linked evidence)
        const evidCount = Number(latestReport.evidenceCount || 0);
        if (evidCount < 1) {
          unmetConditions.push({
            code: 'MISSING_EVIDENCE',
            caseParcelId: cpId,
            parcelId: parcelIdentifier,
            reportId: String(latestReport.id),
            message: `Parcel ${parcelIdentifier}'s accepted report has no attached evidence.`,
          });
        }

        // Must have review audit record
        const auditCount = Number(latestReport.acceptedReviewAuditCount || 0);
        if (auditCount < 1) {
          unmetConditions.push({
            code: 'MISSING_AUDIT_RECORD',
            caseParcelId: cpId,
            parcelId: parcelIdentifier,
            reportId: String(latestReport.id),
            message: `Parcel ${parcelIdentifier}'s accepted report is missing an auditable review record.`,
          });
        }
      }
    }

    // 4. Validate formal discrepancies for this case
    const discrepancyRows = await executor.execute(sql`
      SELECT
        pd.id,
        pd.status,
        pd.category,
        pd.description,
        (
          SELECT COUNT(*)::int
          FROM discrepancy_resolution_history drh
          WHERE drh.discrepancy_id = pd.id AND drh.decision = 'RESOLVED'
        ) AS "resolvedDecisionCount",
        EXISTS (
          SELECT 1
          FROM discrepancy_resolution_history drh
          WHERE drh.discrepancy_id = pd.id AND drh.remarks ILIKE '%exception%'
        ) AS "hasExceptionDecision"
      FROM parcel_discrepancies pd
      WHERE pd.case_id = ${caseId}::uuid
    `);

    let unresolvedDiscrepancies = 0;

    for (const d of discrepancyRows) {
      const discId = String(d.id);
      if (d.status !== 'RESOLVED') {
        unresolvedDiscrepancies++;
        unmetConditions.push({
          code: 'UNRESOLVED_DISCREPANCY',
          discrepancyId: discId,
          message: `Discrepancy '${discId}' is not resolved (current status: '${d.status}').`,
        });
      } else {
        // Formally resolved check
        const resolvedDecisions = Number(d.resolvedDecisionCount || 0);
        if (resolvedDecisions < 1) {
          unresolvedDiscrepancies++;
          unmetConditions.push({
            code: 'DISCREPANCY_NOT_FORMALLY_RESOLVED',
            discrepancyId: discId,
            message: `Discrepancy '${discId}' is marked RESOLVED but lacks an authorized resolution decision in history.`,
          });
        }

        // Business rule: "An authorized exception must not count as a resolved discrepancy."
        if (d.hasExceptionDecision) {
          unresolvedDiscrepancies++;
          unmetConditions.push({
            code: 'UNRESOLVED_DISCREPANCY',
            discrepancyId: discId,
            message: `Discrepancy '${discId}' was closed as an administrative exception, which cannot count as a resolved discrepancy for verification completion.`,
          });
        }
      }
    }

    const isEligible = unmetConditions.length === 0 && totalRequiredParcels > 0;

    return {
      isEligible,
      caseId,
      caseStatus: caseRow.status,
      totalRequiredParcels,
      acceptedParcels,
      reportsAwaitingReview,
      unresolvedDiscrepancies,
      unmetConditions,
    };
  }

  /**
   * Completes field verification for an acquisition case.
   * Runs in a serializable/row-locked database transaction with full pre-validation.
   */
  async completeFieldVerification(
    caseId: string,
    remarks: string | undefined,
    userId: string
  ): Promise<{ success: boolean; caseId: string; status: string; completedAt: Date }> {
    // 1. Authorize user
    await this.assertAuthorizedCompletingOfficer(caseId, userId);

    // 2. Perform atomic completion transition inside transaction
    return db.transaction(async (tx: TransactionClient) => {
      // Lock case row for update
      const [lockedCase] = await tx
        .select({
          id: acquisitionCases.id,
          caseReference: acquisitionCases.caseReference,
          status: acquisitionCases.status,
        })
        .from(acquisitionCases)
        .where(eq(acquisitionCases.id, caseId))
        .for('update');

      if (!lockedCase) {
        throw new NotFoundError(`Acquisition case with ID '${caseId}' not found`);
      }

      if (lockedCase.status === 'FIELD_VERIFICATION_COMPLETED') {
        throw new ConflictError(
          'Field verification has already been completed for this acquisition case'
        );
      }

      if (lockedCase.status !== 'AWAITING_FIELD_VERIFICATION') {
        throw new BadRequestError(
          `Cannot complete field verification: case status is '${lockedCase.status}'. Case must be in 'AWAITING_FIELD_VERIFICATION' status.`
        );
      }

      // Revalidate all business rules inside the locked transaction
      const eligibility = await this.validateCaseCompletion(caseId, tx);
      if (!eligibility.isEligible) {
        const details = eligibility.unmetConditions.map((c) => c.message).join('; ');
        throw new ConflictError(
          `Case is not eligible for field verification completion: ${details}`
        );
      }

      const now = new Date();

      // Update case status to FIELD_VERIFICATION_COMPLETED
      const [updatedCase] = await tx
        .update(acquisitionCases)
        .set({
          status: 'FIELD_VERIFICATION_COMPLETED',
          updatedBy: userId,
          updatedAt: now,
        })
        .where(
          sql`${acquisitionCases.id} = ${caseId}::uuid AND ${acquisitionCases.status} = 'AWAITING_FIELD_VERIFICATION'`
        )
        .returning();

      if (!updatedCase) {
        throw new ConflictError(
          'Concurrent completion detected: case status has already been modified'
        );
      }

      // Record workflow history audit record
      await tx.insert(acquisitionCaseWorkflowHistory).values({
        caseId,
        caseReference: lockedCase.caseReference,
        fromStatus: 'AWAITING_FIELD_VERIFICATION',
        toStatus: 'FIELD_VERIFICATION_COMPLETED',
        action: 'COMPLETE_FIELD_VERIFICATION',
        actorId: userId,
        remarks: remarks?.trim() || 'Field verification successfully completed. All parcels verified and discrepancies resolved.',
        createdAt: now,
      });

      return {
        success: true,
        caseId,
        status: 'FIELD_VERIFICATION_COMPLETED',
        completedAt: now,
      };
    });
  }
}

export const fieldVerificationCompletionService =
  new FieldVerificationCompletionService();
