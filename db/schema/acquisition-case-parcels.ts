import {
  pgTable,
  uuid,
  varchar,
  numeric,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { acquisitionCases } from './acquisition-cases';
import { landParcels } from './land-parcels';
import { users } from './users';
import { fieldVerificationReports } from './field-verification-reports';

/**
 * Junction entity linking a canonical land parcel to an acquisition case.
 *
 * Requirements:
 * - One acquisition case can contain multiple parcels.
 * - One physical parcel can be associated with multiple acquisition cases over time without duplicating its identity.
 * - Keeps total recorded parcel area separate from proposed affected area.
 * - Prevents duplicate associations between the same parcel and case via unique composite index.
 */
export const acquisitionCaseParcels = pgTable(
  'acquisition_case_parcels',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => acquisitionCases.id, { onDelete: 'cascade' }),
    parcelId: uuid('parcel_id')
      .notNull()
      .references(() => landParcels.id, { onDelete: 'restrict' }),
    proposedAffectedArea: numeric('proposed_affected_area', { precision: 18, scale: 4 }).notNull(),
    affectedAreaUnit: varchar('affected_area_unit', { length: 50 }).notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('acq_case_parcels_case_parcel_idx').on(table.caseId, table.parcelId),
    index('acq_case_parcels_case_id_idx').on(table.caseId),
    index('acq_case_parcels_parcel_id_idx').on(table.parcelId),
    index('acq_case_parcels_created_by_idx').on(table.createdBy),
    check('acq_case_parcels_proposed_area_check', sql`${table.proposedAffectedArea} > 0`),
    check(
      'acq_case_parcels_affected_area_unit_check',
      sql`${table.affectedAreaUnit} IN ('SQ_M', 'HECTARE', 'ACRE', 'SQ_KM')`
    ),
  ]
);

export const acquisitionCaseParcelsRelations = relations(
  acquisitionCaseParcels,
  ({ one, many }) => ({
    case: one(acquisitionCases, {
      fields: [acquisitionCaseParcels.caseId],
      references: [acquisitionCases.id],
    }),
    parcel: one(landParcels, {
      fields: [acquisitionCaseParcels.parcelId],
      references: [landParcels.id],
    }),
    creator: one(users, {
      fields: [acquisitionCaseParcels.createdBy],
      references: [users.id],
    }),
    fieldVerificationReports: many(fieldVerificationReports),
  })
);

export type AcquisitionCaseParcel = typeof acquisitionCaseParcels.$inferSelect;
export type NewAcquisitionCaseParcel = typeof acquisitionCaseParcels.$inferInsert;
