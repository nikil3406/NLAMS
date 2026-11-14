import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { administrativeUnits } from './administrative-units';
import { users } from './users';
import { acquisitionProposals, acquisitionProposalVersions } from './acquisition-proposals';

/**
 * Supported authority levels.
 */
export const AUTHORITY_LEVELS = [
  'DISTRICT',
  'REGIONAL',
  'STATE',
  'CENTRAL',
] as const;

export type AuthorityLevel = (typeof AUTHORITY_LEVELS)[number];

export const AUTHORITY_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type AuthorityStatus = (typeof AUTHORITY_STATUSES)[number];

export const PROPOSAL_AUTHORITY_ASSIGNMENT_STATUSES = [
  'ACTIVE',
  'SUPERSEDED',
] as const;
export type ProposalAuthorityAssignmentStatus =
  (typeof PROPOSAL_AUTHORITY_ASSIGNMENT_STATUSES)[number];

/**
 * Table 1: competent_authorities
 * Stores authorities eligible to scrutinize and decide acquisition proposals.
 */
export const competentAuthorities = pgTable(
  'competent_authorities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    authorityCode: varchar('authority_code', { length: 50 }).notNull(),
    authorityName: varchar('authority_name', { length: 255 }).notNull(),
    designation: varchar('designation', { length: 255 }).notNull(),
    authorityLevel: varchar('authority_level', { length: 50 }).notNull(),
    status: varchar('status', { length: 50 }).default('ACTIVE').notNull(),
    effectiveFrom: date('effective_from').notNull(),
    effectiveUntil: date('effective_until'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('competent_authorities_code_idx').on(table.authorityCode),
    index('competent_authorities_level_idx').on(table.authorityLevel),
    index('competent_authorities_status_idx').on(table.status),
    check(
      'competent_authorities_level_check',
      sql`${table.authorityLevel} IN ('DISTRICT', 'REGIONAL', 'STATE', 'CENTRAL')`
    ),
    check(
      'competent_authorities_status_check',
      sql`${table.status} IN ('ACTIVE', 'INACTIVE')`
    ),
  ]
);

/**
 * Table 2: authority_jurisdictions
 * Defines geographical areas covered by each Competent Authority.
 * Reuses existing administrativeUnits table for state, district, taluk, village hierarchy.
 */
export const authorityJurisdictions = pgTable(
  'authority_jurisdictions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    authorityId: uuid('authority_id')
      .notNull()
      .references(() => competentAuthorities.id, { onDelete: 'cascade' }),
    stateId: uuid('state_id')
      .notNull()
      .references(() => administrativeUnits.id, { onDelete: 'restrict' }),
    districtId: uuid('district_id')
      .references(() => administrativeUnits.id, { onDelete: 'restrict' }),
    talukId: uuid('taluk_id')
      .references(() => administrativeUnits.id, { onDelete: 'restrict' }),
    villageId: uuid('village_id')
      .references(() => administrativeUnits.id, { onDelete: 'restrict' }),
    effectiveFrom: date('effective_from').notNull(),
    effectiveUntil: date('effective_until'),
    status: varchar('status', { length: 50 }).default('ACTIVE').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('authority_jurisdictions_authority_id_idx').on(table.authorityId),
    index('authority_jurisdictions_state_id_idx').on(table.stateId),
    index('authority_jurisdictions_district_id_idx').on(table.districtId),
    index('authority_jurisdictions_taluk_id_idx').on(table.talukId),
    index('authority_jurisdictions_status_idx').on(table.status),
    check(
      'authority_jurisdictions_status_check',
      sql`${table.status} IN ('ACTIVE', 'INACTIVE')`
    ),
  ]
);

/**
 * Table 3: authority_user_assignments
 * Maps authorized system users to Competent Authority records.
 */
export const authorityUserAssignments = pgTable(
  'authority_user_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    authorityId: uuid('authority_id')
      .notNull()
      .references(() => competentAuthorities.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
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
    index('authority_user_assignments_authority_id_idx').on(table.authorityId),
    index('authority_user_assignments_user_id_idx').on(table.userId),
    index('authority_user_assignments_status_idx').on(table.status),
    check(
      'authority_user_assignments_status_check',
      sql`${table.status} IN ('ACTIVE', 'INACTIVE')`
    ),
  ]
);

/**
 * Table 4: proposal_authority_assignments
 * Stores the Competent Authority selected for an acquisition proposal and
 * preserves the selection associated with each proposal version.
 */
