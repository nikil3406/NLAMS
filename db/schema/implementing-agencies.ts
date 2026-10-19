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
import { administrativeUnits } from './administrative-units';

export const AGENCY_TYPES = [
  'CENTRAL_MINISTRY',
  'CENTRAL_PSU',
  'STATUTORY_AUTHORITY',
  'STATE_DEPARTMENT',
  'STATE_PSU',
  'OTHER',
] as const;

export type AgencyType = (typeof AGENCY_TYPES)[number];

export const AGENCY_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type AgencyStatus = (typeof AGENCY_STATUSES)[number];

export const implementingAgencies = pgTable(
  'implementing_agencies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    normalizedName: varchar('normalized_name', { length: 255 }).notNull(),
    agencyType: varchar('agency_type', { length: 50 }).notNull(),
    parentAgencyId: uuid('parent_agency_id'),
    administrativeUnitId: uuid('administrative_unit_id').references(
      () => administrativeUnits.id,
      { onDelete: 'restrict' }
    ),
    officialWebsite: text('official_website'),
    status: varchar('status', { length: 20 }).default('ACTIVE').notNull(),
    sourceUrl: text('source_url').notNull(),
    sourceVerifiedAt: timestamp('source_verified_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('implementing_agencies_code_idx').on(table.code),
    index('implementing_agencies_name_idx').on(table.name),
    index('implementing_agencies_status_idx').on(table.status),
    index('implementing_agencies_parent_id_idx').on(table.parentAgencyId),
    index('implementing_agencies_admin_unit_id_idx').on(table.administrativeUnitId),
  ]
);

export const implementingAgenciesRelations = relations(
  implementingAgencies,
  ({ one, many }) => ({
    parentAgency: one(implementingAgencies, {
      fields: [implementingAgencies.parentAgencyId],
      references: [implementingAgencies.id],
      relationName: 'agencyHierarchy',
    }),
    childAgencies: many(implementingAgencies, {
      relationName: 'agencyHierarchy',
    }),
    administrativeUnit: one(administrativeUnits, {
      fields: [implementingAgencies.administrativeUnitId],
      references: [administrativeUnits.id],
    }),
  })
);

export type ImplementingAgency = typeof implementingAgencies.$inferSelect;
export type NewImplementingAgency = typeof implementingAgencies.$inferInsert;
