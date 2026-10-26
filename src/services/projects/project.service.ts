import { eq } from 'drizzle-orm';
import { db } from '../../../db';
import { projects } from '../../../db/schema/projects';
import {
  projectRepository,
  type ProjectFilterOptions,
  type ProjectWithRelations,
} from '../../repositories/project.repository';
import {
  projectBoundaryRepository,
} from '../../repositories/project-boundary.repository';
import { projectBoundaryService } from './project-boundary.service';
import { implementingAgencyService } from '../implementing-agencies/implementing-agency.service';
import { permissionService } from '../authorization/permission.service';
import { scopeService } from '../authorization/scope.service';
import { administrativeUnitRepository } from '../../repositories/administrative-unit.repository';
import type {
  CreateProjectInput,
  UpdateProjectInput,
  ProjectQueryInput,
  UpdateProjectStatusInput,
} from '../../validators/projects';
import type { ProjectStatus } from '../../../db/schema/projects';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from '../../types';

export interface PaginatedProjectsResult {
  data: ProjectWithRelations[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Valid status transitions map
const VALID_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  DRAFT: ['REGISTERED', 'CANCELLED'],
  REGISTERED: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
  ON_HOLD: ['REGISTERED', 'CANCELLED'],
  COMPLETED: [], // Terminal
  CANCELLED: [], // Terminal
};

export class ProjectService {
  /**
   * Creates a new project in DRAFT status.
   * Enforces PROJECT_CREATE permission, role restriction (PROJECT_OFFICER or MINISTRY_ADMIN),
   * administrative scope, active agency check, and concurrency-safe code generation.
   */
  async createProject(
    input: CreateProjectInput,
    userId: string
  ): Promise<ProjectWithRelations> {
    // 1. Permission check
    await permissionService.requirePermission(userId, 'PROJECT_CREATE');

    // 1b. Role restriction — only PROJECT_OFFICER or MINISTRY_ADMIN may create projects (SUPER_ADMIN also allowed)
    const isSuper = await permissionService.isSuperAdmin(userId);
    const creatorRoles = await permissionService.getUserRoles(userId);
    const isEligibleCreator =
      isSuper ||
      creatorRoles.includes('PROJECT_OFFICER') ||
      creatorRoles.includes('MINISTRY_ADMIN');
    if (!isEligibleCreator) {
      throw new ForbiddenError(
        'Forbidden: Only a Project Officer or Ministry Admin may create projects'
      );
    }

    // 2. Administrative scope check
    await scopeService.requireAdministrativeScope(userId, input.administrativeUnitId);

    // 3. Implementing Agency check
    await implementingAgencyService.validateActiveAgency(input.implementingAgencyId);

    // 4. Verify administrative unit exists and is active
    const adminUnit = await administrativeUnitRepository.findUnitById(input.administrativeUnitId);
    if (!adminUnit) {
      throw new BadRequestError(`Administrative unit '${input.administrativeUnitId}' not found`);
    }
    if (!adminUnit.isActive) {
      throw new BadRequestError(`Administrative unit '${adminUnit.name}' is inactive`);
    }

    // 5. Generate concurrency-safe project code
    const projectCode = await projectRepository.generateProjectCode();

    // 6. Pre-validate and measure geometry if boundary is provided
    let measurement: { areaSqm: number } | null = null;
    if (input.boundary) {
      measurement = await projectBoundaryService.validateAndMeasureGeometry(input.boundary.geometry);
    }

    // 7. Create project and initial boundary version transactionally
    const created = await db.transaction(async (tx) => {
      const project = await projectRepository.createProject(
        {
          projectCode,
          name: input.name,
          description: input.description ?? null,
          projectType: input.projectType,
          implementingAgencyId: input.implementingAgencyId,
          administrativeUnitId: input.administrativeUnitId,
          createdBy: userId,
          landAcquisitionRequired: input.landAcquisitionRequired ?? true,
          estimatedCost: input.estimatedCost ?? null,
          plannedStartDate: input.plannedStartDate ?? null,
          plannedEndDate: input.plannedEndDate ?? null,
          status: 'DRAFT',
        },
        tx
      );

      if (input.boundary && measurement) {
        await projectBoundaryRepository.createBoundaryVersion(
          {
            projectId: project.id,
            versionNumber: 1,
            geometry: input.boundary.geometry,
            estimatedLandArea: input.boundary.estimatedLandArea,
            estimatedAreaUnit: input.boundary.estimatedAreaUnit,
            calculatedGeometryArea: measurement.areaSqm.toFixed(2),
            createdBy: userId,
            changeReason: input.boundary.changeReason ?? 'Initial project boundary',
          },
          tx
        );
      }

      return project;
    });

    const detailed = await projectRepository.findProjectById(created.id);
    if (!detailed) {
      throw new Error('Project created but failed to retrieve record');
    }

    return detailed;
  }

