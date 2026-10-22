import {
  projectBoundaryRepository,
  type BoundaryRecord,
  type GeometryMeasurement,
} from '../../repositories/project-boundary.repository';
import { projectRepository } from '../../repositories/project.repository';
import { permissionService } from '../authorization/permission.service';
import { scopeService } from '../authorization/scope.service';
import type { ProjectBoundaryInput, GeoJsonGeometry } from '../../validators/spatial/boundary.schema';
import { BadRequestError, NotFoundError } from '../../types';

export class ProjectBoundaryService {
  /**
   * Validates GeoJSON geometry structure, coordinate validity, and measures spheroidal area via PostGIS.
   * Throws BadRequestError if geometry is malformed, self-intersecting, or non-polygonal.
   */
  async validateAndMeasureGeometry(geometry: GeoJsonGeometry): Promise<GeometryMeasurement> {
    if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) {
      throw new BadRequestError('Boundary geometry must be a valid GeoJSON Polygon or MultiPolygon');
    }

    if (!geometry.coordinates || !Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
      throw new BadRequestError('Boundary geometry cannot have empty coordinates');
    }

    const measurement = await projectBoundaryRepository.measureAndValidateGeometry(geometry);

    if (!measurement.isValid) {
      throw new BadRequestError(
        `Invalid geometry: ${measurement.reason ?? 'Polygon contains self-intersections or invalid rings'}`
      );
    }

    if (measurement.geometryType !== 'ST_Polygon' && measurement.geometryType !== 'ST_MultiPolygon') {
      throw new BadRequestError(
        `Geometry type must be Polygon or MultiPolygon, received '${measurement.geometryType}'`
      );
    }

    if (measurement.areaSqm <= 0) {
      throw new BadRequestError('Calculated geometry area must be greater than zero');
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

    const inScope = await scopeService.isWithinAdministrativeScope(
      userId,
      project.administrativeUnitId
    );
    if (!inScope) {
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

    const inScope = await scopeService.isWithinAdministrativeScope(
      userId,
      project.administrativeUnitId
    );
    if (!inScope) {
      throw new NotFoundError(`Project with ID '${projectId}' not found`);
    }

    return projectBoundaryRepository.findBoundaryVersionsByProjectId(projectId);
  }
}

export const projectBoundaryService = new ProjectBoundaryService();
