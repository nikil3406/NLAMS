import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../../../db';
import {
  acquisitionProposalRepository,
  type ProposalWithDetails,
  type ProposalListItem,
  type ProposalFilterOptions,
} from '../../repositories/acquisition-proposal.repository';
import { acquisitionCaseRepository } from '../../repositories/acquisition-case.repository';
import { verifiedLandInventoryRepository } from '../../repositories/verified-land-inventory.repository';
import { acquisitionProposals } from '../../../db/schema/acquisition-proposals';
import { acquisitionCases } from '../../../db/schema/acquisition-cases';
import { projects } from '../../../db/schema/projects';
import { verifiedLandInventories } from '../../../db/schema/verified-land-inventories';
import { userRepository } from '../../repositories/user.repository';

type TransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];
import { permissionService } from '../authorization/permission.service';
import { scopeService } from '../authorization/scope.service';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../types/errors';
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

    // 7. Generate concurrency-safe proposal number
    const proposalNumber =
      await acquisitionProposalRepository.generateProposalNumber();

    // 8. Transactional creation
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
              createdBy: userId,
            },
            tx
          );

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

    // Ownership check: Only the original creator can edit their draft
    if (existing.createdBy !== userId) {
      throw new ForbiddenError(
        'Forbidden: Only the original creator may edit this draft proposal'
      );
    }

    // Ensure creator is an active Implementing Agency user
    await this.assertAuthorizedImplementingAgency(userId);

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

      await acquisitionProposalRepository.updateProposalVersion(
        currentVersionId,
        versionUpdate,
        tx
      );

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
        throw new ForbiddenError(
          'Forbidden: Proposal is outside your authorized administrative scope'
        );
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
}

export const acquisitionProposalService = new AcquisitionProposalService();
