import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../../db';
import { acquisitionCaseParcels } from '../../../db/schema/acquisition-case-parcels';
import { fieldVerificationReports } from '../../../db/schema/field-verification-reports';
import {
  fieldVerificationEvidence,
  type FieldVerificationEvidence,
} from '../../../db/schema/field-verification-evidence';
import {
  discrepancyRepository,
  type DiscrepancyWithDetails,
  type DiscrepancyInvestigationWithDetails,
  type CaseDiscrepancyCounts,
} from '../../repositories/discrepancy.repository';
import { acquisitionCaseRepository } from '../../repositories/acquisition-case.repository';
import { permissionService } from '../authorization/permission.service';
import { scopeService } from '../authorization/scope.service';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../types/errors';
import type {
  ListDiscrepanciesQuery,
  CreateDiscrepancyInput,
  StartInvestigationInput,
  UpdateInvestigationInput,
  AttachInvestigationEvidenceInput,
  SubmitInvestigationInput,
  ResolveDiscrepancyInput,
} from '../../validators/discrepancies';

export class DiscrepancyService {
  /**
   * Asserts that an acquisition case exists, is within the user's administrative scope,
   * and that the caller holds the ACQUISITION_CASE_VIEW permission.
   */
  private async assertCaseAccess(caseId: string, userId: string) {
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
   * Asserts that a discrepancy exists and belongs to the given acquisition case.
   */
  private async assertDiscrepancyBelongsToCase(
    discrepancyId: string,
    caseId: string
  ): Promise<DiscrepancyWithDetails> {
    const discrepancy = await discrepancyRepository.findDiscrepancyById(discrepancyId);
    if (!discrepancy || discrepancy.caseId !== caseId) {
      throw new NotFoundError(
        `Discrepancy with ID '${discrepancyId}' not found for case '${caseId}'`
      );
    }
    return discrepancy;
  }

  /**
   * Lists all discrepancies for an acquisition case with filtering and pagination.
   */
  async listDiscrepancies(
    caseId: string,
    query: ListDiscrepanciesQuery,
    userId: string
  ): Promise<{
    data: DiscrepancyWithDetails[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
    counts: CaseDiscrepancyCounts;
  }> {
    await this.assertCaseAccess(caseId, userId);

    const { data, total } = await discrepancyRepository.listDiscrepanciesByCaseId(
      caseId,
      query
    );
    const counts = await discrepancyRepository.getCaseDiscrepancyCounts(caseId);

    return {
      data,
      pagination: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit) || 1,
      },
      counts,
    };
  }

  /**
   * Retrieves an individual discrepancy by ID.
   */
  async getDiscrepancyById(
    caseId: string,
    discrepancyId: string,
    userId: string
  ): Promise<DiscrepancyWithDetails> {
    await this.assertCaseAccess(caseId, userId);
    return this.assertDiscrepancyBelongsToCase(discrepancyId, caseId);
  }

