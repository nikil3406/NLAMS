import { sql } from 'drizzle-orm';
import { db } from '../../db';
import type { GeoJsonGeometry } from '../validators/spatial/boundary.schema';

export interface BoundaryRecord {
  id: string;
  projectId: string;
  versionNumber: number;
  geometry: GeoJsonGeometry;
  estimatedLandArea: string;
  estimatedAreaUnit: string;
  calculatedGeometryArea: string;
  createdBy: string;
  createdAt: Date;
  changeReason: string | null;
  creator?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface GeometryMeasurement {
  isValid: boolean;
  reason: string | null;
  geometryType: string;
  areaSqm: number;
}

type TransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface RawBoundaryRow {
  id: string;
  projectId: string;
  versionNumber: number;
  geometry: GeoJsonGeometry;
  estimatedLandArea: string | number;
  estimatedAreaUnit: string;
  calculatedGeometryArea: string | number;
  createdBy: string;
  createdAt: string | Date;
  changeReason: string | null;
  creator?: {
    id: string;
    name: string;
    email: string;
  };
}

export class ProjectBoundaryRepository {
  /**
   * Validates GeoJSON geometry and calculates accurate ellipsoidal area using PostGIS.
   */
  async measureAndValidateGeometry(geometry: GeoJsonGeometry): Promise<GeometryMeasurement> {
    const geoJsonStr = JSON.stringify(geometry);
    const result = await db.execute<{
      is_valid: boolean;
      reason: string | null;
      geom_type: string;
      area_sqm: number | string;
    }>(sql`
      SELECT
        ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON(${geoJsonStr}), 4326)) AS is_valid,
        ST_IsValidReason(ST_SetSRID(ST_GeomFromGeoJSON(${geoJsonStr}), 4326)) AS reason,
        ST_GeometryType(ST_SetSRID(ST_GeomFromGeoJSON(${geoJsonStr}), 4326)) AS geom_type,
        ST_Area(ST_SetSRID(ST_GeomFromGeoJSON(${geoJsonStr}), 4326)::geography) AS area_sqm
    `);

    const row = result[0];
    if (!row) {
      throw new Error('Failed to validate geometry in PostGIS');
    }

    return {
      isValid: Boolean(row.is_valid),
      reason: row.reason,
      geometryType: String(row.geom_type ?? ''),
      areaSqm: Number(row.area_sqm ?? 0),
    };
  }

  /**
   * Persists a boundary version record.
   * Can be executed within an optional transaction context.
   */
  async createBoundaryVersion(
    data: {
      projectId: string;
      versionNumber: number;
      geometry: GeoJsonGeometry;
      estimatedLandArea: string;
      estimatedAreaUnit: string;
      calculatedGeometryArea: string;
      createdBy: string;
      changeReason?: string | null;
    },
    txClient?: TransactionClient
  ): Promise<BoundaryRecord> {
    const executor = (txClient ?? db) as typeof db;
    const geoJsonStr = JSON.stringify(data.geometry);

    const result = await executor.execute(sql`
      INSERT INTO project_boundary_versions (
        project_id,
        version_number,
        geometry,
        estimated_land_area,
        estimated_area_unit,
        calculated_geometry_area,
        created_by,
        change_reason
      )
      VALUES (
        ${data.projectId}::uuid,
        ${data.versionNumber},
        ST_SetSRID(ST_GeomFromGeoJSON(${geoJsonStr}), 4326),
        ${data.estimatedLandArea}::numeric,
        ${data.estimatedAreaUnit},
        ${data.calculatedGeometryArea}::numeric,
        ${data.createdBy}::uuid,
        ${data.changeReason ?? null}
      )
      RETURNING
        id,
        project_id AS "projectId",
        version_number AS "versionNumber",
        ST_AsGeoJSON(geometry)::json AS "geometry",
        estimated_land_area AS "estimatedLandArea",
        estimated_area_unit AS "estimatedAreaUnit",
        calculated_geometry_area AS "calculatedGeometryArea",
        created_by AS "createdBy",
        created_at AS "createdAt",
        change_reason AS "changeReason"
    `);

    const row = (result as unknown as RawBoundaryRow[])[0];

    return {
      ...row,
      estimatedLandArea: String(row.estimatedLandArea),
      calculatedGeometryArea: String(row.calculatedGeometryArea),
      createdAt: new Date(row.createdAt),
    };
  }

