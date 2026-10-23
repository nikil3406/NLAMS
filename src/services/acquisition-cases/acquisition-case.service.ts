import { db } from '../../../db';
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
} from '../../types/errors';
import type {
  CreateAcquisitionCaseInput,
  UpdateAcquisitionCaseInput,
  SubmitAcquisitionCaseInput,
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

    // 2. Validate project exists
    const project = await projectRepository.findProjectById(input.projectId);
    if (!project) {
      throw new BadRequestError(`Project with ID '${input.projectId}' not found`);
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
}

export const acquisitionCaseService = new AcquisitionCaseService();