  /**
   * Retrieves a paginated list of projects accessible to the user within their administrative scope.
   */
  async listProjects(
    query: ProjectQueryInput,
    userId: string
  ): Promise<PaginatedProjectsResult> {
    // 1. Permission check
    await permissionService.requirePermission(userId, 'PROJECT_VIEW');

    const isSuper = await permissionService.isSuperAdmin(userId);
    let allowedUnitIds: string[] | undefined;

    if (!isSuper) {
      // Resolve all descendant unit IDs for all assigned units
      const assignedUnits = await scopeService.getUserAssignedUnits(userId);
      if (assignedUnits.length === 0) {
        return {
          data: [],
          pagination: { total: 0, page: query.page, limit: query.limit, totalPages: 0 },
        };
      }

      const unitIdSet = new Set<string>();
      for (const unit of assignedUnits) {
        const descendants = await administrativeUnitRepository.getDescendantUnitIds(unit.id);
        for (const id of descendants) {
          unitIdSet.add(id);
        }
      }

      allowedUnitIds = Array.from(unitIdSet);

      // If user filtered by a specific administrativeUnitId, verify it is in scope
      if (query.administrativeUnitId) {
        if (!unitIdSet.has(query.administrativeUnitId)) {
          return {
            data: [],
            pagination: { total: 0, page: query.page, limit: query.limit, totalPages: 0 },
          };
        }
        allowedUnitIds = [query.administrativeUnitId];
      }
    } else if (query.administrativeUnitId) {
      allowedUnitIds = [query.administrativeUnitId];
    }

    const page = Math.max(1, query.page);
    const limit = Math.min(100, Math.max(1, query.limit));
    const offset = (page - 1) * limit;

    const filterOptions: ProjectFilterOptions = {
      search: query.search,
      status: query.status,
      projectType: query.projectType,
      implementingAgencyId: query.implementingAgencyId,
      administrativeUnitIds: allowedUnitIds,
      landAcquisitionRequired: query.landAcquisitionRequired,
      limit,
      offset,
    };

    const [data, total] = await Promise.all([
      projectRepository.findProjects(filterOptions),
      projectRepository.countProjects(filterOptions),
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
   * Retrieves full project details.
   * Throws NotFoundError if not found or outside user's authorized scope.
   */
  async getProjectById(
    projectId: string,
    userId: string
  ): Promise<ProjectWithRelations> {
    // 1. Permission check
    await permissionService.requirePermission(userId, 'PROJECT_VIEW');

    const project = await projectRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Project with ID '${projectId}' not found`);
    }

    // 2. Administrative scope check (404 to avoid leaking existence of out-of-scope project)
    const inScope = await scopeService.isWithinAdministrativeScope(
      userId,
      project.administrativeUnitId
    );
    if (!inScope) {
      throw new NotFoundError(`Project with ID '${projectId}' not found`);
    }

    return project;
  }

  /**
   * Updates permitted project fields.
   * Only the original project creator may update a project.
   * Updates are permitted when the project is in DRAFT status, or when the project
   * has been explicitly unlocked for a correction cycle (correctionPendingFor is non-null).
   * Status and immutable identifiers cannot be updated here.
   */
  async updateProject(
    projectId: string,
    input: UpdateProjectInput,
    userId: string
  ): Promise<ProjectWithRelations> {
    // 1. Permission check
    await permissionService.requirePermission(userId, 'PROJECT_UPDATE');

    const project = await projectRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Project with ID '${projectId}' not found`);
    }

    // 2. Administrative scope check on existing project
    const inScope = await scopeService.isWithinAdministrativeScope(
      userId,
      project.administrativeUnitId
    );
    if (!inScope) {
      throw new NotFoundError(`Project with ID '${projectId}' not found`);
    }

    // 3. Ownership check — only the original creator may edit. SUPER_ADMIN does NOT bypass this.
    if (project.createdBy !== userId) {
      throw new ForbiddenError(
        'Forbidden: Only the original project creator may edit project details'
      );
    }

    // 4. Workflow-state editability check:
    //    Allowed when project is DRAFT, or when a correction cycle has been explicitly unlocked.
    const isUnderCorrection = project.correctionPendingFor !== null;
    if (
      !isUnderCorrection &&
      project.status !== 'DRAFT'
    ) {
      throw new BadRequestError(
        `Cannot modify project: editing is only permitted when the project is in 'DRAFT' status or during an authorized correction cycle`
      );
    }

    // 5. Reject modification of terminal projects
    if (project.status === 'COMPLETED' || project.status === 'CANCELLED') {
      throw new BadRequestError(`Cannot modify a project in '${project.status}' status`);
    }

    // 4. If administrativeUnitId is changed, verify new unit is in scope and active
    if (input.administrativeUnitId && input.administrativeUnitId !== project.administrativeUnitId) {
      await scopeService.requireAdministrativeScope(userId, input.administrativeUnitId);
      const newAdminUnit = await administrativeUnitRepository.findUnitById(input.administrativeUnitId);
      if (!newAdminUnit) {
        throw new BadRequestError(`Administrative unit '${input.administrativeUnitId}' not found`);
      }
      if (!newAdminUnit.isActive) {
        throw new BadRequestError(`Administrative unit '${newAdminUnit.name}' is inactive`);
      }
    }

    // 5. If implementingAgencyId is changed, verify it exists and is active
    if (input.implementingAgencyId && input.implementingAgencyId !== project.implementingAgencyId) {
      await implementingAgencyService.validateActiveAgency(input.implementingAgencyId);
    }

    // 6. Update database record
    await projectRepository.updateProject(projectId, {
      name: input.name ?? project.name,
      description: input.description !== undefined ? input.description : project.description,
      projectType: input.projectType ?? project.projectType,
      implementingAgencyId: input.implementingAgencyId ?? project.implementingAgencyId,
      administrativeUnitId: input.administrativeUnitId ?? project.administrativeUnitId,
      landAcquisitionRequired:
        input.landAcquisitionRequired !== undefined
          ? input.landAcquisitionRequired
          : project.landAcquisitionRequired,
      estimatedCost: input.estimatedCost !== undefined ? input.estimatedCost : project.estimatedCost,
      plannedStartDate:
        input.plannedStartDate !== undefined ? input.plannedStartDate : project.plannedStartDate,
      plannedEndDate:
        input.plannedEndDate !== undefined ? input.plannedEndDate : project.plannedEndDate,
    });

    const updated = await projectRepository.findProjectById(projectId);
    if (!updated) {
      throw new Error('Failed to retrieve updated project record');
    }

    return updated;
  }

  /**
   * Formally registers a DRAFT project.
   * Requires PROJECT_REGISTER permission and administrative scope.
   */
  async registerProject(
    projectId: string,
    userId: string
  ): Promise<ProjectWithRelations> {
    await permissionService.requirePermission(userId, 'PROJECT_REGISTER');

    const project = await projectRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Project with ID '${projectId}' not found`);
    }

    const inScope = await scopeService.isWithinAdministrativeScope(
      userId,
      project.administrativeUnitId
    );
    if (!inScope) {
      throw new NotFoundError(`Project with ID '${projectId}' not found`);
    }

    // Ownership check — only the original project creator may register the project
    if (project.createdBy !== userId) {
      throw new ForbiddenError(
        'Forbidden: Only the project creator may register this project'
      );
    }

    if (project.status !== 'DRAFT') {
      throw new BadRequestError(`Cannot register project: project status is '${project.status}', expected 'DRAFT'`);
    }

    await projectRepository.updateProject(projectId, {
      status: 'REGISTERED',
    });

    const updated = await projectRepository.findProjectById(projectId);
    if (!updated) {
      throw new Error('Failed to retrieve registered project');
    }

    return updated;
  }

  /**
   * Changes project status following strict transition policies.
   */
  async updateProjectStatus(
    projectId: string,
    input: UpdateProjectStatusInput,
    userId: string
  ): Promise<ProjectWithRelations> {
    const project = await projectRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Project with ID '${projectId}' not found`);
    }

