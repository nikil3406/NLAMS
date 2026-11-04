import {
  fieldVerificationReportRepository,
  type FieldVerificationReportWithDetails,
  type CaseVerificationSummary,
} from '../../repositories/field-verification-report.repository';
import { parcelRepository } from '../../repositories/parcel.repository';
import { acquisitionCaseRepository } from '../../repositories/acquisition-case.repository';
import { permissionService } from '../authorization/permission.service';
import { scopeService } from '../authorization/scope.service';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../../types/errors';
import type {
  CreateFieldVerificationReportInput,
  UpdateFieldVerificationReportInput,
  SubmitFieldVerificationReportInput,
  EvidenceItemInput,
  ListFieldVerificationReportsQuery,
  ReviewFieldVerificationReportInput,
  ListReviewQueueQuery,
} from '../../validators/field-verification-reports';
import type { FieldVerificationEvidence } from '../../../db/schema/field-verification-evidence';

export interface PaginatedReportsResult {
  data: FieldVerificationReportWithDetails[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export class FieldVerificationReportService {
  /**
   * Asserts view access to the acquisition case within administrative scope.
   */
  private async assertCaseViewAccess(caseId: string, userId: string) {
    await permissionService.requirePermission(userId, 'ACQUISITION_CASE_VIEW');

    const acqCase = await acquisitionCaseRepository.findCaseById(caseId);
    if (!acqCase) {
      throw new NotFoundError(`Acquisition case with ID '${caseId}' not found`);
    }

    const inScope = await scopeService.isWithinAdministrativeScope(
      userId,
      acqCase.project.administrativeUnitId
    );
    if (!inScope) {
      throw new NotFoundError(`Acquisition case with ID '${caseId}' not found`);
    }

    return acqCase;
  }

  /**
   * Asserts management access for field verification operations.
   * Requirements:
   * - Caller must have ACQUISITION_CASE_VIEW permission.
   * - Caller must hold the FIELD_OFFICER role (separation of duties; SUPER_ADMIN cannot bypass).
   * - Case must be within caller's administrative scope.
   * - Case status must be AWAITING_FIELD_VERIFICATION.
   */
  private async assertFieldOfficerManagementAccess(caseId: string, userId: string) {
    await permissionService.requirePermission(userId, 'ACQUISITION_CASE_VIEW');

    // Separation of duties: Only FIELD_OFFICER can create or submit reports
    const callerRoles = await permissionService.getUserRoles(userId);
    if (!callerRoles.includes('FIELD_OFFICER')) {
      throw new ForbiddenError(
        'Forbidden: Only an authorized Field Officer may create, modify, or submit field verification reports'
      );
    }

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
        'Forbidden: case is outside your authorized administrative scope'
      );
    }

    if (acqCase.status !== 'AWAITING_FIELD_VERIFICATION') {
      throw new BadRequestError(
        `Cannot manage field verification reports: case is in '${acqCase.status}' status. Reports can only be created or modified when the case is in 'AWAITING_FIELD_VERIFICATION' status.`
      );
    }

    return acqCase;
  }

  /**
   * Asserts that a parcel association exists and belongs to the given case.
   */
  private async assertCaseParcelBelongsToCase(caseParcelId: string, caseId: string) {
    const caseParcel = await parcelRepository.findCaseParcelById(caseParcelId);
    if (!caseParcel || caseParcel.caseId !== caseId) {
      throw new NotFoundError(
        `Parcel association with ID '${caseParcelId}' not found for acquisition case '${caseId}'`
      );
    }
    return caseParcel;
  }

  /**
   * Asserts that a verification report exists and belongs to the given parcel association.
   */
  private async assertReportBelongsToCaseParcel(reportId: string, caseParcelId: string) {
    const report = await fieldVerificationReportRepository.findReportById(reportId);
    if (!report || report.caseParcelId !== caseParcelId) {
      throw new NotFoundError(
        `Field verification report with ID '${reportId}' not found for parcel association '${caseParcelId}'`
      );
    }
    return report;
  }

