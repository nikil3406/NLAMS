import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { administrativeUnits } from './administrative-units';
import { users } from './users';
import { postgisGeometry } from './project-boundary-versions';
import { acquisitionCaseParcels } from './acquisition-case-parcels';

/**
 * Standard area measurement units supported across land parcels.
 * Consistent with project boundary estimation conventions.
 */
export const PARCEL_AREA_UNITS = [
  'SQ_M',
  'HECTARE',
  'ACRE',
  'SQ_KM',
] as const;

export type ParcelAreaUnit = (typeof PARCEL_AREA_UNITS)[number];

/**
 * Canonical physical parcel table.
 *
 * Stores the legal identity, administrative locality, official survey details,
 * and recorded area of an individual physical land parcel.
 *
 * Requirements:
 * - Survey number is not assumed globally unique; locality-aware composite index handles deduplication.
 * - Official recorded area is preserved distinctly from proposed affected or field-measured areas.
 * - Optional geometry column provides PostGIS spatial reference without claiming authoritative legal boundary.
 */
export const landParcels = pgTable(
  'land_parcels',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    parcelId: varchar('parcel_id', { length: 50 }).notNull(),
    administrativeUnitId: uuid('administrative_unit_id')
      .references(() => administrativeUnits.id, { onDelete: 'restrict' }),
    state: varchar('state', { length: 100 }).notNull(),
    district: varchar('district', { length: 100 }).notNull(),
    taluk: varchar('taluk', { length: 100 }).notNull(),
    village: varchar('village', { length: 100 }).notNull(),
    surveyNumber: varchar('survey_number', { length: 100 }).notNull(),
    subdivisionNumber: varchar('subdivision_number', { length: 100 }),
    landRecordReference: varchar('land_record_reference', { length: 255 }),
    totalArea: numeric('total_area', { precision: 18, scale: 4 }).notNull(),
    areaUnit: varchar('area_unit', { length: 50 }).notNull(),
    landUse: varchar('land_use', { length: 100 }),
    physicalDescription: text('physical_description'),
    geometry: postgisGeometry('geometry'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('land_parcels_parcel_id_idx').on(table.parcelId),
    index('land_parcels_locality_survey_idx').on(
      table.state,
      table.district,
      table.taluk,
      table.village,
      table.surveyNumber,
      table.subdivisionNumber
    ),
    index('land_parcels_village_survey_idx').on(table.village, table.surveyNumber),
    index('land_parcels_admin_unit_id_idx').on(table.administrativeUnitId),
    index('land_parcels_created_by_idx').on(table.createdBy),
    check('land_parcels_total_area_check', sql`${table.totalArea} > 0`),
    check(
      'land_parcels_area_unit_check',
      sql`${table.areaUnit} IN ('SQ_M', 'HECTARE', 'ACRE', 'SQ_KM')`
    ),
  ]
);

export const landParcelsRelations = relations(landParcels, ({ one, many }) => ({
  administrativeUnit: one(administrativeUnits, {
    fields: [landParcels.administrativeUnitId],
    references: [administrativeUnits.id],
  }),
  creator: one(users, {
    fields: [landParcels.createdBy],
    references: [users.id],
  }),
  caseParcels: many(acquisitionCaseParcels),
}));

export type LandParcel = typeof landParcels.$inferSelect;
export type NewLandParcel = typeof landParcels.$inferInsert;
