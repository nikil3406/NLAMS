import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { userAssignments } from './user-assignments';

/**
 * Administrative Unit Type
 *
 * Stored as a varchar rather than a fixed PostgreSQL enum so that new levels
 * can be added in the future (e.g. SUB_DISTRICT, VILLAGE) without a DDL ALTER
 * on the enum type and without application-wide changes.
 *
 * Expected values in Phase 1:
 *   CENTRAL    – Central Government
 *   STATE      – State-level unit
 *   DISTRICT   – District-level unit
 *   TALUK      – Sub-district / Taluk-level unit
 *
 * ADR-002 documents this decision.
 */
export const ADMIN_UNIT_TYPES = [
  'CENTRAL',
  'STATE',
  'DISTRICT',
  'TALUK',
] as const;

export type AdminUnitType = (typeof ADMIN_UNIT_TYPES)[number];

export const administrativeUnits = pgTable(
  'administrative_units',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    code: varchar('code', { length: 50 }).notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    parentId: uuid('parent_id'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('admin_units_code_idx').on(table.code),
    index('admin_units_parent_id_idx').on(table.parentId),
    index('admin_units_type_idx').on(table.type),
  ]
);

export const administrativeUnitsRelations = relations(
  administrativeUnits,
  ({ one, many }) => ({
    parent: one(administrativeUnits, {
      fields: [administrativeUnits.parentId],
      references: [administrativeUnits.id],
      relationName: 'adminUnitHierarchy',
    }),
    children: many(administrativeUnits, {
      relationName: 'adminUnitHierarchy',
    }),
    userAssignments: many(userAssignments),
  })
);

// Note: The self-referencing FK for parent_id is enforced at the database level
// via the migration SQL (see db/migrations/0000_silky_screwball.sql).
// Drizzle's Zod-style schema builder cannot express circular self-references
// at definition time, so it is omitted from the schema object and handled in SQL.

export type AdministrativeUnit = typeof administrativeUnits.$inferSelect;
export type NewAdministrativeUnit = typeof administrativeUnits.$inferInsert;