  /**
   * Creates a draft report for an authorized parcel association.
   */
  async createDraftReport(
    caseId: string,
    caseParcelId: string,
    input: CreateFieldVerificationReportInput,
    userId: string
  ): Promise<FieldVerificationReportWithDetails> {
    await this.assertFieldOfficerManagementAccess(caseId, userId);
    await this.assertCaseParcelBelongsToCase(caseParcelId, caseId);

    const report = await fieldVerificationReportRepository.createReport(
      {
        caseParcelId,
        verificationDate: input.verificationDate ? new Date(input.verificationDate) : null,
        outcome: input.outcome ?? null,
        observations: input.observations ?? null,
        measuredArea: input.measuredArea !== null && input.measuredArea !== undefined ? String(input.measuredArea) : null,
        measuredAreaUnit: input.measuredAreaUnit ?? null,
        measurementMethod: input.measurementMethod ?? null,
        measurementNotes: input.measurementNotes ?? null,
        createdBy: userId,
      },
      input.evidence
    );

    return report;
  }

  /**
   * Updates an editable draft report.
   * Can only be modified by its original author while in DRAFT status.
   */
  async updateDraftReport(
    caseId: string,
    caseParcelId: string,
    reportId: string,
    input: UpdateFieldVerificationReportInput,
    userId: string
  ): Promise<FieldVerificationReportWithDetails> {
    await this.assertFieldOfficerManagementAccess(caseId, userId);
    await this.assertCaseParcelBelongsToCase(caseParcelId, caseId);
    const existing = await this.assertReportBelongsToCaseParcel(reportId, caseParcelId);

    // Enforce author-only editing
    if (existing.createdBy !== userId) {
      throw new ForbiddenError(
        'Forbidden: only the author who created the draft report may modify it'
      );
    }

    // Enforce draft status
    if (existing.status !== 'DRAFT') {
      throw new ConflictError(
        `Cannot modify report: report has already been submitted and is locked for historical preservation`
      );
    }

    const updated = await fieldVerificationReportRepository.updateReport(reportId, {
      verificationDate: input.verificationDate !== undefined ? (input.verificationDate ? new Date(input.verificationDate) : null) : undefined,
      outcome: input.outcome,
      observations: input.observations,
      measuredArea: input.measuredArea !== undefined ? (input.measuredArea !== null ? String(input.measuredArea) : null) : undefined,
      measuredAreaUnit: input.measuredAreaUnit,
      measurementMethod: input.measurementMethod,
      measurementNotes: input.measurementNotes,
    });

    // If new evidence items were provided in update, attach them
    if (input.evidence && input.evidence.length > 0) {
      for (const ev of input.evidence) {
        await fieldVerificationReportRepository.addEvidence(reportId, {
          evidenceType: ev.evidenceType,
          fileReference: ev.fileReference,
          caption: ev.caption,
          description: ev.description,
          createdBy: userId,
        });
      }
      const reloaded = await fieldVerificationReportRepository.findReportById(reportId);
      if (reloaded) return reloaded;
    }

    return updated;
  }

  /**
   * Retrieves a single report with its associated parcel and case references.
   */
  async getReportById(
    caseId: string,
    caseParcelId: string,
    reportId: string,
    userId: string
  ): Promise<FieldVerificationReportWithDetails> {
    await this.assertCaseViewAccess(caseId, userId);
    await this.assertCaseParcelBelongsToCase(caseParcelId, caseId);
    const report = await this.assertReportBelongsToCaseParcel(reportId, caseParcelId);
    return report;
  }

