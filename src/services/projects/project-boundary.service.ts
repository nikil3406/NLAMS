import {
  projectBoundaryRepository,
  type BoundaryRecord,
  type GeometryMeasurement,
} from '../../repositories/project-boundary.repository';
import { projectRepository } from '../../repositories/project.repository';
import { permissionService } from '../authorization/permission.service';
import { scopeService } from '../authorization/scope.service';
import { authorizationService } from '../authorization/authorization.service';
import type { ProjectBoundaryInput, GeoJsonGeometry } from '../../validators/spatial/boundary.schema';
import { BadRequestError, NotFoundError, ForbiddenError } from '../../types';

export class ProjectBoundaryService {
  /**
   * Validates GeoJSON geometry structure, coordinate validity, and measures spheroidal area or line length via PostGIS.
   * Supports Polygon, MultiPolygon, and LineString.
   */
  async validateAndMeasureGeometry(geometry: GeoJsonGeometry): Promise<GeometryMeasurement> {
    if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon' && geometry.type !== 'LineString')) {
      throw new BadRequestError('Boundary geometry must be a valid GeoJSON Polygon, MultiPolygon, or LineString');
    }

    if (!geometry.coordinates || !Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
      throw new BadRequestError('Boundary geometry cannot have empty coordinates');
    }

    if (geometry.type === 'LineString' && geometry.coordinates.length < 2) {
      throw new BadRequestError('LineString geometry must have at least 2 coordinate points');
    }

    const measurement = await projectBoundaryRepository.measureAndValidateGeometry(geometry);

    if (!measurement.isValid) {
      throw new BadRequestError(
        `Invalid geometry: ${measurement.reason ?? 'Geometry contains self-intersections or invalid coordinates'}`
      );
    }

    const validTypes = ['ST_Polygon', 'ST_MultiPolygon', 'ST_LineString'];
    if (!validTypes.includes(measurement.geometryType)) {
      throw new BadRequestError(
        `Geometry type must be Polygon, MultiPolygon, or LineString, received '${measurement.geometryType}'`
      );
    }

    if (geometry.type !== 'LineString' && measurement.areaSqm <= 0) {
      throw new BadRequestError('Calculated geometry area must be greater than zero');
    }

    if (geometry.type === 'LineString' && (measurement.lengthMeters ?? 0) <= 0) {
      throw new BadRequestError('Calculated line length must be greater than zero');
    }

    return measurement;
  }

  /**
   * Persists a revised boundary as a new immutable version.
   * Enforces PROJECT_UPDATE permission, administrative scope, and terminal state checks.
   */
  async saveBoundaryVersion(
    projectId: string,
    input: ProjectBoundaryInput,
    userId: string
  ): Promise<BoundaryRecord> {
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

    // Ownership check — only the original creator may update a boundary.
    if (project.createdBy !== userId) {
      throw new ForbiddenError(
        'Forbidden: Only the original project creator may update the project boundary'
      );
    }

    // Workflow-state editability: allowed only in DRAFT or during an active correction cycle.
    const isUnderCorrection = project.correctionPendingFor !== null;
    if (!isUnderCorrection && project.status !== 'DRAFT') {
      throw new BadRequestError(
        `Cannot modify project boundary: editing is only permitted in 'DRAFT' status or during an authorized correction cycle`
      );
    }

    if (project.status === 'COMPLETED' || project.status === 'CANCELLED') {
      throw new BadRequestError(`Cannot modify boundary for a project in '${project.status}' status`);
    }

    // Measure and validate server-side via PostGIS
    const measurement = await this.validateAndMeasureGeometry(input.geometry);

    const nextVer = await projectBoundaryRepository.getNextVersionNumber(projectId);

    const boundary = await projectBoundaryRepository.createBoundaryVersion({
      projectId,
      versionNumber: nextVer,
      geometry: input.geometry,
      estimatedLandArea: input.estimatedLandArea,
      estimatedAreaUnit: input.estimatedAreaUnit,
      calculatedGeometryArea: measurement.areaSqm.toFixed(2),
      createdBy: userId,
      changeReason: input.changeReason ?? `Boundary revised to version ${nextVer}`,
    });

    return boundary;
  }

  /**
   * Retrieves the latest boundary version for a project.
   * Enforces PROJECT_VIEW permission and administrative scope.
   */
  async getLatestBoundary(
    projectId: string,
    userId: string
  ): Promise<BoundaryRecord | null> {
    await permissionService.requirePermission(userId, 'PROJECT_VIEW');

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

    return projectBoundaryRepository.findLatestBoundaryByProjectId(projectId);
  }

  /**
   * Retrieves boundary version history for audit and timeline review.
   */
  async getBoundaryHistory(
    projectId: string,
    userId: string
  ): Promise<BoundaryRecord[]> {
    await permissionService.requirePermission(userId, 'PROJECT_VIEW');

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

    return projectBoundaryRepository.findBoundaryVersionsByProjectId(projectId);
  }
}

export const projectBoundaryService = new ProjectBoundaryService();