    const inScope = await scopeService.isWithinAdministrativeScope(
      userId,
      project.administrativeUnitId
    );
    if (!inScope) {
      throw new NotFoundError(`Project with ID '${projectId}' not found`);
    }

    const currentStatus = project.status as ProjectStatus;
    const targetStatus = input.status as ProjectStatus;

    // Check if target is same as current
    if (currentStatus === targetStatus) {
      return project;
    }

    // Check transition validity
    const allowedTargets = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowedTargets.includes(targetStatus)) {
      throw new BadRequestError(
        `Invalid status transition from '${currentStatus}' to '${targetStatus}'. Permitted transitions: [${allowedTargets.join(', ')}]`
      );
    }

    // Registration requires PROJECT_REGISTER permission and project creator ownership
    if (targetStatus === 'REGISTERED') {
      await permissionService.requirePermission(userId, 'PROJECT_REGISTER');
      if (project.createdBy !== userId) {
        throw new ForbiddenError(
          'Forbidden: Only the project creator may register this project'
        );
      }
    } else {
      // Other status transitions require PROJECT_UPDATE
      await permissionService.requirePermission(userId, 'PROJECT_UPDATE');
    }

    await projectRepository.updateProject(projectId, {
      status: targetStatus,
    });

    const updated = await projectRepository.findProjectById(projectId);
    if (!updated) {
      throw new Error('Failed to retrieve updated project record');
    }