  /**
   * Retrieves the latest boundary version for a project.
   */
  async findLatestBoundaryByProjectId(
    projectId: string,
    txClient?: TransactionClient
  ): Promise<BoundaryRecord | null> {
    const executor = (txClient ?? db) as typeof db;
    const rows = (await executor.execute(sql`
      SELECT
        pbv.id,
        pbv.project_id AS "projectId",
        pbv.version_number AS "versionNumber",
        ST_AsGeoJSON(pbv.geometry)::json AS "geometry",
        pbv.estimated_land_area AS "estimatedLandArea",
        pbv.estimated_area_unit AS "estimatedAreaUnit",
        pbv.calculated_geometry_area AS "calculatedGeometryArea",
        pbv.created_by AS "createdBy",
        pbv.created_at AS "createdAt",
        pbv.change_reason AS "changeReason",
        json_build_object(
          'id', u.id,
          'name', u.name,
          'email', u.email
        ) AS creator
      FROM project_boundary_versions pbv
      INNER JOIN users u ON u.id = pbv.created_by
      WHERE pbv.project_id = ${projectId}::uuid
      ORDER BY pbv.version_number DESC
      LIMIT 1
    `)) as unknown as RawBoundaryRow[];

    if (!rows || rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      ...row,
      estimatedLandArea: String(row.estimatedLandArea),
      calculatedGeometryArea: String(row.calculatedGeometryArea),
      createdAt: new Date(row.createdAt),
    };
  }

  /**
   * Resolves the next version number for a project.
   */
  async getNextVersionNumber(projectId: string, txClient?: TransactionClient): Promise<number> {
    const executor = (txClient ?? db) as typeof db;
    const rows = (await executor.execute(sql`
      SELECT COALESCE(MAX(version_number), 0) + 1 AS max_ver
      FROM project_boundary_versions
      WHERE project_id = ${projectId}::uuid
    `)) as unknown as { max_ver: number | null }[];

    return Number(rows[0]?.max_ver ?? 1);
  }

  /**
   * Retrieves all boundary versions for a project in descending order.
   */
  async findBoundaryVersionsByProjectId(projectId: string): Promise<BoundaryRecord[]> {
    const rows = (await db.execute(sql`
      SELECT
        pbv.id,
        pbv.project_id AS "projectId",
        pbv.version_number AS "versionNumber",
        ST_AsGeoJSON(pbv.geometry)::json AS "geometry",
        pbv.estimated_land_area AS "estimatedLandArea",
        pbv.estimated_area_unit AS "estimatedAreaUnit",
        pbv.calculated_geometry_area AS "calculatedGeometryArea",
        pbv.created_by AS "createdBy",
        pbv.created_at AS "createdAt",
        pbv.change_reason AS "changeReason",
        json_build_object(
          'id', u.id,
          'name', u.name,
          'email', u.email
        ) AS creator
      FROM project_boundary_versions pbv
      INNER JOIN users u ON u.id = pbv.created_by
      WHERE pbv.project_id = ${projectId}::uuid
      ORDER BY pbv.version_number DESC
    `)) as unknown as RawBoundaryRow[];

    return (rows ?? []).map((row) => ({
      ...row,
      estimatedLandArea: String(row.estimatedLandArea),
      calculatedGeometryArea: String(row.calculatedGeometryArea),
      createdAt: new Date(row.createdAt),
    }));
  }
}

export const projectBoundaryRepository = new ProjectBoundaryRepository();
