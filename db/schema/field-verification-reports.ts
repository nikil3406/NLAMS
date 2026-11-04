import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  integer,
  timestamp,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { acquisitionCaseParcels } from './acquisition-case-parcels';
import { users } from './users';
import { fieldVerificationEvidence } from './field-verification-evidence';
import { fieldVerificationReportReviews } from './field-verification-report-reviews';

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
 * Lifecycle and review statuses for a field verification report.
 */
export const FIELD_VERIFICATION_REPORT_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'ACCEPTED',
  'RETURNED_FOR_CORRECTION',
  'DISCREPANCY_FLAGGED',
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
 * - Records Land Officer review workflow decisions (ACCEPTED, RETURNED_FOR_CORRECTION, DISCREPANCY_FLAGGED).
 * - Tracks revisions and resubmissions via revisionNumber and previousReportId.
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
    reviewedBy: uuid('reviewed_by')
      .references(() => users.id, { onDelete: 'restrict' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewDecision: varchar('review_decision', { length: 50 }),
    reviewRemarks: text('review_remarks'),
    previousReportId: uuid('previous_report_id')
      .references((): any => fieldVerificationReports.id, { onDelete: 'set null' }),
    revisionNumber: integer('revision_number').default(1).notNull(),
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
    index('field_verif_reports_reviewed_by_idx').on(table.reviewedBy),
    index('field_verif_reports_prev_report_id_idx').on(table.previousReportId),
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
      sql`${table.status} IN ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'RETURNED_FOR_CORRECTION', 'DISCREPANCY_FLAGGED')`
    ),
  ]
);

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
    reviewer: one(users, {
      fields: [fieldVerificationReports.reviewedBy],
      references: [users.id],
      relationName: 'reportReviewer',
    }),
    previousReport: one(fieldVerificationReports, {
      fields: [fieldVerificationReports.previousReportId],
      references: [fieldVerificationReports.id],
      relationName: 'reportRevisions',
    }),
    evidence: many(fieldVerificationEvidence),
    reviews: many(fieldVerificationReportReviews),
  })
);

export type FieldVerificationReport = typeof fieldVerificationReports.$inferSelect;
export type NewFieldVerificationReport = typeof fieldVerificationReports.$inferInsert;
