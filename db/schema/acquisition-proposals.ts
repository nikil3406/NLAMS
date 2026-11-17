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
import { competentAuthorities } from './competent-authorities';

/**
 * Valid lifecycle statuses for acquisition proposals.
 */
export const PROPOSAL_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'CORRECTION_REQUESTED',
  'APPROVED',
  'REJECTED',
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const PROPOSAL_WORKFLOW_ACTIONS = [
  'CREATE_DRAFT',
  'UPDATE_DRAFT',
  'VALIDATE',
  'SUBMIT',
  'START_REVIEW',
  'REQUEST_CORRECTIONS',
  'CREATE_VERSION',
  'RESUBMIT',
  'APPROVE',
  'REJECT',
] as const;

export type ProposalWorkflowAction = (typeof PROPOSAL_WORKFLOW_ACTIONS)[number];

export const OBSERVATION_CATEGORIES = [
  'PROJECT_JUSTIFICATION',
  'LAND_REQUIREMENT',
  'LAND_RECORDS',
  'PARCEL_DETAILS',
  'DOCUMENTATION',
  'FINANCIAL_INFORMATION',
  'ADMINISTRATIVE_REQUIREMENTS',
  'LEGAL_REQUIREMENTS',
  'OTHER',
] as const;

export type ObservationCategory = (typeof OBSERVATION_CATEGORIES)[number];

export const SCRUTINY_DECISION_TYPES = [
  'APPROVED',
  'CORRECTION_REQUESTED',
  'REJECTED',
] as const;