export const proposalAuthorityAssignments = pgTable(
  'proposal_authority_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => acquisitionProposals.id, { onDelete: 'cascade' }),
    proposalVersionId: uuid('proposal_version_id')
      .notNull()
      .references(() => acquisitionProposalVersions.id, { onDelete: 'cascade' }),
    authorityId: uuid('authority_id')
      .notNull()
      .references(() => competentAuthorities.id, { onDelete: 'restrict' }),
    assignedBy: uuid('assigned_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
    assignmentStatus: varchar('assignment_status', { length: 50 })
      .default('ACTIVE')
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('proposal_auth_assign_proposal_id_idx').on(table.proposalId),
    index('proposal_auth_assign_version_id_idx').on(table.proposalVersionId),
    index('proposal_auth_assign_authority_id_idx').on(table.authorityId),
    index('proposal_auth_assign_status_idx').on(table.assignmentStatus),
    check(
      'proposal_auth_assign_status_check',
      sql`${table.assignmentStatus} IN ('ACTIVE', 'SUPERSEDED')`
    ),
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// RELATIONS
// ─────────────────────────────────────────────────────────────────────────────

export const competentAuthoritiesRelations = relations(
  competentAuthorities,
  ({ many }) => ({
    jurisdictions: many(authorityJurisdictions),
    userAssignments: many(authorityUserAssignments),
    proposalAssignments: many(proposalAuthorityAssignments),
  })
);

export const authorityJurisdictionsRelations = relations(
  authorityJurisdictions,
  ({ one }) => ({
    authority: one(competentAuthorities, {
      fields: [authorityJurisdictions.authorityId],
      references: [competentAuthorities.id],
    }),
    state: one(administrativeUnits, {
      fields: [authorityJurisdictions.stateId],
      references: [administrativeUnits.id],
      relationName: 'jurisdictionState',
    }),
    district: one(administrativeUnits, {
      fields: [authorityJurisdictions.districtId],
      references: [administrativeUnits.id],
      relationName: 'jurisdictionDistrict',
    }),
    taluk: one(administrativeUnits, {
      fields: [authorityJurisdictions.talukId],
      references: [administrativeUnits.id],
      relationName: 'jurisdictionTaluk',
    }),
    village: one(administrativeUnits, {
      fields: [authorityJurisdictions.villageId],
      references: [administrativeUnits.id],
      relationName: 'jurisdictionVillage',
    }),
  })
);

export const authorityUserAssignmentsRelations = relations(
  authorityUserAssignments,
  ({ one }) => ({
    authority: one(competentAuthorities, {
      fields: [authorityUserAssignments.authorityId],
      references: [competentAuthorities.id],
    }),
    user: one(users, {
      fields: [authorityUserAssignments.userId],
      references: [users.id],
      relationName: 'authorityAssignedUser',
    }),
    assigner: one(users, {
      fields: [authorityUserAssignments.assignedBy],
      references: [users.id],
      relationName: 'authorityUserAssigner',
    }),
  })
);

export const proposalAuthorityAssignmentsRelations = relations(
  proposalAuthorityAssignments,
  ({ one }) => ({
    proposal: one(acquisitionProposals, {
      fields: [proposalAuthorityAssignments.proposalId],
      references: [acquisitionProposals.id],
    }),
    proposalVersion: one(acquisitionProposalVersions, {
      fields: [proposalAuthorityAssignments.proposalVersionId],
      references: [acquisitionProposalVersions.id],
    }),
    authority: one(competentAuthorities, {
      fields: [proposalAuthorityAssignments.authorityId],
      references: [competentAuthorities.id],
    }),
    assigner: one(users, {
      fields: [proposalAuthorityAssignments.assignedBy],
      references: [users.id],
    }),
  })
);

export type CompetentAuthority = typeof competentAuthorities.$inferSelect;
export type NewCompetentAuthority = typeof competentAuthorities.$inferInsert;

export type AuthorityJurisdiction = typeof authorityJurisdictions.$inferSelect;
export type NewAuthorityJurisdiction = typeof authorityJurisdictions.$inferInsert;

export type AuthorityUserAssignment = typeof authorityUserAssignments.$inferSelect;
export type NewAuthorityUserAssignment = typeof authorityUserAssignments.$inferInsert;

export type ProposalAuthorityAssignment =
  typeof proposalAuthorityAssignments.$inferSelect;
export type NewProposalAuthorityAssignment =
  typeof proposalAuthorityAssignments.$inferInsert;