  /**
   * Creates and submits a new parcel discrepancy.
   *
   * Responsibility model:
   * - Caller must be an authenticated, active FIELD_OFFICER.
   * - Parcel must belong to the acquisition case within caller's administrative scope.
   * - Discrepancy is initialized with status 'OPEN'.
   * - Creator is set to the Field Officer's immutable userId.
   */
  async createDiscrepancy(
    caseId: string,
    input: CreateDiscrepancyInput,
    userId: string
  ): Promise<DiscrepancyWithDetails> {
    const acqCase = await this.assertCaseAccess(caseId, userId);

    const callerRoles = await permissionService.getUserRoles(userId);
    if (!callerRoles.includes('FIELD_OFFICER')) {
      throw new ForbiddenError(
        'Forbidden: Only an authorized Field Officer within administrative scope may create and submit discrepancies'
      );
    }

    // Verify parcel belongs to case
    const [caseParcel] = await db
      .select({ id: acquisitionCaseParcels.id })
      .from(acquisitionCaseParcels)
      .where(
        and(
          eq(acquisitionCaseParcels.id, input.caseParcelId),
          eq(acquisitionCaseParcels.caseId, caseId)
        )
      )
      .limit(1);

    if (!caseParcel) {
      throw new NotFoundError(
        `Case parcel '${input.caseParcelId}' not found for case '${caseId}'`
      );
    }

    // Resolve reportId
    let reportId = input.reportId;
    if (reportId) {
      const [rpt] = await db
        .select({ id: fieldVerificationReports.id })
        .from(fieldVerificationReports)
        .where(
          and(
            eq(fieldVerificationReports.id, reportId),
            eq(fieldVerificationReports.caseParcelId, input.caseParcelId)
          )
        )
        .limit(1);
      if (!rpt) {
        throw new NotFoundError(
          `Field verification report '${reportId}' not found for parcel '${input.caseParcelId}'`
        );
      }
    } else {
      // Find latest report for this parcel
      const [latestReport] = await db
        .select({ id: fieldVerificationReports.id })
        .from(fieldVerificationReports)
        .where(eq(fieldVerificationReports.caseParcelId, input.caseParcelId))
        .orderBy(desc(fieldVerificationReports.createdAt))
        .limit(1);

      if (latestReport) {
        reportId = latestReport.id;
      } else {
        // If no report exists, create a report entry for this parcel
        const now = new Date();
        const [newReport] = await db
          .insert(fieldVerificationReports)
          .values({
            caseParcelId: input.caseParcelId,
            status: 'DISCREPANCY_FLAGGED',
            outcome: 'DISCREPANCY_FOUND',
            observations: input.description,
            verifiedBy: userId,
            createdBy: userId,
            submittedAt: now,
            verificationDate: now,
          })
          .returning({ id: fieldVerificationReports.id });
        reportId = newReport.id;
      }
    }

    if (input.evidence && input.evidence.length > 0 && reportId) {
      for (const ev of input.evidence) {
        await db.insert(fieldVerificationEvidence).values({
          reportId,
          evidenceType: ev.evidenceType,
          fileReference: ev.fileReference.trim(),
          caption: ev.caption?.trim() || null,
          description: ev.description?.trim() || null,
          createdBy: userId,
        });
      }
    }

    return discrepancyRepository.findOrCreateDiscrepancyForReport({
      caseId,
      caseParcelId: input.caseParcelId,
      reportId,
      category: input.category,
      description: input.description.trim(),
      createdBy: userId,
    });
  }

  /**
   * Starts a new investigation for a discrepancy.
   *
   * Authorization rules:
   * - Caller must have case view access within administrative scope.
   * - Caller must be an authorized LAND_OFFICER.
   * - Field Officer cannot conduct investigations.
   * - If assigning another investigator, assigned investigator must also be a Land Officer within case scope.
   * - Discrepancy must NOT be in RESOLVED status.
   */
  async startInvestigation(
    caseId: string,
    discrepancyId: string,
    input: StartInvestigationInput,
    userId: string
  ): Promise<{
    discrepancy: DiscrepancyWithDetails;
    investigation: DiscrepancyInvestigationWithDetails;
  }> {
    const acqCase = await this.assertCaseAccess(caseId, userId);
    const discrepancy = await this.assertDiscrepancyBelongsToCase(discrepancyId, caseId);

    if (discrepancy.status === 'RESOLVED') {
      throw new ConflictError(
        'Cannot start investigation: discrepancy has already been RESOLVED'
      );
    }

    const callerRoles = await permissionService.getUserRoles(userId);
    const isLandOfficer = callerRoles.includes('LAND_OFFICER');

    if (!isLandOfficer) {
      throw new ForbiddenError(
        'Forbidden: Only an authorized Land Officer may investigate discrepancies'
      );
    }

    let assignedInvestigatorId = userId;

    if (input.investigatorId && input.investigatorId !== userId) {
      const targetRoles = await permissionService.getUserRoles(input.investigatorId);
      if (!targetRoles.includes('LAND_OFFICER')) {
        throw new BadRequestError(
          'The assigned investigator must be an authorized Land Officer'
        );
      }

      // Check assigned investigator is within case scope
      const targetInScope = await scopeService.isWithinAdministrativeScope(
        input.investigatorId,
        acqCase.project.administrativeUnitId
      );
      if (!targetInScope) {
        throw new BadRequestError(
          'The assigned investigator is not within the administrative scope of this project'
        );
      }

      assignedInvestigatorId = input.investigatorId;
    }

    return discrepancyRepository.startInvestigation({
      discrepancyId,
      investigatorId: assignedInvestigatorId,
      notes: input.notes?.trim() || null,
      createdBy: userId,
    });
  }

