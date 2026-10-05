import { pgTable, uuid, date, boolean, timestamp, index, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { administrativeUnits } from './administrative-units';

export const assignmentStatusEnum = pgEnum('assignment_status', ['ACTIVE', 'INACTIVE']);

export const userAssignments = pgTable(
  'user_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    administrativeUnitId: uuid('administrative_unit_id')
      .notNull()
      .references(() => administrativeUnits.id, { onDelete: 'restrict' }),
    assignedBy: uuid('assigned_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    status: assignmentStatusEnum('status').default('ACTIVE').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('user_assignments_user_id_idx').on(table.userId),
    index('user_assignments_admin_unit_id_idx').on(table.administrativeUnitId),
    index('user_assignments_status_idx').on(table.status),
  ]
);

export const userAssignmentsRelations = relations(userAssignments, ({ one }) => ({
  user: one(users, {
    fields: [userAssignments.userId],
    references: [users.id],
    relationName: 'userAssignmentsUser',
  }),
  administrativeUnit: one(administrativeUnits, {
    fields: [userAssignments.administrativeUnitId],
    references: [administrativeUnits.id],
  }),
  assignedByUser: one(users, {
    fields: [userAssignments.assignedBy],
    references: [users.id],
    relationName: 'userAssignmentsAssignedBy',
  }),
}));

export type UserAssignment = typeof userAssignments.$inferSelect;
export type NewUserAssignment = typeof userAssignments.$inferInsert;
