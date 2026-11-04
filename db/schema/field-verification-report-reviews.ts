import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { fieldVerificationReports } from './field-verification-reports';
import { users } from './users';

export const FIELD_VERIFICATION_REVIEW_DECISIONS = [
  'ACCEPTED',
  'RETURNED_FOR_CORRECTION',
  'DISCREPANCY_FLAGGED',
] as const;

export type FieldVerificationReviewDecision =
  (typeof FIELD_VERIFICATION_REVIEW_DECISIONS)[number];

/**
 * Auditable workflow review history for field verification reports.
 *
 * Requirements:
 * - Records every formal Land Officer review decision.
 * - Stores authenticated reviewer identity, timestamp, decision, and remarks/reason.
 * - Enforces separation of duties and auditable decision history.
 */
export const fieldVerificationReportReviews = pgTable(
  'field_verification_report_reviews',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => fieldVerificationReports.id, { onDelete: 'cascade' }),
    reviewerId: uuid('reviewer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    decision: varchar('decision', { length: 50 }).notNull(),
    fromStatus: varchar('from_status', { length: 50 }).notNull(),
    toStatus: varchar('to_status', { length: 50 }).notNull(),
    remarks: text('remarks'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('field_verif_reviews_report_id_idx').on(table.reportId),
    index('field_verif_reviews_reviewer_id_idx').on(table.reviewerId),
    index('field_verif_reviews_created_at_idx').on(table.createdAt),
  ]
);

export const fieldVerificationReportReviewsRelations = relations(
  fieldVerificationReportReviews,
  ({ one }) => ({
    report: one(fieldVerificationReports, {
      fields: [fieldVerificationReportReviews.reportId],
      references: [fieldVerificationReports.id],
    }),
    reviewer: one(users, {
      fields: [fieldVerificationReportReviews.reviewerId],
      references: [users.id],
      relationName: 'reportReviewAuditor',
    }),
  })
);

export type FieldVerificationReportReview =
  typeof fieldVerificationReportReviews.$inferSelect;
export type NewFieldVerificationReportReview =
  typeof fieldVerificationReportReviews.$inferInsert;

