import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { projects } from './projects';
import { users } from './users';

export const ACQUISITION_CASE_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'AWAITING_FIELD_VERIFICATION',
  'RETURNED_FOR_CORRECTION',
  'REJECTED',
] as const;

export type AcquisitionCaseStatus = (typeof ACQUISITION_CASE_STATUSES)[number];

export const acquisitionCases = pgTable(
  'acquisition_cases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    caseReference: varchar('case_reference', { length: 50 }).notNull(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 50 }).default('DRAFT').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    updatedBy: uuid('updated_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    submissionRemarks: text('submission_remarks'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('acquisition_cases_case_reference_idx').on(table.caseReference),
    index('acquisition_cases_project_id_idx').on(table.projectId),
    index('acquisition_cases_status_idx').on(table.status),
    index('acquisition_cases_created_by_idx').on(table.createdBy),
    index('acquisition_cases_updated_by_idx').on(table.updatedBy),
  ]
);

export const acquisitionCaseWorkflowHistory = pgTable(
  'acquisition_case_workflow_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => acquisitionCases.id, { onDelete: 'cascade' }),
    caseReference: varchar('case_reference', { length: 50 }).notNull(),
    fromStatus: varchar('from_status', { length: 50 }),
    toStatus: varchar('to_status', { length: 50 }).notNull(),
    action: varchar('action', { length: 50 }).notNull(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    remarks: text('remarks'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('acq_case_workflow_history_case_id_idx').on(table.caseId),
    index('acq_case_workflow_history_case_ref_idx').on(table.caseReference),
    index('acq_case_workflow_history_actor_id_idx').on(table.actorId),
    index('acq_case_workflow_history_created_at_idx').on(table.createdAt),
  ]
);

export const acquisitionCasesRelations = relations(acquisitionCases, ({ one, many }) => ({
  project: one(projects, {
    fields: [acquisitionCases.projectId],
    references: [projects.id],
  }),
  creator: one(users, {
    fields: [acquisitionCases.createdBy],
    references: [users.id],
    relationName: 'caseCreator',
  }),
  updater: one(users, {
    fields: [acquisitionCases.updatedBy],
    references: [users.id],
    relationName: 'caseUpdater',
  }),
  workflowHistory: many(acquisitionCaseWorkflowHistory),
}));

export const acquisitionCaseWorkflowHistoryRelations = relations(
  acquisitionCaseWorkflowHistory,
  ({ one }) => ({
    case: one(acquisitionCases, {
      fields: [acquisitionCaseWorkflowHistory.caseId],
      references: [acquisitionCases.id],
    }),
    actor: one(users, {
      fields: [acquisitionCaseWorkflowHistory.actorId],
      references: [users.id],
    }),
  })
);

export type AcquisitionCase = typeof acquisitionCases.$inferSelect;
export type NewAcquisitionCase = typeof acquisitionCases.$inferInsert;
export type AcquisitionCaseWorkflowHistory = typeof acquisitionCaseWorkflowHistory.$inferSelect;
export type NewAcquisitionCaseWorkflowHistory = typeof acquisitionCaseWorkflowHistory.$inferInsert;