  /**
   * Updates an investigation draft (findings or notes).
   * Only the assigned investigator or creator can update while in DRAFT status.
   */
  async updateInvestigation(
    caseId: string,
    discrepancyId: string,
    investigationId: string,
    input: UpdateInvestigationInput,
    userId: string
  ): Promise<DiscrepancyInvestigationWithDetails> {
    await this.assertCaseAccess(caseId, userId);
    const discrepancy = await this.assertDiscrepancyBelongsToCase(discrepancyId, caseId);

    const investigation = discrepancy.investigations.find(
      (i) => i.id === investigationId
    );
    if (!investigation) {
      throw new NotFoundError(
        `Investigation with ID '${investigationId}' not found for discrepancy '${discrepancyId}'`
      );
    }

    // Separation of duties / assignment check: only assigned investigator or creator can update
    const isSuper = await permissionService.isSuperAdmin(userId);
    if (
      !isSuper &&
      investigation.investigatorId !== userId &&
      investigation.createdBy !== userId
    ) {
      throw new ForbiddenError(
        'Forbidden: Only the assigned investigator may modify this investigation draft'
      );
    }

    if (investigation.status !== 'DRAFT') {
      throw new ConflictError(
        `Cannot update investigation: status is '${investigation.status}' (only DRAFT investigations can be modified)`
      );
    }

    return discrepancyRepository.updateInvestigation(investigationId, {
      findings: input.findings !== undefined ? input.findings?.trim() || null : undefined,
      notes: input.notes !== undefined ? input.notes?.trim() || null : undefined,
    });
  }

  /**
   * Attaches supporting evidence to an investigation.
   */
  async attachInvestigationEvidence(
    caseId: string,
    discrepancyId: string,
    investigationId: string,
    input: AttachInvestigationEvidenceInput,
    userId: string
  ): Promise<FieldVerificationEvidence> {
    await this.assertCaseAccess(caseId, userId);
    const discrepancy = await this.assertDiscrepancyBelongsToCase(discrepancyId, caseId);

    const investigation = discrepancy.investigations.find(
      (i) => i.id === investigationId
    );
    if (!investigation) {
      throw new NotFoundError(
        `Investigation with ID '${investigationId}' not found for discrepancy '${discrepancyId}'`
      );
    }

    const isSuper = await permissionService.isSuperAdmin(userId);
    if (
      !isSuper &&
      investigation.investigatorId !== userId &&
      investigation.createdBy !== userId
    ) {
      throw new ForbiddenError(
        'Forbidden: Only the assigned investigator may attach evidence to this investigation'
      );
    }

    if (investigation.status !== 'DRAFT') {
      throw new ConflictError(
        `Cannot attach evidence: investigation status is '${investigation.status}'`
      );
    }

    return discrepancyRepository.addInvestigationEvidence(investigationId, {
      evidenceType: input.evidenceType,
      fileReference: input.fileReference.trim(),
      caption: input.caption?.trim() || null,
      description: input.description?.trim() || null,
      createdBy: userId,
    });
  }

