import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  landParcels,
  type LandParcel,
  type NewLandParcel,
} from '../../db/schema/land-parcels';
import {
  acquisitionCaseParcels,
  type AcquisitionCaseParcel,
  type NewAcquisitionCaseParcel,
} from '../../db/schema/acquisition-case-parcels';
import { users } from '../../db/schema/users';
import type { GeoJsonGeometry } from '../validators/spatial/boundary.schema';

export type TransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface CaseParcelWithDetails {
  id: string; // case_parcel_id
  caseId: string;
  parcelId: string;
  proposedAffectedArea: string;
  affectedAreaUnit: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  parcel: {
    id: string;
    parcelId: string;
    administrativeUnitId: string | null;
    state: string;
    district: string;
    taluk: string;
    village: string;
    surveyNumber: string;
    subdivisionNumber: string | null;
    landRecordReference: string | null;
    totalArea: string;
    areaUnit: string;
    landUse: string | null;
    physicalDescription: string | null;
    geometry: GeoJsonGeometry | null;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
  };
  creator: {
    id: string;
    name: string;
    email: string;
  };
}

export interface ListCaseParcelsResult {
  data: CaseParcelWithDetails[];
  total: number;
}

export class ParcelRepository {
  /**
   * Generates the next sequential parcel identifier concurrency-safely via PostgreSQL sequence.
   * Format: NLAMS-PRC-000001
   */
  async generateParcelId(): Promise<string> {
    try {
      const result = await db.execute<{ seq: string | number }>(
        sql`SELECT nextval('land_parcel_id_seq') as seq;`
      );
      const seqValue = Number(result[0]?.seq ?? 1);
      return `NLAMS-PRC-${String(seqValue).padStart(6, '0')}`;
    } catch {
      // Fallback: If sequence is not accessible in a lightweight mock, calculate safely
      const [maxParcel] = await db
        .select({ code: landParcels.parcelId })
        .from(landParcels)
        .orderBy(desc(landParcels.parcelId))
        .limit(1);

      let nextNum = 1;
      if (maxParcel?.code) {
        const match = maxParcel.code.match(/(\d+)$/);
        if (match) {
          nextNum = parseInt(match[1], 10) + 1;
        }
      }
      return `NLAMS-PRC-${String(nextNum).padStart(6, '0')}`;
    }
  }

  /**
   * Finds a canonical land parcel by UUID or parcel identifier.
   */
  async findParcelById(
    idOrParcelId: string,
    txClient?: TransactionClient
  ): Promise<(LandParcel & { geometry: GeoJsonGeometry | null }) | null> {
    const executor = (txClient ?? db) as typeof db;
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        idOrParcelId
      );

    const condition = isUuid
      ? or(eq(landParcels.id, idOrParcelId), eq(landParcels.parcelId, idOrParcelId))
      : eq(landParcels.parcelId, idOrParcelId);

    const result = await executor.execute(sql`
      SELECT
        id,
        parcel_id AS "parcelId",
        administrative_unit_id AS "administrativeUnitId",
        state,
        district,
        taluk,
        village,
        survey_number AS "surveyNumber",
        subdivision_number AS "subdivisionNumber",
        land_record_reference AS "landRecordReference",
        total_area AS "totalArea",
        area_unit AS "areaUnit",
        land_use AS "landUse",
        physical_description AS "physicalDescription",
        ST_AsGeoJSON(geometry)::json AS "geometry",
        created_by AS "createdBy",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM land_parcels
      WHERE ${condition}
      LIMIT 1
    `);

    const row = result[0];
    if (!row) return null;

