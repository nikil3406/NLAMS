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
import { parcelDiscrepancies } from './parcel-discrepancies';
import { users } from './users';
import { fieldVerificationEvidence } from './field-verification-evidence';
import { discrepancyResolutionHistory } from './discrepancy-resolution-history';

export const DISCREPANCY_INVESTIGATION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
] as const;

export type DiscrepancyInvestigationStatus =
  (typeof DISCREPANCY_INVESTIGATION_STATUSES)[number];

/**
 * Stores discrepancy investigation activities, findings, notes, and progress.
 *
 * Requirements:
 * - Tracks assigned investigator.
 * - Stores findings, notes, and status (DRAFT -> SUBMITTED).
 * - Supports attaching evidence via existing evidence infrastructure.
 * - Preserves multiple investigation iterations without overwriting.
 */
export const discrepancyInvestigations = pgTable(
  'discrepancy_investigations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    discrepancyId: uuid('discrepancy_id')
      .notNull()
      .references(() => parcelDiscrepancies.id, { onDelete: 'cascade' }),
    investigatorId: uuid('investigator_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    findings: text('findings'),
    notes: text('notes'),
    status: varchar('status', { length: 50 }).default('DRAFT').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('discrepancy_investigations_discrepancy_id_idx').on(table.discrepancyId),
    index('discrepancy_investigations_investigator_id_idx').on(table.investigatorId),
    index('discrepancy_investigations_status_idx').on(table.status),
    check(
      'discrepancy_investigations_status_check',
      sql`${table.status} IN ('DRAFT', 'SUBMITTED')`
    ),
  ]
);

export const discrepancyInvestigationsRelations = relations(
  discrepancyInvestigations,
  ({ one, many }) => ({
    discrepancy: one(parcelDiscrepancies, {
      fields: [discrepancyInvestigations.discrepancyId],
      references: [parcelDiscrepancies.id],
    }),
    investigator: one(users, {
      fields: [discrepancyInvestigations.investigatorId],
      references: [users.id],
      relationName: 'investigatorUser',
    }),
    creator: one(users, {
      fields: [discrepancyInvestigations.createdBy],
      references: [users.id],
      relationName: 'investigationCreator',
    }),
    evidence: many(fieldVerificationEvidence),
    resolutions: many(discrepancyResolutionHistory),
  })
);

export type DiscrepancyInvestigation =
  typeof discrepancyInvestigations.$inferSelect;
export type NewDiscrepancyInvestigation =
  typeof discrepancyInvestigations.$inferInsert;