  /**
   * Lists all reports for a specific parcel association with pagination.
   */
  async listReportsForParcel(
    caseId: string,
    caseParcelId: string,
    query: ListFieldVerificationReportsQuery,
    userId: string
  ): Promise<PaginatedReportsResult> {
    await this.assertCaseViewAccess(caseId, userId);
    await this.assertCaseParcelBelongsToCase(caseParcelId, caseId);

    const { data, total } = await fieldVerificationReportRepository.listReportsByCaseParcelId(
      caseParcelId,
      { page: query.page, limit: query.limit }
    );

    return {
      data,
      pagination: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit) || 1,
      },
    };
  }

  /**
   * Lists all reports for an entire acquisition case with pagination.
   */
  async listReportsForCase(
    caseId: string,
    query: ListFieldVerificationReportsQuery,
    userId: string
  ): Promise<PaginatedReportsResult> {
    await this.assertCaseViewAccess(caseId, userId);

    const { data, total } = await fieldVerificationReportRepository.listReportsByCaseId(
      caseId,
      { page: query.page, limit: query.limit }
    );

    return {
      data,
      pagination: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit) || 1,
      },
    };
  }

  /**
   * Attaches an evidence item to a draft report.
   */
  async attachEvidence(
    caseId: string,
    caseParcelId: string,
    reportId: string,
    input: EvidenceItemInput,
    userId: string
  ): Promise<FieldVerificationEvidence> {
    await this.assertFieldOfficerManagementAccess(caseId, userId);
    await this.assertCaseParcelBelongsToCase(caseParcelId, caseId);
    const report = await this.assertReportBelongsToCaseParcel(reportId, caseParcelId);

    if (report.createdBy !== userId) {
      throw new ForbiddenError(
        'Forbidden: only the author who created the draft report may attach evidence to it'
      );
    }

    if (report.status !== 'DRAFT') {
      throw new ConflictError(
        'Cannot attach evidence: report has already been submitted'
      );
    }

    return fieldVerificationReportRepository.addEvidence(reportId, {
      evidenceType: input.evidenceType,
      fileReference: input.fileReference,
      caption: input.caption,
      description: input.description,
      createdBy: userId,
    });
  }

  /**
   * Lists evidence items attached to a report.
   */
  async listEvidence(
    caseId: string,
    caseParcelId: string,
    reportId: string,
    userId: string
  ): Promise<FieldVerificationEvidence[]> {
    await this.assertCaseViewAccess(caseId, userId);
    await this.assertCaseParcelBelongsToCase(caseParcelId, caseId);
    await this.assertReportBelongsToCaseParcel(reportId, caseParcelId);

    return fieldVerificationReportRepository.getEvidenceByReportId(reportId);
  }

  /**
   * Submits a draft report for Land Officer review.
   *
   * Enforces:
   * - Authenticated author check.
   * - Draft status check (concurrency-safe; prevents double submission).
   * - Server-side validation of mandatory inspection fields:
   *   - Valid inspection date/time
   *   - Valid outcome (VERIFIED, DISCREPANCY_FOUND, INCONCLUSIVE)
   *   - Non-empty field observations
   *   - Positive measured area and valid unit if measured area is provided
   *   - At least one linked evidence item
   * - Atomically transitions report to SUBMITTED with server-derived verifiedBy and submittedAt.
   * - Case remains in AWAITING_FIELD_VERIFICATION status.
   */
  async submitReport(
    caseId: string,
    caseParcelId: string,
    reportId: string,
    input: SubmitFieldVerificationReportInput,
    userId: string
  ): Promise<FieldVerificationReportWithDetails> {
    await this.assertFieldOfficerManagementAccess(caseId, userId);
    await this.assertCaseParcelBelongsToCase(caseParcelId, caseId);
    const existing = await this.assertReportBelongsToCaseParcel(reportId, caseParcelId);

    // Enforce author-only submission
    if (existing.createdBy !== userId) {
      throw new ForbiddenError(
        'Forbidden: only the author who created the draft report may submit it'
      );
    }

    // Enforce draft status
    if (existing.status !== 'DRAFT') {
      throw new ConflictError(
        'Cannot submit report: report has already been submitted'
      );
    }

    // Attach any evidence supplied in the submission payload
    if (input.evidence && input.evidence.length > 0) {
      for (const ev of input.evidence) {
        await fieldVerificationReportRepository.addEvidence(reportId, {
          evidenceType: ev.evidenceType,
          fileReference: ev.fileReference,
          caption: ev.caption,
          description: ev.description,
          createdBy: userId,
        });
      }
    }

    // Server-side submission validation rules
    if (!existing.verificationDate) {
      throw new BadRequestError(
        'Validation failed for submission: inspection date/time (verificationDate) is required'
      );
    }

    if (!existing.outcome) {
      throw new BadRequestError(
        'Validation failed for submission: report outcome decision (VERIFIED, DISCREPANCY_FOUND, or INCONCLUSIVE) is required'
      );
    }

    if (!existing.observations || existing.observations.trim().length === 0) {
      throw new BadRequestError(
        'Validation failed for submission: field observations cannot be empty'
      );
    }

    if (existing.measuredArea !== null && existing.measuredArea !== undefined) {
      const numArea = parseFloat(existing.measuredArea);
      if (isNaN(numArea) || numArea <= 0) {
        throw new BadRequestError(
          'Validation failed for submission: measuredArea must be a positive number greater than 0'
        );
      }
      if (!existing.measuredAreaUnit) {
        throw new BadRequestError(
          'Validation failed for submission: measuredAreaUnit is required when measuredArea is provided'
        );
      }
    }

    // Evidence requirement: at least one linked evidence item
    const evidenceCount = await fieldVerificationReportRepository.countEvidenceByReportId(reportId);
    if (evidenceCount < 1) {
      throw new BadRequestError(
        'Validation failed for submission: at least one linked evidence item (e.g. photo, sketch, survey record) is required before submitting the field verification report'
      );
    }

    // Atomically transition status to SUBMITTED
    const submitted = await fieldVerificationReportRepository.submitReport(
      reportId,
      userId
    );

    if (!submitted) {
      throw new ConflictError(
        'Concurrent submission detected: report has already been transitioned from draft'
      );
    }

    return submitted;
  }

  /**
   * Reviews a submitted field verification report and records an authorized Land Officer workflow decision.
   *
   * Permitted decisions:
   *   - ACCEPTED
   *   - RETURNED_FOR_CORRECTION (mandatory remarks required)
   *   - DISCREPANCY_FLAGGED (mandatory remarks/reason required)
   *
   * Authorization rules:
   *   - Caller must hold ACQUISITION_CASE_VIEW permission.
   *   - Caller must hold the LAND_OFFICER role.
   *   - Case must be within caller's administrative scope.
   *   - Separation of duties: Reviewer CANNOT be the report author or the verifier who submitted it.
   *     SUPER_ADMIN does NOT bypass this separation of duties rule.
   *   - Report must be in SUBMITTED status (drafts cannot be reviewed; already reviewed reports reject duplicates).
   *   - Concurrency protection: Serialized conditional update in a transaction.
   *   - Preserves auditable history in field_verification_report_reviews table.
   */
  async reviewReport(
    caseId: string,
    caseParcelId: string,
    reportId: string,
    input: ReviewFieldVerificationReportInput,
    userId: string
  ): Promise<FieldVerificationReportWithDetails> {
    await this.assertCaseViewAccess(caseId, userId);
    await this.assertCaseParcelBelongsToCase(caseParcelId, caseId);

    // Role check: Only LAND_OFFICER or SUPER_ADMIN may review field verification reports
    const isSuper = await permissionService.isSuperAdmin(userId);
    const callerRoles = await permissionService.getUserRoles(userId);
    if (!isSuper && !callerRoles.includes('LAND_OFFICER')) {
      throw new ForbiddenError(
        'Forbidden: Only an authorized Land Officer or Super Admin may review field verification reports'
      );
    }

    const report = await this.assertReportBelongsToCaseParcel(reportId, caseParcelId);

    // Separation of duties: Reviewer cannot be the report author or verifier
    // SUPER_ADMIN does NOT bypass this rule.
    if (report.createdBy === userId || (report.verifiedBy && report.verifiedBy === userId)) {
      throw new ForbiddenError(
        'Forbidden: The officer who authored or submitted this field verification report cannot review it (separation of duties)'
      );
    }

    // Verify report eligibility
    if (report.status === 'DRAFT') {
      throw new BadRequestError(
        'Cannot review report: report is still in DRAFT status and has not been submitted for review'
      );
    }

    if (report.status !== 'SUBMITTED') {
      throw new ConflictError(
        `Cannot review report: report has already been reviewed (current status: '${report.status}')`
      );
    }

    // Validate remarks requirements
    const remarks = input.remarks?.trim() ?? null;
    if (input.decision === 'RETURNED_FOR_CORRECTION' && (!remarks || remarks.length < 5)) {
      throw new BadRequestError(
        'Remarks explaining correction requirements are mandatory when returning a report for correction (minimum 5 characters)'
      );
    }
    if (input.decision === 'DISCREPANCY_FLAGGED' && (!remarks || remarks.length < 5)) {
      throw new BadRequestError(
        'A reason or remarks explaining the discrepancy are mandatory when flagging a report (minimum 5 characters)'
      );
    }

    // Perform atomic review transition
    const reviewed = await fieldVerificationReportRepository.reviewReport(
      reportId,
      userId,
      input.decision,
      remarks
    );

    if (!reviewed) {
      throw new ConflictError(
        'Concurrent review detected: this report has already been transitioned by another reviewer'
      );
    }

    return reviewed;
  }

  /**
   * Initiates a correction revision for a report that was RETURNED_FOR_CORRECTION.
   *
   * Enforces:
   * - Caller must be an authorized FIELD_OFFICER with case management access.
   * - Caller must be the original author of the returned report.
   * - Original report must be in RETURNED_FOR_CORRECTION status.
   * - Preserves the returned report, its review decision, and audit history.
   * - Creates a new revision draft (incremented revisionNumber, linked via previousReportId)
   *   with copied observations, measurements, and evidence.
   */
  async createCorrectionDraft(
    caseId: string,
    caseParcelId: string,
    reportId: string,
    userId: string
  ): Promise<FieldVerificationReportWithDetails> {
    await this.assertFieldOfficerManagementAccess(caseId, userId);
    await this.assertCaseParcelBelongsToCase(caseParcelId, caseId);
    const existing = await this.assertReportBelongsToCaseParcel(reportId, caseParcelId);

    // Enforce author-only correction
    if (existing.createdBy !== userId) {
      throw new ForbiddenError(
        'Forbidden: only the author who created the report may initiate corrections for resubmission'
      );
    }

    // Must be in RETURNED_FOR_CORRECTION status
    if (existing.status !== 'RETURNED_FOR_CORRECTION') {
      throw new BadRequestError(
        `Cannot initiate correction: report is in '${existing.status}' status. Corrections can only be initiated on reports in 'RETURNED_FOR_CORRECTION' status.`
      );
    }

    const revisionDraft = await fieldVerificationReportRepository.createCorrectionDraft(
      reportId,
      userId
    );

    return revisionDraft;
  }

  /**
   * Lists submitted reports for the Land Officer review queue.
   * Strictly excludes DRAFT reports.
   * Scoped to the user's authorized administrative units.
   */
  async listReviewQueue(
    query: ListReviewQueueQuery,
    userId: string
  ): Promise<PaginatedReportsResult> {
    await permissionService.requirePermission(userId, 'ACQUISITION_CASE_VIEW');

    const isSuper = await permissionService.isSuperAdmin(userId);
    const callerRoles = await permissionService.getUserRoles(userId);

    if (!isSuper && !callerRoles.includes('LAND_OFFICER')) {
      throw new ForbiddenError(
        'Forbidden: Only an authorized Land Officer or Super Admin may access the review queue'
      );
    }

    let allowedUnitIds: string[] | undefined;

    if (!isSuper) {
      const assignedUnits = await scopeService.getUserAssignedUnits(userId);
      if (assignedUnits.length === 0) {
        return {
          data: [],
          pagination: {
            total: 0,
            page: query.page,
            limit: query.limit,
            totalPages: 1,
          },
        };
      }

      const unitIdSet = new Set<string>();
      for (const unit of assignedUnits) {
        const descendants = await scopeService.getDescendantUnitIds(unit.id);
        for (const id of descendants) {
          unitIdSet.add(id);
        }
      }
      allowedUnitIds = Array.from(unitIdSet);
    }

    const { data, total } = await fieldVerificationReportRepository.listReviewQueue({
      page: query.page,
      limit: query.limit,
      reviewStatus: query.reviewStatus,
      outcome: query.outcome,
      caseId: query.caseId,
      allowedUnitIds,
    });

    return {
      data,
      pagination: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit) || 1,
      },
    };
  }

  /**
   * Retrieves the case-level verification progress summary across all parcels and reports.
   */
  async getCaseVerificationSummary(
    caseId: string,
    userId: string
  ): Promise<CaseVerificationSummary> {
    await this.assertCaseViewAccess(caseId, userId);
    return fieldVerificationReportRepository.getCaseVerificationSummary(caseId);
  }
}

export const fieldVerificationReportService = new FieldVerificationReportService();
