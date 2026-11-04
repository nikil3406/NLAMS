import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { acquisitionCases } from './acquisition-cases';
import { acquisitionCaseParcels } from './acquisition-case-parcels';
import { fieldVerificationReports } from './field-verification-reports';
import { fieldVerificationReportReviews } from './field-verification-report-reviews';
import { users } from './users';
import { discrepancyInvestigations } from './discrepancy-investigations';
import { discrepancyResolutionHistory } from './discrepancy-resolution-history';

export const PARCEL_DISCREPANCY_CATEGORIES = [
  'SURVEY_IDENTITY_MISMATCH',
  'AREA_MISMATCH',
  'BOUNDARY_MISMATCH',
  'LAND_USE_MISMATCH',
  'LAND_RECORD_MISMATCH',
  'OWNERSHIP_RECORD_CONFLICT',
  'OTHER',
] as const;

export type ParcelDiscrepancyCategory =
  (typeof PARCEL_DISCREPANCY_CATEGORIES)[number];

export const PARCEL_DISCREPANCY_STATUSES = [
  'OPEN',
  'UNDER_INVESTIGATION',
  'SUBMITTED_FOR_RESOLUTION',
  'RESOLVED',
] as const;

export type ParcelDiscrepancyStatus =
  (typeof PARCEL_DISCREPANCY_STATUSES)[number];

/**
 * Formally tracked parcel discrepancy entity.
 *
 * Requirements:
 * - Represents a formally tracked discrepancy flagged during Land Officer report review.
 * - Links to the triggering acquisition case, acquisition-case parcel, field report, and review record.
 * - Categorizes and stores discrepancy description/reason.
 * - Source of truth for discrepancy investigation and resolution lifecycle.
 */
export const parcelDiscrepancies = pgTable(
  'parcel_discrepancies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => acquisitionCases.id, { onDelete: 'cascade' }),
    caseParcelId: uuid('case_parcel_id')
      .notNull()
      .references(() => acquisitionCaseParcels.id, { onDelete: 'cascade' }),
    reportId: uuid('report_id')
      .notNull()
      .references(() => fieldVerificationReports.id, { onDelete: 'cascade' }),
    reviewId: uuid('review_id')
      .references(() => fieldVerificationReportReviews.id, { onDelete: 'set null' }),
    category: varchar('category', { length: 50 }).default('OTHER').notNull(),
    description: text('description').notNull(),
    status: varchar('status', { length: 50 }).default('OPEN').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('parcel_discrepancies_case_id_idx').on(table.caseId),
    index('parcel_discrepancies_case_parcel_id_idx').on(table.caseParcelId),
    index('parcel_discrepancies_report_id_idx').on(table.reportId),
    index('parcel_discrepancies_status_idx').on(table.status),
    index('parcel_discrepancies_category_idx').on(table.category),
    check(
      'parcel_discrepancies_category_check',
      sql`${table.category} IN ('SURVEY_IDENTITY_MISMATCH', 'AREA_MISMATCH', 'BOUNDARY_MISMATCH', 'LAND_USE_MISMATCH', 'LAND_RECORD_MISMATCH', 'OWNERSHIP_RECORD_CONFLICT', 'OTHER')`
    ),
    check(
      'parcel_discrepancies_status_check',
      sql`${table.status} IN ('OPEN', 'UNDER_INVESTIGATION', 'SUBMITTED_FOR_RESOLUTION', 'RESOLVED')`
    ),
  ]
);

export const parcelDiscrepanciesRelations = relations(
  parcelDiscrepancies,
  ({ one, many }) => ({
    case: one(acquisitionCases, {
      fields: [parcelDiscrepancies.caseId],
      references: [acquisitionCases.id],
    }),
    caseParcel: one(acquisitionCaseParcels, {
      fields: [parcelDiscrepancies.caseParcelId],
      references: [acquisitionCaseParcels.id],
    }),
    report: one(fieldVerificationReports, {
      fields: [parcelDiscrepancies.reportId],
      references: [fieldVerificationReports.id],
    }),
    review: one(fieldVerificationReportReviews, {
      fields: [parcelDiscrepancies.reviewId],
      references: [fieldVerificationReportReviews.id],
    }),
    creator: one(users, {
      fields: [parcelDiscrepancies.createdBy],
      references: [users.id],
      relationName: 'discrepancyCreator',
    }),
    investigations: many(discrepancyInvestigations),
    resolutionHistory: many(discrepancyResolutionHistory),
  })
);

export type ParcelDiscrepancy = typeof parcelDiscrepancies.$inferSelect;
export type NewParcelDiscrepancy = typeof parcelDiscrepancies.$inferInsert;