export type ScrutinyDecisionType = (typeof SCRUTINY_DECISION_TYPES)[number];

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
      sql`${table.currentStatus} IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CORRECTION_REQUESTED', 'APPROVED', 'REJECTED')`
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
    submittedBy: uuid('submitted_by').references(() => users.id, {
      onDelete: 'restrict',
    }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    reviewedBy: uuid('reviewed_by').references(() => users.id, {
      onDelete: 'restrict',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewRemarks: text('review_remarks'),
    previousVersionId: uuid('previous_version_id').references(
      (): AnyPgColumn => acquisitionProposalVersions.id,
      { onDelete: 'set null' }
    ),
    selectedAuthorityId: uuid('selected_authority_id'),
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
    index('acquisition_proposal_versions_submitted_by_idx').on(table.submittedBy),
    index('acquisition_proposal_versions_reviewed_by_idx').on(table.reviewedBy),
    index('acquisition_proposal_versions_prev_ver_idx').on(table.previousVersionId),
    index('acquisition_proposal_versions_sel_auth_idx').on(table.selectedAuthorityId),
    check(
      'acquisition_proposal_versions_num_check',
      sql`${table.versionNumber} >= 1`
    ),
    check(
      'acquisition_proposal_versions_status_check',
      sql`${table.status} IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CORRECTION_REQUESTED', 'APPROVED', 'REJECTED')`
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
      sql`${table.action} IN ('CREATE_DRAFT', 'UPDATE_DRAFT', 'VALIDATE', 'SUBMIT', 'START_REVIEW', 'REQUEST_CORRECTIONS', 'CREATE_VERSION', 'RESUBMIT', 'APPROVE', 'REJECT')`
    ),
  ]
);

/**
 * Scrutiny Observations recorded by the Competent Authority during proposal examination.
 */
export const proposalScrutinyObservations = pgTable(
  'proposal_scrutiny_observations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => acquisitionProposals.id, { onDelete: 'cascade' }),
    proposalVersionId: uuid('proposal_version_id')
      .notNull()
      .references(() => acquisitionProposalVersions.id, { onDelete: 'cascade' }),
    observationCategory: varchar('observation_category', { length: 50 }).notNull(),
    observationTitle: varchar('observation_title', { length: 255 }).notNull(),
    observationDescription: text('observation_description').notNull(),
    relatedSection: varchar('related_section', { length: 100 }),
    relatedParcelId: uuid('related_parcel_id'),
    relatedDocumentId: varchar('related_document_id', { length: 255 }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('prop_scrutiny_obs_proposal_id_idx').on(table.proposalId),
    index('prop_scrutiny_obs_version_id_idx').on(table.proposalVersionId),
    index('prop_scrutiny_obs_category_idx').on(table.observationCategory),
    index('prop_scrutiny_obs_created_by_idx').on(table.createdBy),
    check(
      'prop_scrutiny_obs_category_check',
      sql`${table.observationCategory} IN ('PROJECT_JUSTIFICATION', 'LAND_REQUIREMENT', 'LAND_RECORDS', 'PARCEL_DETAILS', 'DOCUMENTATION', 'FINANCIAL_INFORMATION', 'ADMINISTRATIVE_REQUIREMENTS', 'LEGAL_REQUIREMENTS', 'OTHER')`
    ),
  ]
);

/**
 * Formal scrutiny decisions recorded by the Competent Authority.
 */
export const proposalScrutinyDecisions = pgTable(
  'proposal_scrutiny_decisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => acquisitionProposals.id, { onDelete: 'cascade' }),
    proposalVersionId: uuid('proposal_version_id')
      .notNull()
      .references(() => acquisitionProposalVersions.id, { onDelete: 'cascade' }),
    competentAuthorityId: uuid('competent_authority_id')
      .notNull()
      .references(() => competentAuthorities.id, { onDelete: 'restrict' }),
    decisionType: varchar('decision_type', { length: 50 }).notNull(),
    decisionRemarks: text('decision_remarks').notNull(),
    supportingDocuments: jsonb('supporting_documents').$type<ProposalSupportingDocument[]>(),
    decidedBy: uuid('decided_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('prop_scrutiny_dec_proposal_id_idx').on(table.proposalId),
    index('prop_scrutiny_dec_version_id_idx').on(table.proposalVersionId),
    index('prop_scrutiny_dec_authority_id_idx').on(table.competentAuthorityId),
    index('prop_scrutiny_dec_decided_by_idx').on(table.decidedBy),
    index('prop_scrutiny_dec_type_idx').on(table.decisionType),
    check(
      'prop_scrutiny_dec_type_check',
      sql`${table.decisionType} IN ('APPROVED', 'CORRECTION_REQUESTED', 'REJECTED')`
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
    observations: many(proposalScrutinyObservations),
    decisions: many(proposalScrutinyDecisions),
  })
);

export const acquisitionProposalVersionsRelations = relations(
  acquisitionProposalVersions,
  ({ one, many }) => ({
    proposal: one(acquisitionProposals, {
      fields: [acquisitionProposalVersions.proposalId],
      references: [acquisitionProposals.id],
      relationName: 'proposalVersions',
    }),
    creator: one(users, {
      fields: [acquisitionProposalVersions.createdBy],
      references: [users.id],
      relationName: 'proposalVersionCreator',
    }),
    submitter: one(users, {
      fields: [acquisitionProposalVersions.submittedBy],
      references: [users.id],
      relationName: 'proposalVersionSubmitter',
    }),
    reviewer: one(users, {
      fields: [acquisitionProposalVersions.reviewedBy],
      references: [users.id],
      relationName: 'proposalVersionReviewer',
    }),
    previousVersion: one(acquisitionProposalVersions, {
      fields: [acquisitionProposalVersions.previousVersionId],
      references: [acquisitionProposalVersions.id],
      relationName: 'proposalPreviousVersion',
    }),
    observations: many(proposalScrutinyObservations),
    decisions: many(proposalScrutinyDecisions),
  })
);

export const proposalScrutinyObservationsRelations = relations(
  proposalScrutinyObservations,
  ({ one }) => ({
    proposal: one(acquisitionProposals, {
      fields: [proposalScrutinyObservations.proposalId],
      references: [acquisitionProposals.id],
    }),
    version: one(acquisitionProposalVersions, {
      fields: [proposalScrutinyObservations.proposalVersionId],
      references: [acquisitionProposalVersions.id],
    }),
    author: one(users, {
      fields: [proposalScrutinyObservations.createdBy],
      references: [users.id],
    }),
  })
);

export const proposalScrutinyDecisionsRelations = relations(
  proposalScrutinyDecisions,
  ({ one }) => ({
    proposal: one(acquisitionProposals, {
      fields: [proposalScrutinyDecisions.proposalId],
      references: [acquisitionProposals.id],
    }),
    version: one(acquisitionProposalVersions, {
      fields: [proposalScrutinyDecisions.proposalVersionId],
      references: [acquisitionProposalVersions.id],
    }),
    authority: one(competentAuthorities, {
      fields: [proposalScrutinyDecisions.competentAuthorityId],
      references: [competentAuthorities.id],
    }),
    decider: one(users, {
      fields: [proposalScrutinyDecisions.decidedBy],
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

export type ProposalScrutinyObservation =
  typeof proposalScrutinyObservations.$inferSelect;
export type NewProposalScrutinyObservation =
  typeof proposalScrutinyObservations.$inferInsert;

export type ProposalScrutinyDecision =
  typeof proposalScrutinyDecisions.$inferSelect;
export type NewProposalScrutinyDecision =
  typeof proposalScrutinyDecisions.$inferInsert;
