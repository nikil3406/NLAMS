import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  integer,
  timestamp,
  index,
  uniqueIndex,
  customType,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { projects } from './projects';
import { users } from './users';

export const ESTIMATED_AREA_UNITS = [
  'SQ_M',
  'HECTARE',
  'ACRE',
  'SQ_KM',
] as const;

export type EstimatedAreaUnit = (typeof ESTIMATED_AREA_UNITS)[number];

/**
 * Custom PostGIS Geometry column for Drizzle ORM.
 * Supports SRID 4326 Polygon and MultiPolygon geometries.
 */
export const postgisGeometry = customType<{
  data: unknown;
  driverData: string;
}>({
  dataType() {
    return 'geometry(Geometry, 4326)';
  },
});

export const projectBoundaryVersions = pgTable(
  'project_boundary_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    geometry: postgisGeometry('geometry').notNull(),
    estimatedLandArea: numeric('estimated_land_area', { precision: 18, scale: 2 }).notNull(),
    estimatedAreaUnit: varchar('estimated_area_unit', { length: 50 }).notNull(),
    calculatedGeometryArea: numeric('calculated_geometry_area', { precision: 18, scale: 2 }).notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    changeReason: text('change_reason'),
  },
  (table) => [
    uniqueIndex('project_boundary_versions_project_version_idx').on(
      table.projectId,
      table.versionNumber
    ),
    index('project_boundary_versions_project_id_idx').on(table.projectId),
    index('project_boundary_versions_created_by_idx').on(table.createdBy),
  ]
);

export const projectBoundaryVersionsRelations = relations(
  projectBoundaryVersions,
  ({ one }) => ({
    project: one(projects, {
      fields: [projectBoundaryVersions.projectId],
      references: [projects.id],
    }),
    creator: one(users, {
      fields: [projectBoundaryVersions.createdBy],
      references: [users.id],
    }),
  })
);

export type ProjectBoundaryVersion = typeof projectBoundaryVersions.$inferSelect;
export type NewProjectBoundaryVersion = typeof projectBoundaryVersions.$inferInsert;
