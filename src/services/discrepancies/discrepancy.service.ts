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
  StartInvestigationInput,
  UpdateInvestigationInput,
  AttachInvestigationEvidenceInput,
  SubmitInvestigationInput,
  ResolveDiscrepancyInput,
} from '../../validators/discrepancies';
import type { FieldVerificationEvidence } from '../../../db/schema/field-verification-evidence';

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
   * Starts a new investigation for a discrepancy.
   *
   * Authorization rules:
   * - Caller must have case view access within administrative scope.
   * - Caller must be an authorized officer (FIELD_OFFICER, LAND_OFFICER, or SUPER_ADMIN).
   * - If assigning another investigator, caller must hold LAND_OFFICER or SUPER_ADMIN role.
   * - The assigned investigator must be a valid officer.
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

    const isSuper = await permissionService.isSuperAdmin(userId);
    const callerRoles = await permissionService.getUserRoles(userId);

    const isLandOfficer = callerRoles.includes('LAND_OFFICER');
    const isFieldOfficer = callerRoles.includes('FIELD_OFFICER');

    if (!isSuper && !isLandOfficer && !isFieldOfficer) {
      throw new ForbiddenError(
        'Forbidden: Only an authorized Field Officer, Land Officer, or Super Admin may conduct or assign investigations'
      );
    }

    let assignedInvestigatorId = userId;

    if (input.investigatorId && input.investigatorId !== userId) {
      // Delegating/assigning to another investigator requires Land Officer or Super Admin authority
      if (!isSuper && !isLandOfficer) {
        throw new ForbiddenError(
          'Forbidden: Only a Land Officer or Super Admin may assign an investigation to another officer'
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
   * Records an authorized resolution decision on a submitted discrepancy.
   *
   * Separation of duties:
   * - Authorized decision-maker CANNOT be the investigator who conducted/submitted the investigation.
   * - SUPER_ADMIN cannot bypass this separation of duties rule.
   * - Caller must have Land Officer or ACQUISITION_CASE_REVIEW authority.
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

    // Role/permission check: Land Officer, Project Officer (ACQUISITION_CASE_REVIEW), or Super Admin
    const isSuper = await permissionService.isSuperAdmin(userId);
    const callerRoles = await permissionService.getUserRoles(userId);
    const userPermissions = await permissionService.getUserPermissions(userId);

    const hasReviewAuthority =
      isSuper ||
      callerRoles.includes('LAND_OFFICER') ||
      callerRoles.includes('PROJECT_OFFICER') ||
      userPermissions.includes('ACQUISITION_CASE_REVIEW');

    if (!hasReviewAuthority) {
      throw new ForbiddenError(
        'Forbidden: Only an authorized Land Officer, Project Officer, or Super Admin may resolve discrepancies'
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

    // Separation of duties: Reviewer / decision-maker CANNOT be the investigator
    // SUPER_ADMIN does NOT bypass this separation of duties rule
    if (
      submittedInvestigation.investigatorId === userId ||
      submittedInvestigation.createdBy === userId
    ) {
      throw new ForbiddenError(
        'Forbidden: The officer who investigated or submitted findings cannot resolve the discrepancy (separation of duties)'
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
