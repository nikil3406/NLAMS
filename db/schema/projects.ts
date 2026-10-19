import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  numeric,
  date,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { implementingAgencies } from './implementing-agencies';
import { administrativeUnits } from './administrative-units';
import { users } from './users';

export const PROJECT_TYPES = [
  'Highway',
  'Railway',
  'Metro',
  'Irrigation',
  'Water Supply',
  'Energy',
  'Public Infrastructure',
  'Other',
] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_STATUSES = [
  'DRAFT',
  'REGISTERED',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectCode: varchar('project_code', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    projectType: varchar('project_type', { length: 50 }).notNull(),
    implementingAgencyId: uuid('implementing_agency_id')
      .notNull()
      .references(() => implementingAgencies.id, { onDelete: 'restrict' }),
    administrativeUnitId: uuid('administrative_unit_id')
      .notNull()
      .references(() => administrativeUnits.id, { onDelete: 'restrict' }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    landAcquisitionRequired: boolean('land_acquisition_required')
      .default(true)
      .notNull(),
    estimatedCost: numeric('estimated_cost', { precision: 18, scale: 2 }),
    plannedStartDate: date('planned_start_date'),
    plannedEndDate: date('planned_end_date'),
    status: varchar('status', { length: 50 }).default('DRAFT').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('projects_project_code_idx').on(table.projectCode),
    index('projects_agency_id_idx').on(table.implementingAgencyId),
    index('projects_admin_unit_id_idx').on(table.administrativeUnitId),
    index('projects_status_idx').on(table.status),
    index('projects_type_idx').on(table.projectType),
    index('projects_created_by_idx').on(table.createdBy),
  ]
);

export const projectsRelations = relations(projects, ({ one }) => ({
  implementingAgency: one(implementingAgencies, {
    fields: [projects.implementingAgencyId],
    references: [implementingAgencies.id],
  }),
  administrativeUnit: one(administrativeUnits, {
    fields: [projects.administrativeUnitId],
    references: [administrativeUnits.id],
  }),
  creator: one(users, {
    fields: [projects.createdBy],
    references: [users.id],
  }),
}));

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
