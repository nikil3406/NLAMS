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
import { authorizationService } from '../authorization/authorization.service';
import { permissionService } from '../authorization/permission.service';
import { scopeService } from '../authorization/scope.service';
import { userRepository } from '../../repositories/user.repository';
import { administrativeUnitRepository } from '../../repositories/administrative-unit.repository';
import type {
  CreateProjectInput,
  UpdateProjectInput,
  ProjectQueryInput,
  UpdateProjectStatusInput,
  ReviewProjectInput,
} from '../../validators/projects';
import type { ProjectStatus } from '../../../db/schema/projects';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
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
  DRAFT: ['SUBMITTED', 'REGISTERED', 'CANCELLED'],
  SUBMITTED: ['ACCEPTED', 'REGISTERED', 'ON_HOLD', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
  REGISTERED: ['ACCEPTED', 'SUBMITTED', 'ON_HOLD', 'COMPLETED', 'CANCELLED'],
  ON_HOLD: ['ACCEPTED', 'REGISTERED', 'SUBMITTED', 'CANCELLED'],
  COMPLETED: [], // Terminal
  CANCELLED: [], // Terminal
  REJECTED: [], // Terminal
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

    // 3. Implementing Agency resolution & validation
    let resolvedImplementingAgencyId: string;
    const isMinistryOrSuper = isSuper || creatorRoles.includes('MINISTRY_ADMIN');
    if (!isMinistryOrSuper && creatorRoles.includes('PROJECT_OFFICER')) {
      const userAgency = await authorizationService.requireProjectOfficerActiveAgency(userId);
      if (input.implementingAgencyId && input.implementingAgencyId !== userAgency.id) {
        console.warn(
          `[AUDIT] Blocked Project Officer (${userId}) attempt to override Implementing Agency: supplied=${input.implementingAgencyId}, assigned=${userAgency.id}`
        );
        throw new ForbiddenError(
          'Forbidden: Project Officers cannot select or override their Implementing Agency'
        );
      }
      resolvedImplementingAgencyId = userAgency.id;
    } else {
      if (!input.implementingAgencyId) {
        throw new BadRequestError('Implementing agency is required');
      }
      await implementingAgencyService.validateActiveAgency(input.implementingAgencyId);
      resolvedImplementingAgencyId = input.implementingAgencyId;
    }

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
          implementingAgencyId: resolvedImplementingAgencyId,
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

    console.info(
      `[AUDIT] Project created: projectId=${created.id}, projectCode=${created.projectCode}, implementingAgencyId=${resolvedImplementingAgencyId}, createdBy=${userId}`
    );

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

    const [allowedUnits, agencyScope] = await Promise.all([
      scopeService.getAllowedUnitIdsForUser(userId),
      authorizationService.getAgencyScopeForUser(userId),
    ]);

    if (agencyScope === null) {
      return {
        data: [],
        pagination: { total: 0, page: query.page, limit: query.limit, totalPages: 0 },
      };
    }

    let effectiveAgencyId = query.implementingAgencyId;
    if (agencyScope !== undefined) {
      if (query.implementingAgencyId && query.implementingAgencyId !== agencyScope) {
        return {
          data: [],
          pagination: { total: 0, page: query.page, limit: query.limit, totalPages: 0 },
        };
      }
      effectiveAgencyId = agencyScope;
    }

    let allowedUnitIds: string[] | undefined;

    if (allowedUnits !== undefined) {
      if (allowedUnits.length === 0) {
        return {
          data: [],
          pagination: { total: 0, page: query.page, limit: query.limit, totalPages: 0 },
        };
      }
      if (query.administrativeUnitId) {
        if (!allowedUnits.includes(query.administrativeUnitId)) {
          return {
            data: [],
            pagination: { total: 0, page: query.page, limit: query.limit, totalPages: 0 },
          };
        }
        allowedUnitIds = [query.administrativeUnitId];
      } else {
        allowedUnitIds = allowedUnits;
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
      implementingAgencyId: effectiveAgencyId,
      administrativeUnitIds: allowedUnitIds,
      landAcquisitionRequired: query.landAcquisitionRequired,
      hasAcquisitionCase: query.hasAcquisitionCase,
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

    // 2. Administrative scope & organization-scope check (404 to avoid leaking existence of out-of-scope project)
    const [inScope, inAgencyScope] = await Promise.all([
      scopeService.isWithinAdministrativeScope(userId, project.administrativeUnitId),
      authorizationService.canAccessProjectByAgency(userId, project.implementingAgencyId),
    ]);
    if (!inScope || !inAgencyScope) {
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

    // 2. Administrative scope & organization-scope check on existing project
    const [inScope, inAgencyScope] = await Promise.all([
      scopeService.isWithinAdministrativeScope(userId, project.administrativeUnitId),
      authorizationService.canAccessProjectByAgency(userId, project.implementingAgencyId),
    ]);
    if (!inScope || !inAgencyScope) {
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

    // 5. Implementing Agency reassignment is not permitted through ordinary project editing
    if (input.implementingAgencyId && input.implementingAgencyId !== project.implementingAgencyId) {
      throw new ForbiddenError(
        'Forbidden: Implementing Agency cannot be reassigned through ordinary project editing'
      );
    }

    // 6. Pre-validate and measure geometry if boundary is provided
    let measurement: { areaSqm: number } | null = null;
    if (input.boundary && input.boundary.geometry) {
      measurement = await projectBoundaryService.validateAndMeasureGeometry(input.boundary.geometry);
    }

    // 7. Update database record and optional boundary version atomically
    await db.transaction(async (tx) => {
      await projectRepository.updateProject(
        projectId,
        {
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
        },
        tx
      );

      if (input.boundary && input.boundary.geometry && measurement) {
        const nextVersion = await projectBoundaryRepository.getNextVersionNumber(projectId, tx);
        await projectBoundaryRepository.createBoundaryVersion(
          {
            projectId,
            versionNumber: nextVersion,
            geometry: input.boundary.geometry,
            estimatedLandArea: input.boundary.estimatedLandArea,
            estimatedAreaUnit: input.boundary.estimatedAreaUnit,
            calculatedGeometryArea: measurement.areaSqm.toFixed(2),
            createdBy: userId,
            changeReason:
              input.boundary.changeReason ??
              `Boundary updated during project edit (v${nextVersion})`,
          },
          tx
        );
      }
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

    const [inScope, inAgencyScope] = await Promise.all([
      scopeService.isWithinAdministrativeScope(userId, project.administrativeUnitId),
      authorizationService.canAccessProjectByAgency(userId, project.implementingAgencyId),
    ]);
    if (!inScope || !inAgencyScope) {
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
      status: 'SUBMITTED',
      updatedAt: new Date(),
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

    const [inScope, inAgencyScope] = await Promise.all([
      scopeService.isWithinAdministrativeScope(userId, project.administrativeUnitId),
      authorizationService.canAccessProjectByAgency(userId, project.implementingAgencyId),
    ]);
    if (!inScope || !inAgencyScope) {
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

    const [inScope, inAgencyScope] = await Promise.all([
      scopeService.isWithinAdministrativeScope(userId, project.administrativeUnitId),
      authorizationService.canAccessProjectByAgency(userId, project.implementingAgencyId),
    ]);
    if (!inScope || !inAgencyScope) {
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
      status: 'SUBMITTED',
      correctionPendingFor: null,
      updatedAt: new Date(),
    });

    const updated = await projectRepository.findProjectById(projectId);
    if (!updated) {
      throw new Error('Failed to retrieve project after correction resubmission');
    }

    return updated;
  }

  /**
   * Reviews a registered/submitted project and records an authorized workflow transition decision.
   * Permitted decisions and resulting transitions:
   *   ACCEPT / APPROVE: SUBMITTED -> ACCEPTED
   *   REQUEST_CORRECTIONS / RETURN_FOR_CORRECTION: Unlocks project for creator editing (sets correctionPendingFor)
   *   REJECT: SUBMITTED -> REJECTED
   *
   * Enforces:
   *   - Separation-of-duties: Project creator cannot review their own project.
   *   - Counterpart-role enforcement:
   *     If created by PROJECT_OFFICER => reviewer must have MINISTRY_ADMIN.
   *     If created by MINISTRY_ADMIN => reviewer must have PROJECT_OFFICER.
   *   - Administrative scope check over project's administrativeUnitId.
   */
  async reviewProject(
    projectId: string,
    input: ReviewProjectInput,
    userId: string
  ): Promise<ProjectWithRelations> {
    // 1. Permission & active user check
    await permissionService.requirePermission(userId, 'PROJECT_VIEW');

    const reviewer = await userRepository.findUserById(userId);
    if (!reviewer || reviewer.status !== 'ACTIVE') {
      throw new ForbiddenError(
        'Forbidden: Only active users may review projects'
      );
    }

    // 2. Validate project exists
    const project = await projectRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Project with ID '${projectId}' not found`);
    }

    // 3. Administrative scope check
    const inScope = await scopeService.isWithinAdministrativeScope(
      userId,
      project.administrativeUnitId
    );
    if (!inScope) {
      throw new ForbiddenError(
        'Forbidden: project is outside your authorized administrative scope'
      );
    }

    // 4. Separation-of-duties: reviewer cannot be the project creator
    if (userId === project.createdBy) {
      throw new ForbiddenError(
        'Forbidden: The project creator cannot review their own project'
      );
    }

    // 5. Counterpart-role & Implementing Agency enforcement
    const projectCreatorRoles = await permissionService.getUserRoles(project.createdBy);
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

      // If Ministry-created project is reviewed by PROJECT_OFFICER, enforce matching active Implementing Agency
      if (requiredCounterpartRole === 'PROJECT_OFFICER') {
        const reviewerAgency = await authorizationService.requireProjectOfficerActiveAgency(userId);
        if (reviewerAgency.id !== project.implementingAgencyId) {
          console.warn(
            `[AUDIT] Blocked cross-agency project review: projectId=${projectId}, projectAgency=${project.implementingAgencyId}, reviewerId=${userId}, reviewerAgency=${reviewerAgency.id}`
          );
          throw new ForbiddenError(
            `Forbidden: Only an active Project Officer belonging to the project's Implementing Agency (${project.implementingAgency.code}) may review this project`
          );
        }
      }
    }

    // 6. Project state validation
    if (project.correctionPendingFor) {
      throw new BadRequestError(
        'Cannot review project: project has active corrections pending resubmission by the creator'
      );
    }

    if (project.status === 'DRAFT') {
      throw new BadRequestError(
        'Cannot review project: project is still in DRAFT status and has not been registered/submitted for review'
      );
    }

    if (project.status === 'ACCEPTED' || project.status === 'REJECTED') {
      throw new ConflictError(
        `Cannot review project: project has already been ${project.status.toLowerCase()}`
      );
    }

    // 7. Process decision
    const decision = input.decision;
    if (decision === 'ACCEPT' || decision === 'APPROVE') {
      await projectRepository.updateProject(projectId, {
        status: 'ACCEPTED',
        correctionPendingFor: null,
        updatedAt: new Date(),
      });
    } else if (decision === 'REQUEST_CORRECTIONS' || decision === 'RETURN_FOR_CORRECTION') {
      await projectRepository.updateProject(projectId, {
        correctionPendingFor: projectId,
        updatedAt: new Date(),
      });
    } else if (decision === 'REJECT') {
      await projectRepository.updateProject(projectId, {
        status: 'REJECTED',
        updatedAt: new Date(),
      });
    }

    const updated = await projectRepository.findProjectById(projectId);
    if (!updated) {
      throw new Error('Failed to retrieve updated project after review');
    }

    return updated;
  }
}

export const projectService = new ProjectService();