  /**
   * Submits investigation findings for resolution.
   * Requires mandatory findings (min 5 characters).
   * Transitions investigation to SUBMITTED and discrepancy to SUBMITTED_FOR_RESOLUTION.
   */
  async submitInvestigation(
    caseId: string,
    discrepancyId: string,
    investigationId: string,
    input: SubmitInvestigationInput,
    userId: string
  ): Promise<{
    discrepancy: DiscrepancyWithDetails;
    investigation: DiscrepancyInvestigationWithDetails;
  }> {
    await this.assertCaseAccess(caseId, userId);
    const discrepancy = await this.assertDiscrepancyBelongsToCase(discrepancyId, caseId);

    const investigation = discrepancy.investigations.find(
      (i) => i.id === investigationId
    );
    if (!investigation) {
      throw new NotFoundError(
        `Investigation with ID '${investigationId}' not found for discrepancy '${discrepancyId}'`
      );
    }

    const isSuper = await permissionService.isSuperAdmin(userId);
    if (
      !isSuper &&
      investigation.investigatorId !== userId &&
      investigation.createdBy !== userId
    ) {
      throw new ForbiddenError(
        'Forbidden: Only the assigned investigator may submit investigation findings'
      );
    }

    if (investigation.status !== 'DRAFT') {
      throw new ConflictError(
        `Cannot submit investigation: investigation is already in '${investigation.status}' status`
      );
    }

    const findings = input.findings.trim();
    if (findings.length < 5) {
      throw new BadRequestError(
        'Investigation findings must be at least 5 characters long'
      );
    }

    return discrepancyRepository.submitInvestigation(
      investigationId,
      findings,
      input.notes?.trim() || null
    );
  }

  /**
   * Records a resolution decision on a submitted discrepancy.
   *
   * Responsibility model:
   * - Only the original FIELD_OFFICER who created the discrepancy may review findings and confirm closure or request further investigation.
   * - Investigating Land Officer CANNOT approve, confirm, or close their own investigation.
   * - Other Field Officers CANNOT perform the original reporter's closure actions.
   * - Land Officers CANNOT close discrepancies.
   * - SUPER_ADMIN does NOT bypass this workflow rule on ordinary endpoints.
   * - Discrepancy must be in SUBMITTED_FOR_RESOLUTION status.
   * - Requires mandatory remarks (minimum 5 characters).
   */
  async resolveDiscrepancy(
    caseId: string,
    discrepancyId: string,
    input: ResolveDiscrepancyInput,
    userId: string
  ): Promise<DiscrepancyWithDetails> {
    await this.assertCaseAccess(caseId, userId);
    const discrepancy = await this.assertDiscrepancyBelongsToCase(discrepancyId, caseId);

    // Check status eligibility
    if (discrepancy.status !== 'SUBMITTED_FOR_RESOLUTION') {
      throw new ConflictError(
        `Cannot resolve discrepancy: current status is '${discrepancy.status}'. A resolution decision can only be made on discrepancies in 'SUBMITTED_FOR_RESOLUTION' status.`
      );
    }

    // Find the submitted investigation
    const submittedInvestigation = discrepancy.investigations.find(
      (i) => i.status === 'SUBMITTED'
    );
    if (!submittedInvestigation) {
      throw new ConflictError(
        'Cannot resolve discrepancy: no submitted investigation findings found'
      );
    }

    // Separation of duties: Investigator CANNOT approve, confirm, or close the discrepancy
    if (
      submittedInvestigation.investigatorId === userId ||
      submittedInvestigation.createdBy === userId
    ) {
      throw new ForbiddenError(
        'Forbidden: The investigating officer cannot review, confirm, or close their own investigation (separation of duties)'
      );
    }

    // Role check: Only FIELD_OFFICER role may review findings and confirm closure or request further investigation
    const callerRoles = await permissionService.getUserRoles(userId);
    if (!callerRoles.includes('FIELD_OFFICER')) {
      throw new ForbiddenError(
        'Forbidden: Only the original Field Officer who reported this discrepancy may review findings and confirm closure or request further investigation'
      );
    }

    // Creator check: Only the original Field Officer who created the discrepancy can confirm and close or request further investigation
    if (discrepancy.createdBy !== userId) {
      throw new ForbiddenError(
        'Forbidden: Only the original Field Officer who created this discrepancy may review findings, confirm closure, or request further investigation'
      );
    }

    const remarks = input.remarks.trim();
    if (remarks.length < 5) {
      throw new BadRequestError(
        'Resolution remarks explaining the decision are required (minimum 5 characters)'
      );
    }

    return discrepancyRepository.resolveDiscrepancy(discrepancyId, {
      investigationId: submittedInvestigation.id,
      decision: input.decision,
      remarks,
      resolvedBy: userId,
    });
  }
}

export const discrepancyService = new DiscrepancyService();