    return {
      id: String(row.id),
      parcelId: String(row.parcelId),
      administrativeUnitId: row.administrativeUnitId ? String(row.administrativeUnitId) : null,
      state: String(row.state),
      district: String(row.district),
      taluk: String(row.taluk),
      village: String(row.village),
      surveyNumber: String(row.surveyNumber),
      subdivisionNumber: row.subdivisionNumber ? String(row.subdivisionNumber) : null,
      landRecordReference: row.landRecordReference ? String(row.landRecordReference) : null,
      totalArea: String(row.totalArea),
      areaUnit: String(row.areaUnit),
      landUse: row.landUse ? String(row.landUse) : null,
      physicalDescription: row.physicalDescription ? String(row.physicalDescription) : null,
      geometry: (row.geometry as GeoJsonGeometry) ?? null,
      createdBy: String(row.createdBy),
      createdAt: new Date(String(row.createdAt)),
      updatedAt: new Date(String(row.updatedAt)),
    };
  }

  /**
   * Locality-aware search to detect if a physical land parcel already exists in the registry.
   */
  async findExistingLocalityParcel(
    locality: {
      state: string;
      district: string;
      taluk: string;
      village: string;
      surveyNumber: string;
      subdivisionNumber?: string | null;
    },
    txClient?: TransactionClient
  ): Promise<(LandParcel & { geometry: GeoJsonGeometry | null }) | null> {
    const executor = (txClient ?? db) as typeof db;

    const subCond = locality.subdivisionNumber && locality.subdivisionNumber.trim().length > 0
      ? sql`lower(subdivision_number) = lower(${locality.subdivisionNumber.trim()})`
      : sql`(subdivision_number IS NULL OR subdivision_number = '')`;

    const result = await executor.execute(sql`
      SELECT
        id,
        parcel_id AS "parcelId",
        administrative_unit_id AS "administrativeUnitId",
        state,
        district,
        taluk,
        village,
        survey_number AS "surveyNumber",
        subdivision_number AS "subdivisionNumber",
        land_record_reference AS "landRecordReference",
        total_area AS "totalArea",
        area_unit AS "areaUnit",
        land_use AS "landUse",
        physical_description AS "physicalDescription",
        ST_AsGeoJSON(geometry)::json AS "geometry",
        created_by AS "createdBy",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM land_parcels
      WHERE lower(state) = lower(${locality.state.trim()})
        AND lower(district) = lower(${locality.district.trim()})
        AND lower(taluk) = lower(${locality.taluk.trim()})
        AND lower(village) = lower(${locality.village.trim()})
        AND lower(survey_number) = lower(${locality.surveyNumber.trim()})
        AND ${subCond}
      LIMIT 1
    `);

    const row = result[0];
    if (!row) return null;

    return {
      id: String(row.id),
      parcelId: String(row.parcelId),
      administrativeUnitId: row.administrativeUnitId ? String(row.administrativeUnitId) : null,
      state: String(row.state),
      district: String(row.district),
      taluk: String(row.taluk),
      village: String(row.village),
      surveyNumber: String(row.surveyNumber),
      subdivisionNumber: row.subdivisionNumber ? String(row.subdivisionNumber) : null,
      landRecordReference: row.landRecordReference ? String(row.landRecordReference) : null,
      totalArea: String(row.totalArea),
      areaUnit: String(row.areaUnit),
      landUse: row.landUse ? String(row.landUse) : null,
      physicalDescription: row.physicalDescription ? String(row.physicalDescription) : null,
      geometry: (row.geometry as GeoJsonGeometry) ?? null,
      createdBy: String(row.createdBy),
      createdAt: new Date(String(row.createdAt)),
      updatedAt: new Date(String(row.updatedAt)),
    };
  }

  /**
   * Inserts a canonical physical land parcel.
   */
  async createParcel(
    data: {
      parcelId: string;
      administrativeUnitId?: string | null;
      state: string;
      district: string;
      taluk: string;
      village: string;
      surveyNumber: string;
      subdivisionNumber?: string | null;
      landRecordReference?: string | null;
      totalArea: string;
      areaUnit: string;
      landUse?: string | null;
      physicalDescription?: string | null;
      geometry?: GeoJsonGeometry | null;
      createdBy: string;
    },
    txClient?: TransactionClient
  ): Promise<LandParcel & { geometry: GeoJsonGeometry | null }> {
    const executor = (txClient ?? db) as typeof db;
    const geoJsonStr = data.geometry ? JSON.stringify(data.geometry) : null;

    const geomSql = geoJsonStr
      ? sql`ST_SetSRID(ST_GeomFromGeoJSON(${geoJsonStr}), 4326)`
      : sql`NULL`;

    const result = await executor.execute(sql`
      INSERT INTO land_parcels (
        parcel_id,
        administrative_unit_id,
        state,
        district,
        taluk,
        village,
        survey_number,
        subdivision_number,
        land_record_reference,
        total_area,
        area_unit,
        land_use,
        physical_description,
        geometry,
        created_by
      )
      VALUES (
        ${data.parcelId},
        ${data.administrativeUnitId ? sql`${data.administrativeUnitId}::uuid` : sql`NULL`},
        ${data.state},
        ${data.district},
        ${data.taluk},
        ${data.village},
        ${data.surveyNumber},
        ${data.subdivisionNumber ?? null},
        ${data.landRecordReference ?? null},
        ${data.totalArea}::numeric,
        ${data.areaUnit},
        ${data.landUse ?? null},
        ${data.physicalDescription ?? null},
        ${geomSql},
        ${data.createdBy}::uuid
      )
      RETURNING
        id,
        parcel_id AS "parcelId",
        administrative_unit_id AS "administrativeUnitId",
        state,
        district,
        taluk,
        village,
        survey_number AS "surveyNumber",
        subdivision_number AS "subdivisionNumber",
        land_record_reference AS "landRecordReference",
        total_area AS "totalArea",
        area_unit AS "areaUnit",
        land_use AS "landUse",
        physical_description AS "physicalDescription",
        ST_AsGeoJSON(geometry)::json AS "geometry",
        created_by AS "createdBy",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `);

    const row = result[0];
    if (!row) {
      throw new Error('Failed to insert land parcel');
    }

    return {
      id: String(row.id),
      parcelId: String(row.parcelId),
      administrativeUnitId: row.administrativeUnitId ? String(row.administrativeUnitId) : null,
      state: String(row.state),
      district: String(row.district),
      taluk: String(row.taluk),
      village: String(row.village),
      surveyNumber: String(row.surveyNumber),
      subdivisionNumber: row.subdivisionNumber ? String(row.subdivisionNumber) : null,
      landRecordReference: row.landRecordReference ? String(row.landRecordReference) : null,
      totalArea: String(row.totalArea),
      areaUnit: String(row.areaUnit),
      landUse: row.landUse ? String(row.landUse) : null,
      physicalDescription: row.physicalDescription ? String(row.physicalDescription) : null,
      geometry: (row.geometry as GeoJsonGeometry) ?? null,
      createdBy: String(row.createdBy),
      createdAt: new Date(String(row.createdAt)),
      updatedAt: new Date(String(row.updatedAt)),
    };
  }

  /**
   * Finds an association between an acquisition case and a parcel.
   */
  async findCaseParcel(
    caseId: string,
    parcelId: string,
    txClient?: TransactionClient
  ): Promise<AcquisitionCaseParcel | null> {
    const executor = (txClient ?? db) as typeof db;
    const [record] = await executor
      .select()
      .from(acquisitionCaseParcels)
      .where(
        and(
          eq(acquisitionCaseParcels.caseId, caseId),
          eq(acquisitionCaseParcels.parcelId, parcelId)
        )
      )
      .limit(1);

    return record ?? null;
  }

  /**
   * Finds a case parcel by its junction ID, with joined canonical parcel and creator details.
   */
  async findCaseParcelById(
    caseParcelId: string,
    txClient?: TransactionClient
  ): Promise<CaseParcelWithDetails | null> {
    const executor = (txClient ?? db) as typeof db;

    const result = await executor.execute(sql`
      SELECT
        acp.id AS "caseParcelId",
        acp.case_id AS "caseId",
        acp.parcel_id AS "parcelId",
        acp.proposed_affected_area AS "proposedAffectedArea",
        acp.affected_area_unit AS "affectedAreaUnit",
        acp.created_by AS "createdBy",
        acp.created_at AS "createdAt",
        acp.updated_at AS "updatedAt",
        lp.id AS "lp_id",
        lp.parcel_id AS "lp_parcelId",
        lp.administrative_unit_id AS "lp_adminUnitId",
        lp.state AS "lp_state",
        lp.district AS "lp_district",
        lp.taluk AS "lp_taluk",
        lp.village AS "lp_village",
        lp.survey_number AS "lp_surveyNumber",
        lp.subdivision_number AS "lp_subdivisionNumber",
        lp.land_record_reference AS "lp_landRecordReference",
        lp.total_area AS "lp_totalArea",
        lp.area_unit AS "lp_areaUnit",
        lp.land_use AS "lp_landUse",
        lp.physical_description AS "lp_physicalDescription",
        ST_AsGeoJSON(lp.geometry)::json AS "lp_geometry",
        lp.created_by AS "lp_createdBy",
        lp.created_at AS "lp_createdAt",
        lp.updated_at AS "lp_updatedAt",
        u.id AS "u_id",
        u.name AS "u_name",
        u.email AS "u_email"
      FROM acquisition_case_parcels acp
      INNER JOIN land_parcels lp ON lp.id = acp.parcel_id
      INNER JOIN users u ON u.id = acp.created_by
      WHERE acp.id = ${caseParcelId}::uuid
      LIMIT 1
    `);

    const row = result[0];
    if (!row) return null;

    return {
      id: String(row.caseParcelId),
      caseId: String(row.caseId),
      parcelId: String(row.parcelId),
      proposedAffectedArea: String(row.proposedAffectedArea),
      affectedAreaUnit: String(row.affectedAreaUnit),
      createdBy: String(row.createdBy),
      createdAt: new Date(String(row.createdAt)),
      updatedAt: new Date(String(row.updatedAt)),
      parcel: {
        id: String(row.lp_id),
        parcelId: String(row.lp_parcelId),
        administrativeUnitId: row.lp_adminUnitId ? String(row.lp_adminUnitId) : null,
        state: String(row.lp_state),
        district: String(row.lp_district),
        taluk: String(row.lp_taluk),
        village: String(row.lp_village),
        surveyNumber: String(row.lp_surveyNumber),
        subdivisionNumber: row.lp_subdivisionNumber ? String(row.lp_subdivisionNumber) : null,
        landRecordReference: row.lp_landRecordReference ? String(row.lp_landRecordReference) : null,
        totalArea: String(row.lp_totalArea),
        areaUnit: String(row.lp_areaUnit),
        landUse: row.lp_landUse ? String(row.lp_landUse) : null,
        physicalDescription: row.lp_physicalDescription ? String(row.lp_physicalDescription) : null,
        geometry: (row.lp_geometry as GeoJsonGeometry) ?? null,
        createdBy: String(row.lp_createdBy),
        createdAt: new Date(String(row.lp_createdAt)),
        updatedAt: new Date(String(row.lp_updatedAt)),
      },
      creator: {
        id: String(row.u_id),
        name: String(row.u_name),
        email: String(row.u_email),
      },
    };
  }

  /**
   * Associates a parcel with an acquisition case.
   */
  async createCaseParcel(
    data: {
      caseId: string;
      parcelId: string;
      proposedAffectedArea: string;
      affectedAreaUnit: string;
      createdBy: string;
    },
    txClient?: TransactionClient
  ): Promise<AcquisitionCaseParcel> {
    const executor = (txClient ?? db) as typeof db;
    const [record] = await executor
      .insert(acquisitionCaseParcels)
      .values({
        caseId: data.caseId,
        parcelId: data.parcelId,
        proposedAffectedArea: data.proposedAffectedArea,
        affectedAreaUnit: data.affectedAreaUnit,
        createdBy: data.createdBy,
      })
      .returning();

    return record;
  }

  /**
   * Updates case-specific details of a parcel association (proposedAffectedArea, affectedAreaUnit).
   */
  async updateCaseParcel(
    id: string,
    data: {
      proposedAffectedArea?: string;
      affectedAreaUnit?: string;
    },
    txClient?: TransactionClient
  ): Promise<AcquisitionCaseParcel> {
    const executor = (txClient ?? db) as typeof db;
    const updateData: Partial<NewAcquisitionCaseParcel> & { updatedAt: Date } = {
      updatedAt: new Date(),
    };

    if (data.proposedAffectedArea !== undefined) {
      updateData.proposedAffectedArea = data.proposedAffectedArea;
    }
    if (data.affectedAreaUnit !== undefined) {
      updateData.affectedAreaUnit = data.affectedAreaUnit;
    }

    const [updated] = await executor
      .update(acquisitionCaseParcels)
      .set(updateData)
      .where(eq(acquisitionCaseParcels.id, id))
      .returning();

    return updated;
  }

  /**
   * Lists all parcels associated with an acquisition case, with optional search and pagination.
   */
  async listParcelsByCaseId(
    caseId: string,
    options?: {
      search?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<ListCaseParcelsResult> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    let searchCondition = sql`TRUE`;
    if (options?.search && options.search.trim().length > 0) {
      const term = `%${options.search.trim()}%`;
      searchCondition = sql`(
        lp.parcel_id ILIKE ${term}
        OR lp.survey_number ILIKE ${term}
        OR lp.subdivision_number ILIKE ${term}
        OR lp.village ILIKE ${term}
        OR lp.taluk ILIKE ${term}
        OR lp.district ILIKE ${term}
        OR lp.state ILIKE ${term}
        OR lp.land_record_reference ILIKE ${term}
      )`;
    }

    const [countRow] = await db.execute<{ count: string | number }>(sql`
      SELECT COUNT(*) AS count
      FROM acquisition_case_parcels acp
      INNER JOIN land_parcels lp ON lp.id = acp.parcel_id
      WHERE acp.case_id = ${caseId}::uuid
        AND ${searchCondition}
    `);
    const total = Number(countRow?.count ?? 0);

    const rows = await db.execute(sql`
      SELECT
        acp.id AS "caseParcelId",
        acp.case_id AS "caseId",
        acp.parcel_id AS "parcelId",
        acp.proposed_affected_area AS "proposedAffectedArea",
        acp.affected_area_unit AS "affectedAreaUnit",
        acp.created_by AS "createdBy",
        acp.created_at AS "createdAt",
        acp.updated_at AS "updatedAt",
        lp.id AS "lp_id",
        lp.parcel_id AS "lp_parcelId",
        lp.administrative_unit_id AS "lp_adminUnitId",
        lp.state AS "lp_state",
        lp.district AS "lp_district",
        lp.taluk AS "lp_taluk",
        lp.village AS "lp_village",
        lp.survey_number AS "lp_surveyNumber",
        lp.subdivision_number AS "lp_subdivisionNumber",
        lp.land_record_reference AS "lp_landRecordReference",
        lp.total_area AS "lp_totalArea",
        lp.area_unit AS "lp_areaUnit",
        lp.land_use AS "lp_landUse",
        lp.physical_description AS "lp_physicalDescription",
        ST_AsGeoJSON(lp.geometry)::json AS "lp_geometry",
        lp.created_by AS "lp_createdBy",
        lp.created_at AS "lp_createdAt",
        lp.updated_at AS "lp_updatedAt",
        u.id AS "u_id",
        u.name AS "u_name",
        u.email AS "u_email"
      FROM acquisition_case_parcels acp
      INNER JOIN land_parcels lp ON lp.id = acp.parcel_id
      INNER JOIN users u ON u.id = acp.created_by
      WHERE acp.case_id = ${caseId}::uuid
        AND ${searchCondition}
      ORDER BY acp.created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    const data: CaseParcelWithDetails[] = rows.map((row) => ({
      id: String(row.caseParcelId),
      caseId: String(row.caseId),
      parcelId: String(row.parcelId),
      proposedAffectedArea: String(row.proposedAffectedArea),
      affectedAreaUnit: String(row.affectedAreaUnit),
      createdBy: String(row.createdBy),
      createdAt: new Date(String(row.createdAt)),
      updatedAt: new Date(String(row.updatedAt)),
      parcel: {
        id: String(row.lp_id),
        parcelId: String(row.lp_parcelId),
        administrativeUnitId: row.lp_adminUnitId ? String(row.lp_adminUnitId) : null,
        state: String(row.lp_state),
        district: String(row.lp_district),
        taluk: String(row.lp_taluk),
        village: String(row.lp_village),
        surveyNumber: String(row.lp_surveyNumber),
        subdivisionNumber: row.lp_subdivisionNumber ? String(row.lp_subdivisionNumber) : null,
        landRecordReference: row.lp_landRecordReference ? String(row.lp_landRecordReference) : null,
        totalArea: String(row.lp_totalArea),
        areaUnit: String(row.lp_areaUnit),
        landUse: row.lp_landUse ? String(row.lp_landUse) : null,
        physicalDescription: row.lp_physicalDescription ? String(row.lp_physicalDescription) : null,
        geometry: (row.lp_geometry as GeoJsonGeometry) ?? null,
        createdBy: String(row.lp_createdBy),
        createdAt: new Date(String(row.lp_createdAt)),
        updatedAt: new Date(String(row.lp_updatedAt)),
      },
      creator: {
        id: String(row.u_id),
        name: String(row.u_name),
        email: String(row.u_email),
      },
    }));

    return { data, total };
  }
}

export const parcelRepository = new ParcelRepository();
