import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
  check,
  jsonb,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { acquisitionCases } from './acquisition-cases';
import { projects } from './projects';
import { implementingAgencies } from './implementing-agencies';
import { verifiedLandInventories } from './verified-land-inventories';
import { users } from './users';

/**
 * Valid lifecycle statuses for acquisition proposals.
 */
export const PROPOSAL_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const PROPOSAL_WORKFLOW_ACTIONS = [
  'CREATE_DRAFT',
  'UPDATE_DRAFT',
  'SUBMIT',
  'START_REVIEW',
  'APPROVE',
  'REJECT',
  'REQUEST_CORRECTIONS',
] as const;

export type ProposalWorkflowAction = (typeof PROPOSAL_WORKFLOW_ACTIONS)[number];

/**
 * Acquisition Proposal Header Entity.
 *
 * Requirements:
 * - One proposal per acquisition case enforced via database unique constraint.
 * - Created by authorized Implementing Agency user.
 * - References exact Ministry-approved inventory version.
 * - Stores current version reference and permanent proposal identity.
 */
export const acquisitionProposals = pgTable(
  'acquisition_proposals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    proposalNumber: varchar('proposal_number', { length: 50 }).notNull(),
    acquisitionCaseId: uuid('acquisition_case_id')
      .notNull()
      .references(() => acquisitionCases.id, { onDelete: 'restrict' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    implementingAgencyId: uuid('implementing_agency_id')
      .notNull()
      .references(() => implementingAgencies.id, { onDelete: 'restrict' }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    linkedInventoryId: uuid('linked_inventory_id')
      .notNull()
      .references(() => verifiedLandInventories.id, { onDelete: 'restrict' }),
    linkedInventoryVersionId: uuid('linked_inventory_version_id')
      .notNull()
      .references(() => verifiedLandInventories.id, { onDelete: 'restrict' }),
    currentVersionId: uuid('current_version_id').references(
      (): AnyPgColumn => acquisitionProposalVersions.id,
      { onDelete: 'set null' }
    ),
    currentVersionNumber: integer('current_version_number').default(1).notNull(),
    currentStatus: varchar('current_status', { length: 50 }).default('DRAFT').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('acquisition_proposals_case_id_idx').on(table.acquisitionCaseId),
    uniqueIndex('acquisition_proposals_number_idx').on(table.proposalNumber),
    index('acquisition_proposals_project_id_idx').on(table.projectId),
    index('acquisition_proposals_agency_id_idx').on(table.implementingAgencyId),
    index('acquisition_proposals_created_by_idx').on(table.createdBy),
    index('acquisition_proposals_linked_inv_id_idx').on(table.linkedInventoryId),
    index('acquisition_proposals_linked_inv_ver_idx').on(table.linkedInventoryVersionId),
    index('acquisition_proposals_status_idx').on(table.currentStatus),
    check(
      'acquisition_proposals_status_check',
      sql`${table.currentStatus} IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED')`
    ),
    check(
      'acquisition_proposals_version_num_check',
      sql`${table.currentVersionNumber} >= 1`
    ),
  ]
);

/**
 * Supporting document attachment shape stored in JSONB.
 */
export interface ProposalSupportingDocument {
  id?: string;
  documentType: string;
  documentNumber?: string;
  title: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  uploadedAt?: string;
}

/**
 * Acquisition Proposal Version Entity.
 *
 * Requirements:
 * - Stores editable proposal content in the version record.
 * - Version 1 created upon proposal creation.
 * - Substantive justification, legal framework, land requirement, admin approvals.
 */
export const acquisitionProposalVersions = pgTable(
  'acquisition_proposal_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => acquisitionProposals.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').default(1).notNull(),
    status: varchar('status', { length: 50 }).default('DRAFT').notNull(),
    acquisitionJustification: text('acquisition_justification').notNull(),
    publicPurpose: text('public_purpose').notNull(),
    legalFramework: varchar('legal_framework', { length: 255 }).notNull(),
    landRequirementExplanation: text('land_requirement_explanation').notNull(),
    administrativeApprovalRef: varchar('administrative_approval_ref', { length: 255 }),
    administrativeApprovalDate: timestamp('administrative_approval_date', {
      withTimezone: true,
    }),
    additionalDetails: jsonb('additional_details').$type<Record<string, unknown>>(),
    supportingDocuments: jsonb('supporting_documents').$type<
      ProposalSupportingDocument[]
    >(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('acquisition_proposal_versions_proposal_ver_idx').on(
      table.proposalId,
      table.versionNumber
    ),
    index('acquisition_proposal_versions_proposal_id_idx').on(table.proposalId),
    index('acquisition_proposal_versions_created_by_idx').on(table.createdBy),
    check(
      'acquisition_proposal_versions_num_check',
      sql`${table.versionNumber} >= 1`
    ),
    check(
      'acquisition_proposal_versions_status_check',
      sql`${table.status} IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED')`
    ),
  ]
);

/**
 * Historical audit log for acquisition proposal workflow decisions and transitions.
 */
export const acquisitionProposalWorkflowHistory = pgTable(
  'acquisition_proposal_workflow_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => acquisitionProposals.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    action: varchar('action', { length: 50 }).notNull(),
    fromStatus: varchar('from_status', { length: 50 }),
    toStatus: varchar('to_status', { length: 50 }).notNull(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    remarks: text('remarks'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('acq_prop_wf_history_proposal_id_idx').on(table.proposalId),
    index('acq_prop_wf_history_actor_id_idx').on(table.actorId),
    index('acq_prop_wf_history_created_at_idx').on(table.createdAt),
    check(
      'acq_prop_wf_history_action_check',
      sql`${table.action} IN ('CREATE_DRAFT', 'UPDATE_DRAFT')`
    ),
  ]
);

export const acquisitionProposalsRelations = relations(
  acquisitionProposals,
  ({ one, many }) => ({
    acquisitionCase: one(acquisitionCases, {
      fields: [acquisitionProposals.acquisitionCaseId],
      references: [acquisitionCases.id],
    }),
    project: one(projects, {
      fields: [acquisitionProposals.projectId],
      references: [projects.id],
    }),
    implementingAgency: one(implementingAgencies, {
      fields: [acquisitionProposals.implementingAgencyId],
      references: [implementingAgencies.id],
    }),
    creator: one(users, {
      fields: [acquisitionProposals.createdBy],
      references: [users.id],
      relationName: 'proposalCreator',
    }),
    linkedInventory: one(verifiedLandInventories, {
      fields: [acquisitionProposals.linkedInventoryId],
      references: [verifiedLandInventories.id],
      relationName: 'linkedProposalInventory',
    }),
    linkedInventoryVersion: one(verifiedLandInventories, {
      fields: [acquisitionProposals.linkedInventoryVersionId],
      references: [verifiedLandInventories.id],
      relationName: 'linkedProposalInventoryVersion',
    }),
    currentVersion: one(acquisitionProposalVersions, {
      fields: [acquisitionProposals.currentVersionId],
      references: [acquisitionProposalVersions.id],
      relationName: 'currentProposalVersion',
    }),
    versions: many(acquisitionProposalVersions, {
      relationName: 'proposalVersions',
    }),
    workflowHistory: many(acquisitionProposalWorkflowHistory),
  })
);

export const acquisitionProposalVersionsRelations = relations(
  acquisitionProposalVersions,
  ({ one }) => ({
    proposal: one(acquisitionProposals, {
      fields: [acquisitionProposalVersions.proposalId],
      references: [acquisitionProposals.id],
      relationName: 'proposalVersions',
    }),
    creator: one(users, {
      fields: [acquisitionProposalVersions.createdBy],
      references: [users.id],
    }),
  })
);

export const acquisitionProposalWorkflowHistoryRelations = relations(
  acquisitionProposalWorkflowHistory,
  ({ one }) => ({
    proposal: one(acquisitionProposals, {
      fields: [acquisitionProposalWorkflowHistory.proposalId],
      references: [acquisitionProposals.id],
    }),
    actor: one(users, {
      fields: [acquisitionProposalWorkflowHistory.actorId],
      references: [users.id],
    }),
  })
);

export type AcquisitionProposal = typeof acquisitionProposals.$inferSelect;
export type NewAcquisitionProposal = typeof acquisitionProposals.$inferInsert;
export type AcquisitionProposalVersion = typeof acquisitionProposalVersions.$inferSelect;
export type NewAcquisitionProposalVersion = typeof acquisitionProposalVersions.$inferInsert;
export type AcquisitionProposalWorkflowHistory =
  typeof acquisitionProposalWorkflowHistory.$inferSelect;
export type NewAcquisitionProposalWorkflowHistory =
  typeof acquisitionProposalWorkflowHistory.$inferInsert;
