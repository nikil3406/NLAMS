import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  timestamp,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { acquisitionCaseParcels } from './acquisition-case-parcels';
import { users } from './users';

/**
 * Report outcome decisions produced during field verification inspection.
 */
export const FIELD_VERIFICATION_REPORT_OUTCOMES = [
  'VERIFIED',
  'DISCREPANCY_FOUND',
  'INCONCLUSIVE',
] as const;

export type FieldVerificationReportOutcome =
  (typeof FIELD_VERIFICATION_REPORT_OUTCOMES)[number];

/**
 * Lifecycle statuses for a field verification report.
 */
export const FIELD_VERIFICATION_REPORT_STATUSES = [
  'DRAFT',
  'SUBMITTED',
] as const;

export type FieldVerificationReportStatus =
  (typeof FIELD_VERIFICATION_REPORT_STATUSES)[number];

/**
 * Field verification report persistence entity.
 *
 * Requirements:
 * - Links to an acquisition_case_parcels association.
 * - Supports multiple inspection reports over time (inspections, corrections, and resubmissions)
 *   without overwriting previous history.
 * - Stores field-measured affected area separately from official recorded area and proposed affected area.
 * - Preserves verifier identity, inspection date, observations, and measurement notes.
 */
export const fieldVerificationReports = pgTable(
  'field_verification_reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    caseParcelId: uuid('case_parcel_id')
      .notNull()
      .references(() => acquisitionCaseParcels.id, { onDelete: 'cascade' }),
    verifiedBy: uuid('verified_by')
      .references(() => users.id, { onDelete: 'restrict' }),
    verificationDate: timestamp('verification_date', { withTimezone: true }),
    outcome: varchar('outcome', { length: 50 }),
    observations: text('observations'),
    measuredArea: numeric('measured_area', { precision: 18, scale: 4 }),
    measuredAreaUnit: varchar('measured_area_unit', { length: 50 }),
    measurementMethod: varchar('measurement_method', { length: 100 }),
    measurementNotes: text('measurement_notes'),
    status: varchar('status', { length: 50 }).default('DRAFT').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('field_verif_reports_case_parcel_id_idx').on(table.caseParcelId),
    index('field_verif_reports_verified_by_idx').on(table.verifiedBy),
    index('field_verif_reports_status_idx').on(table.status),
    index('field_verif_reports_outcome_idx').on(table.outcome),
    index('field_verif_reports_created_at_idx').on(table.createdAt),
    check(
      'field_verif_reports_measured_area_check',
      sql`${table.measuredArea} IS NULL OR ${table.measuredArea} > 0`
    ),
    check(
      'field_verif_reports_measured_area_unit_check',
      sql`${table.measuredAreaUnit} IS NULL OR ${table.measuredAreaUnit} IN ('SQ_M', 'HECTARE', 'ACRE', 'SQ_KM')`
    ),
    check(
      'field_verif_reports_outcome_check',
      sql`${table.outcome} IS NULL OR ${table.outcome} IN ('VERIFIED', 'DISCREPANCY_FOUND', 'INCONCLUSIVE')`
    ),
    check(
      'field_verif_reports_status_check',
      sql`${table.status} IN ('DRAFT', 'SUBMITTED')`
    ),
  ]
);

import { fieldVerificationEvidence } from './field-verification-evidence';

export const fieldVerificationReportsRelations = relations(
  fieldVerificationReports,
  ({ one, many }) => ({
    caseParcel: one(acquisitionCaseParcels, {
      fields: [fieldVerificationReports.caseParcelId],
      references: [acquisitionCaseParcels.id],
    }),
    verifier: one(users, {
      fields: [fieldVerificationReports.verifiedBy],
      references: [users.id],
      relationName: 'reportVerifier',
    }),
    creator: one(users, {
      fields: [fieldVerificationReports.createdBy],
      references: [users.id],
      relationName: 'reportCreator',
    }),
    evidence: many(fieldVerificationEvidence),
  })
);

export type FieldVerificationReport = typeof fieldVerificationReports.$inferSelect;
export type NewFieldVerificationReport = typeof fieldVerificationReports.$inferInsert;
