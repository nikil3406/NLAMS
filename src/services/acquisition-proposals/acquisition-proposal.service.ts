import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../../../db';
import {
  acquisitionProposalRepository,
  type ProposalWithDetails,
  type ProposalListItem,
  type ProposalFilterOptions,
  type CompetentAuthorityReviewItem,
  type CompetentAuthorityReviewFilterOptions,
} from '../../repositories/acquisition-proposal.repository';
import { acquisitionCaseRepository } from '../../repositories/acquisition-case.repository';
import { verifiedLandInventoryRepository } from '../../repositories/verified-land-inventory.repository';
import { acquisitionProposals } from '../../../db/schema/acquisition-proposals';
import { acquisitionCases } from '../../../db/schema/acquisition-cases';
import { projects } from '../../../db/schema/projects';
import { verifiedLandInventories } from '../../../db/schema/verified-land-inventories';
import { userRepository } from '../../repositories/user.repository';
import { competentAuthorityRepository } from '../../repositories/competent-authority.repository';
import { competentAuthorityService } from '../competent-authorities/competent-authority.service';

type TransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];
import { permissionService } from '../authorization/permission.service';
import { scopeService } from '../authorization/scope.service';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../types/errors';
import {
  proposalValidationService,
  type ProposalValidationReport,
} from './proposal-validation.service';
import type {
  CreateAcquisitionProposalInput,
  UpdateAcquisitionProposalInput,
  AcquisitionProposalQueryInput,
} from '../../validators/acquisition-proposals';

