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
import { discrepancyInvestigations } from './discrepancy-investigations';
import { users } from './users';

export const DISCREPANCY_RESOLUTION_DECISIONS = [
  'RESOLVED',
  'RETURNED_FOR_FURTHER_INVESTIGATION',
] as const;

export type DiscrepancyResolutionDecision =
  (typeof DISCREPANCY_RESOLUTION_DECISIONS)[number];

/**
 * Stores discrepancy resolution decisions as immutable historical records.
 *
 * Requirements:
 * - Records resolution decision (RESOLVED or RETURNED_FOR_FURTHER_INVESTIGATION).
 * - Stores decision remarks/reason, decision-maker, and timestamp.
 * - Enforces separation of duties (decision-maker != investigator).
 */
export const discrepancyResolutionHistory = pgTable(
  'discrepancy_resolution_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    discrepancyId: uuid('discrepancy_id')
      .notNull()
      .references(() => parcelDiscrepancies.id, { onDelete: 'cascade' }),
    investigationId: uuid('investigation_id')
      .references(() => discrepancyInvestigations.id, { onDelete: 'cascade' }),
    decision: varchar('decision', { length: 50 }).notNull(),
    remarks: text('remarks').notNull(),
    resolvedBy: uuid('resolved_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('discrepancy_resolution_history_discrepancy_id_idx').on(table.discrepancyId),
    index('discrepancy_resolution_history_investigation_id_idx').on(table.investigationId),
    index('discrepancy_resolution_history_resolved_by_idx').on(table.resolvedBy),
    index('discrepancy_resolution_history_created_at_idx').on(table.createdAt),
    check(
      'discrepancy_resolution_decision_check',
      sql`${table.decision} IN ('RESOLVED', 'RETURNED_FOR_FURTHER_INVESTIGATION')`
    ),
  ]
);

export const discrepancyResolutionHistoryRelations = relations(
  discrepancyResolutionHistory,
  ({ one }) => ({
    discrepancy: one(parcelDiscrepancies, {
      fields: [discrepancyResolutionHistory.discrepancyId],
      references: [parcelDiscrepancies.id],
    }),
    investigation: one(discrepancyInvestigations, {
      fields: [discrepancyResolutionHistory.investigationId],
      references: [discrepancyInvestigations.id],
    }),
    resolver: one(users, {
      fields: [discrepancyResolutionHistory.resolvedBy],
      references: [users.id],
      relationName: 'discrepancyResolver',
    }),
  })
);

export type DiscrepancyResolutionHistory =
  typeof discrepancyResolutionHistory.$inferSelect;
export type NewDiscrepancyResolutionHistory =
  typeof discrepancyResolutionHistory.$inferInsert;