    return updated;
  }

  /**
   * Unlocks a project for editing by its original creator to address a correction
   * request raised during acquisition-case review.
   *
   * Called atomically from within an acquisition-case review transaction.
   * The caseId is stored in correctionPendingFor to track the active correction cycle.
   */
  async unlockForCorrection(
    projectId: string,
    caseId: string,
    txClient?: Parameters<Parameters<typeof db.transaction>[0]>[0]
  ): Promise<void> {
    const executor = (txClient ?? db) as typeof db;
    await executor
      .update(projects)
      .set({ correctionPendingFor: caseId, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
  }

  /**
   * Called by the original project creator to signal that the correction has been
   * addressed and the project is ready for the Land Officer to resubmit the acquisition case.
   *
   * Clears the correctionPendingFor flag, ending the creator-editable correction window.
   * The project must currently have correctionPendingFor set and belong to the caller.
   */
  async resubmitAfterCorrection(
    projectId: string,
    userId: string
  ): Promise<ProjectWithRelations> {
    await permissionService.requirePermission(userId, 'PROJECT_UPDATE');

    const project = await projectRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Project with ID '${projectId}' not found`);
    }

    const inScope = await scopeService.isWithinAdministrativeScope(
      userId,
      project.administrativeUnitId
    );
    if (!inScope) {
      throw new NotFoundError(`Project with ID '${projectId}' not found`);
    }

    if (project.createdBy !== userId) {
      throw new ForbiddenError(
        'Forbidden: Only the original project creator may resubmit after correction'
      );
    }

    if (!project.correctionPendingFor) {
      throw new BadRequestError(
        'This project does not have an active correction cycle. No resubmission is needed.'
      );
    }

    await projectRepository.updateProject(projectId, {
      correctionPendingFor: null,
      updatedAt: new Date(),
    });

    const updated = await projectRepository.findProjectById(projectId);
    if (!updated) {
      throw new Error('Failed to retrieve project after correction resubmission');
    }

    return updated;
  }
}

export const projectService = new ProjectService();