export interface PaginatedProposalsResult {
  data: ProposalListItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export class AcquisitionProposalService {
  /**
   * Asserts caller is an active, authorized Implementing Agency user.
   *
   * Super Admin and Ministry Admin do not automatically gain ordinary proposal workflow privileges.
   */
  async assertAuthorizedImplementingAgency(userId: string): Promise<void> {
    const user = await userRepository.findUserById(userId);
    if (!user) {
      throw new ForbiddenError('Forbidden: User not found');
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenError(
        `Forbidden: User account status is '${user.status}'. Only active Implementing Agency users may manage proposals.`
      );
    }

    const callerRoles = await permissionService.getUserRoles(userId);
    const isAgencyRole =
      callerRoles.includes('IMPLEMENTING_AGENCY') ||
      callerRoles.includes('PROJECT_OFFICER');

    if (!isAgencyRole) {
      throw new ForbiddenError(
        'Forbidden: Only an authorized Implementing Agency user may manage acquisition proposals'
      );
    }
  }

  /**
   * Creates an acquisition proposal in DRAFT status with initial Version 1.
   *
   * Enforces:
   * 1. Authenticated user is an active, authorized Implementing Agency user.
   * 2. Acquisition case exists and its project is in REGISTERED status.
   * 3. User is within the administrative scope of the linked project.
   * 4. One proposal per acquisition case (database unique constraint and pre-check).
   * 5. Selected verified land inventory belongs to the same acquisition case.
   * 6. Selected verified land inventory is Ministry-approved (status 'APPROVED').
   * 7. Concurrency-safe unique proposal number generation.
   * 8. Transactional creation of proposal header, Version 1, and initial audit record.
   */
  async createProposal(
    input: CreateAcquisitionProposalInput,
    userId: string
  ): Promise<ProposalWithDetails> {
    // 1. Authorize Implementing Agency caller
    await this.assertAuthorizedImplementingAgency(userId);

    // 2. Validate acquisition case
    const acqCase = await acquisitionCaseRepository.findCaseById(
      input.acquisitionCaseId
    );
    if (!acqCase) {
      throw new NotFoundError(
        `Acquisition case with ID '${input.acquisitionCaseId}' not found`
      );
    }

    if (acqCase.status === 'REJECTED') {
      throw new BadRequestError(
        `Cannot create acquisition proposal: acquisition case status is '${acqCase.status}'.`
      );
    }

    if (acqCase.project.status !== 'REGISTERED') {
      throw new BadRequestError(
        `Cannot create acquisition proposal: linked project status is '${acqCase.project.status}'. Proposals can only be prepared for projects with 'REGISTERED' status.`
      );
    }

    // 3. Administrative scope verification over linked project's administrative unit
    const inScope = await scopeService.isWithinAdministrativeScope(
      userId,
      acqCase.project.administrativeUnitId
    );
    if (!inScope) {
      throw new ForbiddenError(
        'Forbidden: Linked project is outside your authorized administrative scope'
      );
    }

    // 4. Pre-check for duplicate proposal on the case
    const existingProposal =
      await acquisitionProposalRepository.findProposalByCaseId(
        input.acquisitionCaseId
      );
    if (existingProposal) {
      throw new ConflictError(
        `An acquisition proposal already exists for acquisition case '${acqCase.caseReference}'`
      );
    }

    // 5. Validate linked inventory
    const inventory =
      await verifiedLandInventoryRepository.findInventoryWithDetails(
        input.linkedInventoryId
      );
    if (!inventory) {
      throw new NotFoundError(
        `Verified land inventory with ID '${input.linkedInventoryId}' not found`
      );
    }

    if (inventory.caseId !== input.acquisitionCaseId) {
      throw new BadRequestError(
        `Cannot link inventory: the selected verified land inventory does not belong to acquisition case '${acqCase.caseReference}'.`
      );
    }

    // 6. Verify Ministry-approved status
    if (inventory.status !== 'APPROVED') {
      throw new BadRequestError(
        `Cannot create proposal: linked verified land inventory is in '${inventory.status}' status. Only Ministry-approved inventories (status 'APPROVED') may be linked to an acquisition proposal.`
      );
    }

    // 7. Validate selected Competent Authority if provided
    if (input.competentAuthorityId) {
      const eligible =
        await competentAuthorityService.getEligibleAuthoritiesForCase(
          input.acquisitionCaseId
        );
      const isEligible = eligible.authorities.some(
        (a) => a.id === input.competentAuthorityId
      );
      if (!isEligible) {
        throw new BadRequestError(
          'The selected Competent Authority does not have valid jurisdiction over the affected parcels in this acquisition proposal.'
        );
      }
    }

    // 8. Generate concurrency-safe proposal number
    const proposalNumber =
      await acquisitionProposalRepository.generateProposalNumber();

    // 9. Transactional creation
    const createdProposal = await db.transaction(
      async (tx: TransactionClient) => {
        // Double check within transaction
        const doubleCheck =
          await acquisitionProposalRepository.findProposalByCaseId(
            input.acquisitionCaseId,
            tx
          );
        if (doubleCheck) {
          throw new ConflictError(
            `An acquisition proposal already exists for acquisition case '${acqCase.caseReference}'`
          );
        }

        // Insert header
        const header = await acquisitionProposalRepository.createProposal(
          {
            proposalNumber,
            acquisitionCaseId: input.acquisitionCaseId,
            projectId: acqCase.projectId,
            implementingAgencyId: acqCase.project.implementingAgencyId,
            createdBy: userId,
            linkedInventoryId: inventory.id,
            linkedInventoryVersionId: inventory.id,
            currentVersionNumber: 1,
            currentStatus: 'DRAFT',
          },
          tx
        );

        // Insert Version 1
        const version =
          await acquisitionProposalRepository.createProposalVersion(
            {
              proposalId: header.id,
              versionNumber: 1,
              status: 'DRAFT',
              acquisitionJustification: input.acquisitionJustification,
              publicPurpose: input.publicPurpose,
              legalFramework: input.legalFramework,
              landRequirementExplanation: input.landRequirementExplanation,
              administrativeApprovalRef:
                input.administrativeApprovalRef?.trim() || null,
              administrativeApprovalDate: input.administrativeApprovalDate
                ? new Date(input.administrativeApprovalDate)
                : null,
              additionalDetails: input.additionalDetails ?? null,
              supportingDocuments: input.supportingDocuments ?? null,
              selectedAuthorityId: input.competentAuthorityId ?? null,
              createdBy: userId,
            },
            tx
          );

        // Record authority assignment if selected
        if (input.competentAuthorityId) {
          await competentAuthorityRepository.createProposalAuthorityAssignment(
            {
              proposalId: header.id,
              proposalVersionId: version.id,
              authorityId: input.competentAuthorityId,
              assignmentStatus: 'ACTIVE',
              assignedBy: userId,
            },
            tx
          );
        }

        // Link currentVersionId on header
        await acquisitionProposalRepository.updateProposal(
          header.id,
          { currentVersionId: version.id },
          tx
        );

        // Record audit workflow history
        await acquisitionProposalRepository.createWorkflowHistory(
          {
            proposalId: header.id,
            versionNumber: 1,
            action: 'CREATE_DRAFT',
            fromStatus: null,
            toStatus: 'DRAFT',
            actorId: userId,
            remarks: 'Initial proposal draft prepared',
          },
          tx
        );

        return header;
      }
    );

    const detailed = await acquisitionProposalRepository.findProposalById(
      createdProposal.id
    );
    if (!detailed) {
      throw new Error('Failed to load created acquisition proposal');
    }

    return detailed;
  }

  /**
   * Updates an existing draft proposal.
   *
   * Enforces:
   * 1. Proposal must exist and be in DRAFT status.
   * 2. Only the original creator who is an authorized Implementing Agency user can edit their draft.
   * 3. Cannot change acquisitionCaseId, linkedInventoryId, or project through draft updates.
   * 4. Updates Version 1 in-place and records audit history.
   */
  async updateDraftProposal(
    id: string,
    input: UpdateAcquisitionProposalInput,
    userId: string
  ): Promise<ProposalWithDetails> {
    const existing = await acquisitionProposalRepository.findProposalById(id);
    if (!existing) {
      throw new NotFoundError(`Acquisition proposal with ID '${id}' not found`);
    }

    // Workflow state check: Only DRAFT proposals can be edited
    if (existing.currentStatus !== 'DRAFT') {
      throw new BadRequestError(
        `Cannot edit proposal: proposal is in '${existing.currentStatus}' status. Only proposals in 'DRAFT' status can be modified.`
      );
    }

    // Ownership check: Only the original proposal creator or version creator can edit their draft
    const isCreator =
      existing.createdBy === userId ||
      existing.currentVersion?.createdBy === userId;

    if (!isCreator) {
      throw new ForbiddenError(
        'Forbidden: Only the original creator may edit this draft proposal'
      );
    }

    // Ensure creator is an active Implementing Agency user
    await this.assertAuthorizedImplementingAgency(userId);

    if (input.competentAuthorityId) {
      const eligible =
        await competentAuthorityService.getEligibleAuthoritiesForCase(
          existing.acquisitionCaseId
        );
      const isEligible = eligible.authorities.some(
        (a) => a.id === input.competentAuthorityId
      );
      if (!isEligible) {
        throw new BadRequestError(
          'The selected Competent Authority does not have valid jurisdiction over the affected parcels in this acquisition proposal.'
        );
      }
    }

    if (!existing.currentVersion) {
      throw new NotFoundError(
        `Current editable version for proposal '${id}' not found`
      );
    }

    const currentVersionId = existing.currentVersion.id;

    await db.transaction(async (tx: TransactionClient) => {
      // Lock header
      const locked =
        await acquisitionProposalRepository.findProposalForUpdate(id, tx);
      if (!locked) {
        throw new NotFoundError(`Acquisition proposal with ID '${id}' not found`);
      }
      if (locked.currentStatus !== 'DRAFT') {
        throw new BadRequestError(
          `Cannot edit proposal: proposal is in '${locked.currentStatus}' status.`
        );
      }

      // Prepare version updates
      const versionUpdate: Record<string, unknown> = {};
      if (input.acquisitionJustification !== undefined) {
        versionUpdate.acquisitionJustification = input.acquisitionJustification;
      }
      if (input.publicPurpose !== undefined) {
        versionUpdate.publicPurpose = input.publicPurpose;
      }
      if (input.legalFramework !== undefined) {
        versionUpdate.legalFramework = input.legalFramework;
      }
      if (input.landRequirementExplanation !== undefined) {
        versionUpdate.landRequirementExplanation = input.landRequirementExplanation;
      }
      if (input.administrativeApprovalRef !== undefined) {
        versionUpdate.administrativeApprovalRef =
          input.administrativeApprovalRef?.trim() || null;
      }
      if (input.administrativeApprovalDate !== undefined) {
        versionUpdate.administrativeApprovalDate = input.administrativeApprovalDate
          ? new Date(input.administrativeApprovalDate)
          : null;
      }
      if (input.additionalDetails !== undefined) {
        versionUpdate.additionalDetails = input.additionalDetails;
      }
      if (input.supportingDocuments !== undefined) {
        versionUpdate.supportingDocuments = input.supportingDocuments;
      }
      if (input.competentAuthorityId !== undefined) {
        versionUpdate.selectedAuthorityId = input.competentAuthorityId;
      }

      await acquisitionProposalRepository.updateProposalVersion(
        currentVersionId,
        versionUpdate,
        tx
      );

      // Manage authority assignment transitions if authority was modified
      if (input.competentAuthorityId !== undefined) {
        await competentAuthorityRepository.supersedeProposalAuthorityAssignments(
          currentVersionId,
          tx
        );
        if (input.competentAuthorityId) {
          await competentAuthorityRepository.createProposalAuthorityAssignment(
            {
              proposalId: id,
              proposalVersionId: currentVersionId,
              authorityId: input.competentAuthorityId,
              assignmentStatus: 'ACTIVE',
              assignedBy: userId,
            },
            tx
          );
        }
      }

      // Touch proposal header updatedAt
      await acquisitionProposalRepository.updateProposal(id, {}, tx);

      // Record update in workflow history
      await acquisitionProposalRepository.createWorkflowHistory(
        {
          proposalId: id,
          versionNumber: existing.currentVersionNumber,
          action: 'UPDATE_DRAFT',
          fromStatus: 'DRAFT',
          toStatus: 'DRAFT',
          actorId: userId,
          remarks: 'Draft proposal content updated',
        },
        tx
      );
    });

    const detailed = await acquisitionProposalRepository.findProposalById(id);
    if (!detailed) {
      throw new Error('Failed to load updated acquisition proposal');
    }

    return detailed;
  }

  /**
   * Executes deterministic rule-based validation on a proposal and its specified (or current) version.
   */
  async validateProposal(
    id: string,
    userId: string,
    targetVersionId?: string
  ): Promise<ProposalValidationReport> {
    const proposal = await this.getProposalById(id, userId);

    const report = await proposalValidationService.validateProposal(
      proposal.id,
      targetVersionId
    );

    // Audit the validation execution event
    await acquisitionProposalRepository.createWorkflowHistory({
      proposalId: proposal.id,
      versionNumber: report.versionNumber,
      action: 'VALIDATE',
      fromStatus: proposal.currentStatus,
      toStatus: proposal.currentStatus,
      actorId: userId,
      remarks: `Validation executed: ${report.overallResult} (${report.summary.blockingErrors} blocking error(s), ${report.summary.warnings} warning(s))`,
    });

    return report;
  }

  /**
   * Submits an acquisition proposal draft for review.
   *
   * Enforces:
   * 1. Authenticated user is an active Implementing Agency user (PROJECT_OFFICER or IMPLEMENTING_AGENCY).
   * 2. User has administrative scope over the project.
   * 3. Proposal must exist and be in DRAFT status.
   * 4. Current version must be in DRAFT status.
   * 5. Linked inventory version must be approved (status 'APPROVED').
   * 6. Executes rule-based validation service. Rejects submission if blocking errors exist.
   * 7. Concurrency-safe transactional update:
   *    - Current version status becomes SUBMITTED.
   *    - Submission timestamp and submitting user recorded.
   *    - Header status becomes SUBMITTED.
   *    - Audit workflow history recorded (SUBMIT or RESUBMIT).
   *    - Version becomes immutable.
   */
  async submitProposal(
    id: string,
    userId: string,
    remarks?: string
  ): Promise<ProposalWithDetails> {
    // 1. Authorize Implementing Agency user
    await this.assertAuthorizedImplementingAgency(userId);

    // 2. Fetch proposal with details and check scope
    const proposal = await this.getProposalById(id, userId);

    // 3. Workflow status check: only DRAFT proposals with DRAFT version can be submitted
    if (proposal.currentStatus !== 'DRAFT') {
      throw new BadRequestError(
        `Cannot submit proposal: proposal is in '${proposal.currentStatus}' status. Only proposals in 'DRAFT' status can be submitted.`
      );
    }

    if (!proposal.currentVersion) {
      throw new NotFoundError(
        `Current version for proposal '${id}' not found.`
      );
    }

    if (proposal.currentVersion.status !== 'DRAFT') {
      throw new BadRequestError(
        `Cannot submit proposal: version ${proposal.currentVersionNumber} is in '${proposal.currentVersion.status}' status. Only DRAFT versions can be submitted.`
      );
    }

    // 4. Precondition checks: case belongs to project, inventory belongs to case and is approved
    if (proposal.acquisitionCase.projectId !== proposal.projectId) {
      throw new BadRequestError(
        'Cannot submit proposal: acquisition case does not belong to the proposal project.'
      );
    }

    if (proposal.linkedInventory.caseId !== proposal.acquisitionCaseId) {
      throw new BadRequestError(
        'Cannot submit proposal: linked verified land inventory does not belong to the acquisition case.'
      );
    }

    if (proposal.linkedInventory.status !== 'APPROVED') {
      throw new BadRequestError(
        `Cannot submit proposal: linked verified land inventory is in '${proposal.linkedInventory.status}' status. It must be Ministry-approved ('APPROVED') to submit.`
      );
    }

    // 5. Execute unified rule-based validation (including Competent Authority checks)
    const validationReport = await proposalValidationService.validateProposal(
      id,
      proposal.currentVersion.id
    );

    if (validationReport.hasBlockingErrors) {
      const blockingCheckMessages = validationReport.checks
        .filter((c) => c.status === 'FAILED' && c.isBlocking)
        .map((c) => `[${c.name}] ${c.message}`)
        .join('; ');

      throw new BadRequestError(
        `Cannot submit proposal: validation failed with ${validationReport.summary.blockingErrors} blocking error(s). ${blockingCheckMessages}`
      );
    }

    const currentVerId = proposal.currentVersion.id;
    const isResubmission = proposal.currentVersionNumber > 1;
    const action = isResubmission ? 'RESUBMIT' : 'SUBMIT';
    const authorityName = proposal.selectedAuthority?.authorityName;
    const defaultRemarks = isResubmission
      ? `Proposal resubmitted to Competent Authority${authorityName ? ` (${authorityName})` : ''} after addressing requested corrections`
      : `Proposal submitted to Competent Authority${authorityName ? ` (${authorityName})` : ''} for scrutiny review`;
    const auditRemarks = remarks?.trim() || defaultRemarks;

    // 6. Concurrency-safe transactional update
    await db.transaction(async (tx: TransactionClient) => {
      // Row lock header
      const locked = await acquisitionProposalRepository.findProposalForUpdate(
        id,
        tx
      );
      if (!locked) {
        throw new NotFoundError(`Acquisition proposal with ID '${id}' not found`);
      }
      if (locked.currentStatus !== 'DRAFT') {
        throw new BadRequestError(
          `Cannot submit proposal: proposal is already in '${locked.currentStatus}' status.`
        );
      }

      // Transition version to SUBMITTED and record submitter & timestamp
      await acquisitionProposalRepository.updateProposalVersion(
        currentVerId,
        {
          status: 'SUBMITTED',
          submittedBy: userId,
          submittedAt: new Date(),
        },
        tx
      );

      // Transition header to SUBMITTED
      await acquisitionProposalRepository.updateProposal(
        id,
        {
          currentStatus: 'SUBMITTED',
        },
        tx
      );

      // Ensure active authority assignment is preserved for this version
      if (proposal.currentVersion?.selectedAuthorityId) {
        const activeAssign = await competentAuthorityRepository.findActiveProposalAuthorityAssignment(
          currentVerId,
          tx
        );
        if (!activeAssign) {
          await competentAuthorityRepository.createProposalAuthorityAssignment(
            {
              proposalId: id,
              proposalVersionId: currentVerId,
              authorityId: proposal.currentVersion.selectedAuthorityId,
              assignedBy: userId,
              assignmentStatus: 'ACTIVE',
            },
            tx
          );
        }
      }

      // Record audit in workflow history
      await acquisitionProposalRepository.createWorkflowHistory(
        {
          proposalId: id,
          versionNumber: proposal.currentVersionNumber,
          action,
          fromStatus: 'DRAFT',
          toStatus: 'SUBMITTED',
          actorId: userId,
          remarks: auditRemarks,
        },
        tx
      );
    });

    const detailed = await acquisitionProposalRepository.findProposalById(id);
    if (!detailed) {
      throw new Error('Failed to load submitted acquisition proposal');
    }

    return detailed;
  }

  /**
   * Creates the next draft version under the same proposal when in CORRECTION_REQUESTED status.
   *
   * Enforces:
   * 1. Authenticated user is an active Implementing Agency user.
   * 2. User has administrative scope over the project.
   * 3. Proposal must be in 'CORRECTION_REQUESTED' status.
   *    Rejects creation from DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED.
   * 4. Copies previous version's substantive content into the new version.
   * 5. Previous version remains unchanged.
   * 6. Header's currentVersionId and currentVersionNumber updated, status transitions to DRAFT.
   * 7. Workflow history records 'CREATE_VERSION' action.
   */
  async createNextVersion(
    id: string,
    userId: string,
    remarks?: string
  ): Promise<ProposalWithDetails> {
    // 1. Authorize Implementing Agency user
    await this.assertAuthorizedImplementingAgency(userId);

    // 2. Fetch proposal with details and check scope
    const proposal = await this.getProposalById(id, userId);

    // 3. Workflow status check: only proposals with CORRECTION_REQUESTED status are eligible
    if (proposal.currentStatus !== 'CORRECTION_REQUESTED') {
      throw new BadRequestError(
        `Cannot create new version: proposal is in '${proposal.currentStatus}' status. New versions can only be created when the proposal has 'CORRECTION_REQUESTED' status.`
      );
    }

    if (!proposal.currentVersion) {
      throw new NotFoundError(
        `Current version for proposal '${id}' not found.`
      );
    }

    const previousVer = proposal.currentVersion;

    await db.transaction(async (tx: TransactionClient) => {
      // Row lock header
      const locked = await acquisitionProposalRepository.findProposalForUpdate(
        id,
        tx
      );
      if (!locked) {
        throw new NotFoundError(`Acquisition proposal with ID '${id}' not found`);
      }
      if (locked.currentStatus !== 'CORRECTION_REQUESTED') {
        throw new BadRequestError(
          `Cannot create new version: proposal status is '${locked.currentStatus}'.`
        );
      }

      // Calculate next version number safely
      const maxVer = await acquisitionProposalRepository.getMaxVersionNumber(
        id,
        tx
      );
      const nextVerNumber = maxVer + 1;

      // Create new draft version initialized by copying previous version content
      const newVersion =
        await acquisitionProposalRepository.createProposalVersion(
          {
            proposalId: id,
            versionNumber: nextVerNumber,
            status: 'DRAFT',
            acquisitionJustification: previousVer.acquisitionJustification,
            publicPurpose: previousVer.publicPurpose,
            legalFramework: previousVer.legalFramework,
            landRequirementExplanation: previousVer.landRequirementExplanation,
            administrativeApprovalRef: previousVer.administrativeApprovalRef,
            administrativeApprovalDate: previousVer.administrativeApprovalDate,
            additionalDetails: previousVer.additionalDetails,
            supportingDocuments: previousVer.supportingDocuments,
            selectedAuthorityId: previousVer.selectedAuthorityId ?? null,
            previousVersionId: previousVer.id,
            createdBy: userId,
          },
          tx
        );

      // Carry forward authority assignment to the new version if authority was selected
      if (previousVer.selectedAuthorityId) {
        await competentAuthorityRepository.createProposalAuthorityAssignment(
          {
            proposalId: id,
            proposalVersionId: newVersion.id,
            authorityId: previousVer.selectedAuthorityId,
            assignmentStatus: 'ACTIVE',
            assignedBy: userId,
          },
          tx
        );
      }

      // Update proposal header to point to new draft version and set currentStatus to DRAFT
      await acquisitionProposalRepository.updateProposal(
        id,
        {
          currentVersionId: newVersion.id,
          currentVersionNumber: nextVerNumber,
          currentStatus: 'DRAFT',
        },
        tx
      );

      // Record audit in workflow history
      await acquisitionProposalRepository.createWorkflowHistory(
        {
          proposalId: id,
          versionNumber: nextVerNumber,
          action: 'CREATE_VERSION',
          fromStatus: 'CORRECTION_REQUESTED',
          toStatus: 'DRAFT',
          actorId: userId,
          remarks:
            remarks?.trim() ||
            `Version ${nextVerNumber} initialized from Version ${previousVer.versionNumber} for correction resolution`,
        },
        tx
      );
    });

    const detailed = await acquisitionProposalRepository.findProposalById(id);
    if (!detailed) {
      throw new Error('Failed to load proposal after creating new version');
    }

    return detailed;
  }

  /**
   * Retrieves all versions recorded for a proposal.
   */
  async getProposalVersions(id: string, userId: string) {
    await this.getProposalById(id, userId);
    return acquisitionProposalRepository.findProposalVersions(id);
  }

  /**
   * Retrieves a specific version of a proposal by version ID.
   */
  async getProposalVersionById(id: string, versionId: string, userId: string) {
    await this.getProposalById(id, userId);
    const version = await acquisitionProposalRepository.findProposalVersionById(
      versionId
    );
    if (!version || version.proposalId !== id) {
      throw new NotFoundError(
        `Proposal version '${versionId}' not found on proposal '${id}'`
      );
    }
    return version;
  }

  /**
   * Retrieves proposal details with complete relations and current version.
   * Enforces scope permissions for non-super admins.
   */
  async getProposalById(
    id: string,
    userId: string
  ): Promise<ProposalWithDetails> {
    const proposal = await acquisitionProposalRepository.findProposalById(id);
    if (!proposal) {
      throw new NotFoundError(`Acquisition proposal with ID '${id}' not found`);
    }

    // Check scope accessibility
    const isSuper = await permissionService.isSuperAdmin(userId);
    if (!isSuper && proposal.createdBy !== userId) {
      const inScope = await scopeService.isWithinAdministrativeScope(
        userId,
        proposal.project.administrativeUnitId
      );
      if (!inScope) {
        // Step 3B: Also permit active authorized users assigned to the selected Competent Authority
        const selectedAuthId =
          proposal.selectedAuthority?.id ??
          proposal.currentVersion?.selectedAuthorityId;

        let isAssignedToAuthority = false;
        if (selectedAuthId) {
          const hasCARole = await permissionService.hasRole(userId, 'COMPETENT_AUTHORITY');
          if (hasCARole || isSuper) {
            isAssignedToAuthority =
              await competentAuthorityRepository.hasActiveAssignment(
                userId,
                selectedAuthId
              );
          }
        }

        if (!isAssignedToAuthority) {
          throw new ForbiddenError(
            'Forbidden: Proposal is outside your authorized administrative scope'
          );
        }
      }
    }

    return proposal;
  }

  /**
   * Retrieves paginated proposals within authorized scope.
   */
  async listProposals(
    query: AcquisitionProposalQueryInput,
    userId: string
  ): Promise<PaginatedProposalsResult> {
    const isSuper = await permissionService.isSuperAdmin(userId);

    let scopedUnitIds: string[] | undefined;
    if (!isSuper) {
      const assignedUnits = await scopeService.getUserAssignedUnits(userId);
      const allScopedUnits = new Set<string>();
      for (const unit of assignedUnits) {
        const subtree = await scopeService.getDescendantUnitIds(unit.id);
        subtree.forEach((id: string) => allScopedUnits.add(id));
      }
      scopedUnitIds = Array.from(allScopedUnits);
    }

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const offset = (page - 1) * limit;

    const filterOptions: ProposalFilterOptions = {
      search: query.search,
      status: query.status,
      projectId: query.projectId,
      acquisitionCaseId: query.acquisitionCaseId,
      scopedUnitIds,
      limit,
      offset,
    };

    const [data, total] = await Promise.all([
      acquisitionProposalRepository.findProposals(filterOptions),
      acquisitionProposalRepository.countProposals(filterOptions),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  /**
   * Lists acquisition cases that are eligible for creating a new proposal:
   * - Linked project is in REGISTERED status.
   * - Has at least one Ministry-approved inventory (status = 'APPROVED').
   * - Does NOT already have an acquisition proposal.
   * - Case is in caller's administrative scope.
   */
  async listEligibleCasesForProposal(userId: string) {
    await this.assertAuthorizedImplementingAgency(userId);

    const isSuper = await permissionService.isSuperAdmin(userId);
    let scopedUnitIds: string[] | undefined;
    if (!isSuper) {
      const assignedUnits = await scopeService.getUserAssignedUnits(userId);
      const allScopedUnits = new Set<string>();
      for (const unit of assignedUnits) {
        const subtree = await scopeService.getDescendantUnitIds(unit.id);
        subtree.forEach((id: string) => allScopedUnits.add(id));
      }
      scopedUnitIds = Array.from(allScopedUnits);
    }

    // Query cases from db that don't have a proposal yet
    // and have at least one approved inventory
    const conditions = [
      eq(projects.status, 'REGISTERED'),
      isNull(acquisitionProposals.id),
    ];
    if (scopedUnitIds && scopedUnitIds.length > 0) {
      conditions.push(inArray(projects.administrativeUnitId, scopedUnitIds));
    }

    const candidateCases = await db
      .select({
        caseId: acquisitionCases.id,
        caseReference: acquisitionCases.caseReference,
        title: acquisitionCases.title,
        caseStatus: acquisitionCases.status,
        projectId: projects.id,
        projectCode: projects.projectCode,
        projectName: projects.name,
        implementingAgencyId: projects.implementingAgencyId,
        administrativeUnitId: projects.administrativeUnitId,
      })
      .from(acquisitionCases)
      .innerJoin(projects, eq(acquisitionCases.projectId, projects.id))
      .leftJoin(
        acquisitionProposals,
        eq(acquisitionCases.id, acquisitionProposals.acquisitionCaseId)
      )
      .where(and(...conditions));

    // For each candidate case, check if there is an APPROVED inventory
    const eligibleCases = [];
    for (const c of candidateCases) {
      const approvedInventories = await db
        .select()
        .from(verifiedLandInventories)
        .where(
          and(
            eq(verifiedLandInventories.caseId, c.caseId),
            eq(verifiedLandInventories.status, 'APPROVED')
          )
        )
        .orderBy(desc(verifiedLandInventories.versionNumber));

      if (approvedInventories.length > 0) {
        eligibleCases.push({
          id: c.caseId,
          caseReference: c.caseReference,
          title: c.title,
          status: c.caseStatus,
          project: {
            id: c.projectId,
            projectCode: c.projectCode,
            name: c.projectName,
            implementingAgencyId: c.implementingAgencyId,
            administrativeUnitId: c.administrativeUnitId,
          },
          approvedInventories: approvedInventories.map((inv) => ({
            id: inv.id,
            versionNumber: inv.versionNumber,
            status: inv.status,
            totalParcelCount: inv.totalParcelCount,
            aggregateRecordedArea: inv.aggregateRecordedArea,
            aggregateAffectedArea: inv.aggregateAffectedArea,
            areaUnit: inv.areaUnit,
            generatedAt: inv.generatedAt,
            reviewedAt: inv.reviewedAt,
          })),
        });
      }
    }

    return eligibleCases;
  }

  /**
   * Lists proposals submitted to Competent Authorities for review.
   *
   * Enforces:
   * - Caller must have active assignment to at least one Competent Authority.
   * - If an authorityId filter is specified, validates caller is actively assigned to that authority.
   * - Returns submitted proposals with project, case, agency, version, and authority metadata.
   * - MINISTRY_ADMIN does not automatically receive Competent Authority review access.
   */
  async listReviewProposals(
    userId: string,
    query: {
      authorityId?: string;
      status?: string;
      projectId?: string;
      caseId?: string;
      agencyId?: string;
      submittedFrom?: string;
      submittedTo?: string;
      search?: string;
      page?: number;
      limit?: number;
      sortBy?: 'submissionDate' | 'proposalNumber' | 'status' | 'projectName';
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<{
    items: CompetentAuthorityReviewItem[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    userAuthorities: Array<{
      id: string;
      authorityCode: string;
      authorityName: string;
      designation: string;
      authorityLevel: string;
    }>;
  }> {
    // 0. Dual check: Caller must hold COMPETENT_AUTHORITY role (or SUPER_ADMIN)
    const isSuper = await permissionService.isSuperAdmin(userId);
    const hasCARole = await permissionService.hasRole(userId, 'COMPETENT_AUTHORITY');
    if (!isSuper && !hasCARole) {
      throw new ForbiddenError(
        'Forbidden: You do not possess the COMPETENT_AUTHORITY role.'
      );
    }

    // 1. Fetch user's active authority assignments
    const activeAuthorities =
      await competentAuthorityRepository.findActiveAuthoritiesForUser(userId);

    if (activeAuthorities.length === 0) {
      throw new ForbiddenError(
        'Forbidden: You do not have active Competent Authority review privileges.'
      );
    }

    // 2. Validate authorityId context filter if supplied by frontend
    let targetAuthorityIds: string[] = [];
    if (query.authorityId) {
      const isAuthorized = activeAuthorities.some((a) => a.id === query.authorityId);
      if (!isAuthorized) {
        throw new ForbiddenError(
          `Forbidden: You are not authorized to represent Competent Authority '${query.authorityId}'.`
        );
      }
      targetAuthorityIds = [query.authorityId];
    } else {
      targetAuthorityIds = activeAuthorities.map((a) => a.id);
    }

    // 3. Query repository
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const offset = (page - 1) * limit;

    const filterOptions: CompetentAuthorityReviewFilterOptions = {
      authorityIds: targetAuthorityIds,
      status: query.status,
      projectId: query.projectId,
      caseId: query.caseId,
      agencyId: query.agencyId,
      submittedFrom: query.submittedFrom,
      submittedTo: query.submittedTo,
      search: query.search,
      limit,
      offset,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder ?? 'desc',
    };

    const [items, total] = await Promise.all([
      acquisitionProposalRepository.findProposalsForCompetentAuthorityReview(filterOptions),
      acquisitionProposalRepository.countProposalsForCompetentAuthorityReview(filterOptions),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      userAuthorities: activeAuthorities.map((a) => ({
        id: a.id,
        authorityCode: a.authorityCode,
        authorityName: a.authorityName,
        designation: a.designation,
        authorityLevel: a.authorityLevel,
      })),
    };
  }
}

export const acquisitionProposalService = new AcquisitionProposalService();
