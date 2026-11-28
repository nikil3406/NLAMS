import {
  pgTable,
  uuid,
  varchar,
  date,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users';
import { implementingAgencies } from './implementing-agencies';

export const USER_AGENCY_ASSIGNMENT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type UserAgencyAssignmentStatus =
  (typeof USER_AGENCY_ASSIGNMENT_STATUSES)[number];

/**
 * Maps Project Officer users to Implementing Agencies while preserving
 * historical agency associations when reassigned or when the role is revoked.
 *
 * Enforces at most one ACTIVE Implementing Agency per user via a partial unique index.
 */
export const userImplementingAgencyAssignments = pgTable(
  'user_implementing_agency_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    implementingAgencyId: uuid('implementing_agency_id')
      .notNull()
      .references(() => implementingAgencies.id, { onDelete: 'restrict' }),
    assignedBy: uuid('assigned_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    effectiveFrom: date('effective_from').notNull(),
    effectiveUntil: date('effective_until'),
    status: varchar('status', { length: 50 }).default('ACTIVE').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('user_impl_agency_user_id_idx').on(table.userId),
    index('user_impl_agency_agency_id_idx').on(table.implementingAgencyId),
    index('user_impl_agency_status_idx').on(table.status),
    uniqueIndex('user_impl_agency_active_user_idx')
      .on(table.userId)
      .where(sql`${table.status} = 'ACTIVE'`),
    check(
      'user_impl_agency_status_check',
      sql`${table.status} IN ('ACTIVE', 'INACTIVE')`
    ),
  ]
);

export const userImplementingAgencyAssignmentsRelations = relations(
  userImplementingAgencyAssignments,
  ({ one }) => ({
    user: one(users, {
      fields: [userImplementingAgencyAssignments.userId],
      references: [users.id],
      relationName: 'userAgencyUser',
    }),
    implementingAgency: one(implementingAgencies, {
      fields: [userImplementingAgencyAssignments.implementingAgencyId],
      references: [implementingAgencies.id],
    }),
    assignedByUser: one(users, {
      fields: [userImplementingAgencyAssignments.assignedBy],
      references: [users.id],
      relationName: 'userAgencyAssignedBy',
    }),
  })
);

export type UserImplementingAgencyAssignment =
  typeof userImplementingAgencyAssignments.$inferSelect;
export type NewUserImplementingAgencyAssignment =
  typeof userImplementingAgencyAssignments.$inferInsert;
