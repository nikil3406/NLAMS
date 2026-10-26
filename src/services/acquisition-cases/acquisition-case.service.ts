import { eq } from 'drizzle-orm';
import { db } from '../../../db';
import {
  acquisitionCases,
  type AcquisitionCaseStatus,
} from '../../../db/schema/acquisition-cases';
import {
  acquisitionCaseRepository,
  type AcquisitionCaseWithRelations,
  type AcquisitionCaseFilterOptions,
} from '../../repositories/acquisition-case.repository';
import { projectRepository } from '../../repositories/project.repository';
import { permissionService } from '../authorization/permission.service';
import { scopeService } from '../authorization/scope.service';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../../types/errors';
import type {
  CreateAcquisitionCaseInput,
  UpdateAcquisitionCaseInput,
  SubmitAcquisitionCaseInput,
  ReviewAcquisitionCaseInput,
  AcquisitionCaseQueryInput,
} from '../../validators/acquisition-cases';

export interface PaginatedAcquisitionCasesResult {
  data: AcquisitionCaseWithRelations[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export class AcquisitionCaseService {
  /**
   * Creates a new acquisition case in DRAFT status.
   * Enforces ACQUISITION_CASE_CREATE permission, project accessibility within administrative scope,
   * concurrency-safe case reference generation, and initial audit history in a single transaction.
   */
  async createCase(
    input: CreateAcquisitionCaseInput,
    userId: string
  ): Promise<AcquisitionCaseWithRelations> {
    // 1. Permission check
    await permissionService.requirePermission(userId, 'ACQUISITION_CASE_CREATE');

    // 1b. Role restriction — only LAND_OFFICER may create acquisition cases
    const callerRoles = await permissionService.getUserRoles(userId);
    if (!callerRoles.includes('LAND_OFFICER')) {
      throw new ForbiddenError(
        'Forbidden: Only a Land Officer may create acquisition cases'
      );
    }

    // 2. Validate project exists
    const project = await projectRepository.findProjectById(input.projectId);
    if (!project) {
      throw new BadRequestError(`Project with ID '${input.projectId}' not found`);
    }

    // 2b. Project status check: Acquisition cases can only be created for projects in REGISTERED status
    if (project.status !== 'REGISTERED') {
      throw new BadRequestError(
        `Cannot create acquisition case: linked project status is '${project.status}'. Acquisition cases can only be created for projects with 'REGISTERED' status.`
      );
    }

    // 3. Administrative scope check on linked project's administrative unit
    const inScope = await scopeService.isWithinAdministrativeScope(
      userId,
      project.administrativeUnitId
    );
    if (!inScope) {
      throw new ForbiddenError(
        'Forbidden: linked project is outside your authorized administrative scope'
      );
    }

    // 4. Generate concurrency-safe unique case reference
    const caseReference = await acquisitionCaseRepository.generateCaseReference();

    // 5. Persist case and initial workflow history record transactionally
    const created = await db.transaction(async (tx) => {
      const newCase = await acquisitionCaseRepository.createCase(
        {
          caseReference,
          projectId: input.projectId,
          title: input.title,
          description: input.description ?? null,
          status: 'DRAFT',
          createdBy: userId,
          updatedBy: userId,
        },
        tx
      );

      await acquisitionCaseRepository.createWorkflowHistory(
        {
          caseId: newCase.id,
          caseReference,
          fromStatus: null,
          toStatus: 'DRAFT',
          action: 'CREATE',
          actorId: userId,
          remarks: 'Case draft created',
        },
        tx
      );

      return newCase;
    });

    const detailed = await acquisitionCaseRepository.findCaseById(created.id);
    if (!detailed) {
      throw new Error('Acquisition case created but failed to retrieve record');
    }

    return detailed;
  }

  /**
   * Lists acquisition cases accessible to the user within their authorized administrative scope.
   */
  async listCases(
    query: AcquisitionCaseQueryInput,
    userId: string
  ): Promise<PaginatedAcquisitionCasesResult> {
    // 1. Permission check
    await permissionService.requirePermission(userId, 'ACQUISITION_CASE_VIEW');

    const isSuper = await permissionService.isSuperAdmin(userId);
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

      // Collect all descendant administrative unit IDs for all assigned units
      const unitIdSet = new Set<string>();
      for (const unit of assignedUnits) {
        const descendants = await scopeService.getDescendantUnitIds(unit.id);
        for (const id of descendants) {
          unitIdSet.add(id);
        }
      }
      allowedUnitIds = Array.from(unitIdSet);
    }

    const page = query.page;
    const limit = query.limit;
    const offset = (page - 1) * limit;

    const filterOptions: AcquisitionCaseFilterOptions = {
      search: query.search,
      status: query.status,
      projectId: query.projectId,
      administrativeUnitIds: allowedUnitIds,
      limit,
      offset,
    };

    const [data, total] = await Promise.all([
      acquisitionCaseRepository.findCases(filterOptions),
      acquisitionCaseRepository.countCases(filterOptions),
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
   * Retrieves full acquisition case details including workflow history.
   * Throws NotFoundError if not found or outside user's authorized scope.
   */
  async getCaseById(id: string, userId: string): Promise<AcquisitionCaseWithRelations> {
    // 1. Permission check
    await permissionService.requirePermission(userId, 'ACQUISITION_CASE_VIEW');

    const acqCase = await acquisitionCaseRepository.findCaseById(id);
    if (!acqCase) {
      throw new NotFoundError(`Acquisition case with ID '${id}' not found`);
    }

    // 2. Administrative scope check (404 to avoid leaking existence of out-of-scope case)
    const inScope = await scopeService.isWithinAdministrativeScope(
      userId,
      acqCase.project.administrativeUnitId
    );
    if (!inScope) {
      throw new NotFoundError(`Acquisition case with ID '${id}' not found`);
    }

    return acqCase;
  }

  /**
   * Updates permitted acquisition case fields.
   * Only cases in DRAFT or RETURNED_FOR_CORRECTION status may be updated.
   * Rejects client-supplied status, project ID, case reference, or creator modifications.
   */
  async updateCase(
    id: string,
    input: UpdateAcquisitionCaseInput,
    userId: string
  ): Promise<AcquisitionCaseWithRelations> {
    // 1. Permission check
    await permissionService.requirePermission(userId, 'ACQUISITION_CASE_UPDATE');

    // 1b. Role restriction — only LAND_OFFICER may edit acquisition cases
    const isSuperUpdate = await permissionService.isSuperAdmin(userId);
    const updateRoles = await permissionService.getUserRoles(userId);
    if (!isSuperUpdate && !updateRoles.includes('LAND_OFFICER')) {
      throw new ForbiddenError(
        'Forbidden: Only a Land Officer may edit acquisition cases'
      );
    }

    const acqCase = await acquisitionCaseRepository.findCaseById(id);
    if (!acqCase) {
      throw new NotFoundError(`Acquisition case with ID '${id}' not found`);
    }

    // 2. Administrative scope check
    const inScope = await scopeService.isWithinAdministrativeScope(
      userId,
      acqCase.project.administrativeUnitId
    );
    if (!inScope) {
      throw new NotFoundError(`Acquisition case with ID '${id}' not found`);
    }

    // 3. State machine validation: Only editable in DRAFT or RETURNED_FOR_CORRECTION
    if (acqCase.status !== 'DRAFT' && acqCase.status !== 'RETURNED_FOR_CORRECTION') {
      throw new BadRequestError(
        `Cannot edit case in '${acqCase.status}' status. Only cases in DRAFT or RETURNED_FOR_CORRECTION status can be edited.`
      );
    }

    // 4. Update permitted fields
    await acquisitionCaseRepository.updateCase(id, {
      title: input.title ?? acqCase.title,
      description: input.description !== undefined ? input.description : acqCase.description,
      updatedBy: userId,
    });

    const updated = await acquisitionCaseRepository.findCaseById(id);
    if (!updated) {
      throw new Error('Failed to retrieve updated acquisition case');
    }

    return updated;
  }

  /**
   * Submits an acquisition case for review.
   * Permitted transitions:
   *   DRAFT -> SUBMITTED
   *   RETURNED_FOR_CORRECTION -> SUBMITTED
   * Updates case status and persists workflow history entry in the same transaction.
   */
  async submitCase(
    id: string,
    input: SubmitAcquisitionCaseInput,
    userId: string
  ): Promise<AcquisitionCaseWithRelations> {
    // 1. Permission check
    await permissionService.requirePermission(userId, 'ACQUISITION_CASE_SUBMIT');

    // 1b. Role restriction — only LAND_OFFICER may submit acquisition cases for review
    const isSuperSubmit = await permissionService.isSuperAdmin(userId);
    const submitRoles = await permissionService.getUserRoles(userId);
    if (!isSuperSubmit && !submitRoles.includes('LAND_OFFICER')) {
      throw new ForbiddenError(
        'Forbidden: Only a Land Officer may submit acquisition cases for review'
      );
    }

    const acqCase = await acquisitionCaseRepository.findCaseById(id);
    if (!acqCase) {
      throw new NotFoundError(`Acquisition case with ID '${id}' not found`);
    }

    // 2. Administrative scope check
    const inScope = await scopeService.isWithinAdministrativeScope(
      userId,
      acqCase.project.administrativeUnitId
    );
    if (!inScope) {
      throw new ForbiddenError(
        'Forbidden: case is outside your authorized administrative scope'
      );
    }

    // 3. Status transition check
    if (acqCase.status !== 'DRAFT' && acqCase.status !== 'RETURNED_FOR_CORRECTION') {
      throw new BadRequestError(
        `Cannot submit case: current status is '${acqCase.status}'. Only cases in DRAFT or RETURNED_FOR_CORRECTION status can be submitted for review.`
      );
    }

    // 4. Perform transition and append audit history atomically
    await db.transaction(async (tx) => {
      await acquisitionCaseRepository.updateCase(
        id,
        {
          status: 'SUBMITTED',
          submittedAt: new Date(),
          submissionRemarks: input.remarks ?? null,
          updatedBy: userId,
        },
        tx
      );

      await acquisitionCaseRepository.createWorkflowHistory(
        {
          caseId: id,
          caseReference: acqCase.caseReference,
          fromStatus: acqCase.status,
          toStatus: 'SUBMITTED',
          action: 'SUBMIT',
          actorId: userId,
          remarks: input.remarks ?? 'Case submitted for review',
        },
        tx
      );
    });

    const submitted = await acquisitionCaseRepository.findCaseById(id);
    if (!submitted) {
      throw new Error('Failed to retrieve submitted acquisition case');
    }

    return submitted;
  }

  /**
   * Reviews a submitted acquisition case and records an authorized workflow transition decision.
   * Permitted decisions and resulting transitions:
   *   PERMIT_FIELD_VERIFICATION / AUTHORIZE_FIELD_VERIFICATION: SUBMITTED -> AWAITING_FIELD_VERIFICATION
   *   RETURN_FOR_CORRECTION:                                    SUBMITTED -> RETURNED_FOR_CORRECTION
   *   REJECT:                                                   SUBMITTED -> REJECTED
   *
   * Authorization rules:
   *   - User must have ACQUISITION_CASE_REVIEW permission (for return / reject / general review).
   *   - If permitting field verification, user must hold FIELD_VERIFICATION_AUTHORIZE permission.
   *   - Linked project must be within the user's authorized administrative scope.
   *
   * Concurrency & Atomicity:
   *   - Serializes using database-level row locking ('FOR UPDATE') within a single transaction.
   *   - Verifies case is currently in SUBMITTED status; throws ConflictError (409) if already transitioned
   *     or concurrently reviewed, or BadRequestError (400) if not yet submitted (DRAFT / RETURNED).
   *   - Persists decision, status update, and workflow history record atomically.
   */
  async reviewCase(
    id: string,
    input: ReviewAcquisitionCaseInput,
    userId: string
  ): Promise<AcquisitionCaseWithRelations> {
    // 1. Permission checks
    if (
      input.decision === 'PERMIT_FIELD_VERIFICATION' ||
      input.decision === 'AUTHORIZE_FIELD_VERIFICATION'
    ) {
      await permissionService.requirePermission(userId, 'FIELD_VERIFICATION_AUTHORIZE');
    } else {
      await permissionService.requirePermission(userId, 'ACQUISITION_CASE_REVIEW');
    }

    // 2. Initial case retrieval and administrative scope check
    const acqCase = await acquisitionCaseRepository.findCaseById(id);
    if (!acqCase) {
      throw new NotFoundError(`Acquisition case with ID '${id}' not found`);
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

    // 3. Separation-of-duties: reviewer cannot be the project creator or the case preparer
    if (userId === acqCase.project.createdBy) {
      throw new ForbiddenError(
        'Forbidden: The project creator cannot review the acquisition case linked to their own project'
      );
    }
    if (userId === acqCase.createdBy) {
      throw new ForbiddenError(
        'Forbidden: The Land Officer who prepared this acquisition case cannot review it'
      );
    }

    // 4. Counterpart-role enforcement:
    //    If project was created by PROJECT_OFFICER ⇒ reviewer must have MINISTRY_ADMIN.
    //    If project was created by MINISTRY_ADMIN ⇒ reviewer must have PROJECT_OFFICER.
    //    SUPER_ADMIN does NOT bypass this separation-of-duties rule.
    const projectCreatorRoles = await permissionService.getUserRoles(acqCase.project.createdBy);
    const reviewerRoles = await permissionService.getUserRoles(userId);

    let requiredCounterpartRole: string | null = null;
    if (projectCreatorRoles.includes('PROJECT_OFFICER')) {
      requiredCounterpartRole = 'MINISTRY_ADMIN';
    } else if (projectCreatorRoles.includes('MINISTRY_ADMIN')) {
      requiredCounterpartRole = 'PROJECT_OFFICER';
    }

    if (requiredCounterpartRole) {
      if (!reviewerRoles.includes(requiredCounterpartRole)) {
        throw new ForbiddenError(
          `Forbidden: Independent counterpart-role review is required. ` +
          `This project was created by a ${projectCreatorRoles.includes('PROJECT_OFFICER') ? 'Project Officer' : 'Ministry Admin'}, ` +
          `so the reviewer must hold the '${requiredCounterpartRole}' role. ` +
          `Your current roles do not include '${requiredCounterpartRole}'.`
        );
      }
    }

    // 5. Map decision to target status and action
    let toStatus: AcquisitionCaseStatus;
    const action = input.decision;

    switch (input.decision) {
      case 'PERMIT_FIELD_VERIFICATION':
      case 'AUTHORIZE_FIELD_VERIFICATION':
        toStatus = 'AWAITING_FIELD_VERIFICATION';
        break;
      case 'RETURN_FOR_CORRECTION':
        toStatus = 'RETURNED_FOR_CORRECTION';
        break;
      case 'REJECT':
        toStatus = 'REJECTED';
        break;
      default:
        throw new BadRequestError(`Invalid review decision: '${input.decision}'`);
    }

    const effectiveRemarks = (input.remarks ?? input.reason ?? '').trim() || null;

    // 6. Atomic transaction with row locking to prevent concurrent / duplicate review decisions
    await db.transaction(async (tx) => {
      // Row lock the acquisition case
      const [lockedCase] = await tx
        .select({
          id: acquisitionCases.id,
          caseReference: acquisitionCases.caseReference,
          status: acquisitionCases.status,
          projectId: acquisitionCases.projectId,
        })
        .from(acquisitionCases)
        .where(eq(acquisitionCases.id, id))
        .for('update');

      if (!lockedCase) {
        throw new NotFoundError(`Acquisition case with ID '${id}' not found`);
      }

      if (lockedCase.status !== 'SUBMITTED') {
        if (lockedCase.status === 'DRAFT' || lockedCase.status === 'RETURNED_FOR_CORRECTION') {
          throw new BadRequestError(
            `Cannot review case: current status is '${lockedCase.status}'. Only cases in SUBMITTED status can be reviewed.`
          );
        }
        throw new ConflictError(
          `Cannot review case: current status is '${lockedCase.status}'. The case has already been reviewed or a concurrent decision was processed.`
        );
      }

      // Update case status
      await acquisitionCaseRepository.updateCase(
        id,
        {
          status: toStatus,
          updatedBy: userId,
        },
        tx
      );

      // If returning for correction, unlock the linked project for editing by its original creator
      if (toStatus === 'RETURNED_FOR_CORRECTION') {
        // Import dynamically to avoid circular dependency at module level
        const { projectService } = await import('../projects/project.service');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await projectService.unlockForCorrection(lockedCase.projectId, id, tx as any);
      }

      // Persist workflow history entry
      await acquisitionCaseRepository.createWorkflowHistory(
        {
          caseId: id,
          caseReference: lockedCase.caseReference,
          fromStatus: 'SUBMITTED',
          toStatus,
          action,
          actorId: userId,
          remarks:
            effectiveRemarks ??
            (toStatus === 'AWAITING_FIELD_VERIFICATION'
              ? 'Field verification authorized'
              : `Review decision: ${action}`),
        },
        tx
      );
    });

    const reviewed = await acquisitionCaseRepository.findCaseById(id);
    if (!reviewed) {
      throw new Error('Failed to retrieve reviewed acquisition case');
    }

    return reviewed;
  }
}

export const acquisitionCaseService = new AcquisitionCaseService();
