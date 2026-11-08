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
  check,
  jsonb,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { acquisitionCases } from './acquisition-cases';
import { landParcels } from './land-parcels';
import { acquisitionCaseParcels } from './acquisition-case-parcels';
import { fieldVerificationReports } from './field-verification-reports';
import { users } from './users';
import { postgisGeometry } from './project-boundary-versions';

/**
 * Valid lifecycle statuses for verified land inventories.
 */
export const VERIFIED_LAND_INVENTORY_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'CORRECTION_REQUESTED',
  'APPROVED',
  'REJECTED',
] as const;

export type VerifiedLandInventoryStatus =
  (typeof VERIFIED_LAND_INVENTORY_STATUSES)[number];

export const INVENTORY_WORKFLOW_ACTIONS = [
  'GENERATE',
  'REGENERATE',
  'SUBMIT',
  'START_REVIEW',
  'APPROVE',
  'REQUEST_CORRECTIONS',
  'REJECT',
] as const;

export type InventoryWorkflowAction =
  (typeof INVENTORY_WORKFLOW_ACTIONS)[number];

/**
 * Verified Land Inventory header entity.
 *
 * Requirements:
 * - Versioned inventory generated from existing acquisition case parcels, accepted reports, and resolved discrepancies.
 * - Land Officer prepares and submits inventory.
 * - Ministry Admin reviews, requests corrections, approves or rejects with mandatory remarks.
 * - Immutable once approved.
 * - Prevents duplicate or concurrent version generation via unique (caseId, versionNumber).
 */
export const verifiedLandInventories = pgTable(
  'verified_land_inventories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => acquisitionCases.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').default(1).notNull(),
    status: varchar('status', { length: 50 }).default('DRAFT').notNull(),
    totalParcelCount: integer('total_parcel_count').default(0).notNull(),
    aggregateRecordedArea: numeric('aggregate_recorded_area', { precision: 18, scale: 4 })
      .default('0')
      .notNull(),
    aggregateAffectedArea: numeric('aggregate_affected_area', { precision: 18, scale: 4 })
      .default('0')
      .notNull(),
    areaUnit: varchar('area_unit', { length: 50 }).default('SQ_M').notNull(),
    preparedBy: uuid('prepared_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
    submittedBy: uuid('submitted_by')
      .references(() => users.id, { onDelete: 'restrict' }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    reviewedBy: uuid('reviewed_by')
      .references(() => users.id, { onDelete: 'restrict' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewRemarks: text('review_remarks'),
    previousVersionId: uuid('previous_version_id')
      .references((): AnyPgColumn => verifiedLandInventories.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('verified_land_inventories_case_version_idx').on(
      table.caseId,
      table.versionNumber
    ),
    index('verified_land_inventories_case_id_idx').on(table.caseId),
    index('verified_land_inventories_status_idx').on(table.status),
    index('verified_land_inventories_prepared_by_idx').on(table.preparedBy),
    index('verified_land_inventories_submitted_by_idx').on(table.submittedBy),
    index('verified_land_inventories_reviewed_by_idx').on(table.reviewedBy),
    index('verified_land_inventories_prev_version_idx').on(table.previousVersionId),
    check(
      'verified_land_inventories_status_check',
      sql`${table.status} IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CORRECTION_REQUESTED', 'APPROVED', 'REJECTED')`
    ),
    check(
      'verified_land_inventories_version_number_check',
      sql`${table.versionNumber} >= 1`
    ),
    check(
      'verified_land_inventories_total_parcel_count_check',
      sql`${table.totalParcelCount} >= 0`
    ),
  ]
);

/**
 * Immutable snapshot of an individual parcel at the time of inventory generation.
 *
 * Preserves the parcel state, field verification findings, reviewer, and discrepancy
 * resolutions so future mutations to land_parcels or reports never alter historical inventories.
 */
export const inventoryParcelSnapshots = pgTable(
  'inventory_parcel_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    inventoryId: uuid('inventory_id')
      .notNull()
      .references(() => verifiedLandInventories.id, { onDelete: 'cascade' }),
    parcelId: uuid('parcel_id')
      .notNull()
      .references(() => landParcels.id, { onDelete: 'restrict' }),
    caseParcelId: uuid('case_parcel_id')
      .notNull()
      .references(() => acquisitionCaseParcels.id, { onDelete: 'cascade' }),
    state: varchar('state', { length: 100 }).notNull(),
    district: varchar('district', { length: 100 }).notNull(),
    taluk: varchar('taluk', { length: 100 }).notNull(),
    village: varchar('village', { length: 100 }).notNull(),
    surveyNumber: varchar('survey_number', { length: 100 }).notNull(),
    hissaNumber: varchar('hissa_number', { length: 100 }),
    landRecordReference: varchar('land_record_reference', { length: 255 }),
    recordedArea: numeric('recorded_area', { precision: 18, scale: 4 }).notNull(),
    recordedAreaUnit: varchar('recorded_area_unit', { length: 50 }).notNull(),
    proposedAffectedArea: numeric('proposed_affected_area', { precision: 18, scale: 4 }).notNull(),
    proposedAffectedAreaUnit: varchar('proposed_affected_area_unit', { length: 50 }).notNull(),
    fieldMeasuredArea: numeric('field_measured_area', { precision: 18, scale: 4 }),
    fieldMeasuredAreaUnit: varchar('field_measured_area_unit', { length: 50 }),
    acceptedReportId: uuid('accepted_report_id')
      .references(() => fieldVerificationReports.id, { onDelete: 'set null' }),
    verificationDate: timestamp('verification_date', { withTimezone: true }),
    reviewingOfficerId: uuid('reviewing_officer_id')
      .references(() => users.id, { onDelete: 'set null' }),
    geometry: postgisGeometry('geometry'),
    discrepancyDetails: jsonb('discrepancy_details').$type<
      Array<{
        discrepancyId: string;
        category: string;
        description: string;
        resolutionDecision?: string;
        resolutionRemarks?: string;
        resolvedBy?: string;
        resolvedAt?: string;
      }>
    >(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('inventory_parcel_snapshots_inv_case_parcel_idx').on(
      table.inventoryId,
      table.caseParcelId
    ),
    index('inventory_parcel_snapshots_inventory_id_idx').on(table.inventoryId),
    index('inventory_parcel_snapshots_parcel_id_idx').on(table.parcelId),
    index('inventory_parcel_snapshots_case_parcel_id_idx').on(table.caseParcelId),
    index('inventory_parcel_snapshots_accepted_report_id_idx').on(table.acceptedReportId),
    index('inventory_parcel_snapshots_reviewing_officer_id_idx').on(table.reviewingOfficerId),
    check(
      'inventory_parcel_snapshots_recorded_area_check',
      sql`${table.recordedArea} > 0`
    ),
    check(
      'inventory_parcel_snapshots_proposed_area_check',
      sql`${table.proposedAffectedArea} > 0`
    ),
  ]
);

/**
 * Historical audit log for verified land inventory workflow decisions and transitions.
 */
export const verifiedLandInventoryWorkflowHistory = pgTable(
  'verified_land_inventory_workflow_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    inventoryId: uuid('inventory_id')
      .notNull()
      .references(() => verifiedLandInventories.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id')
      .notNull()
      .references(() => acquisitionCases.id, { onDelete: 'cascade' }),
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
    index('inventory_wf_history_inventory_id_idx').on(table.inventoryId),
    index('inventory_wf_history_case_id_idx').on(table.caseId),
    index('inventory_wf_history_actor_id_idx').on(table.actorId),
    index('inventory_wf_history_created_at_idx').on(table.createdAt),
    check(
      'inventory_wf_history_action_check',
      sql`${table.action} IN ('GENERATE', 'REGENERATE', 'SUBMIT', 'START_REVIEW', 'APPROVE', 'REQUEST_CORRECTIONS', 'REJECT')`
    ),
  ]
);

export const verifiedLandInventoriesRelations = relations(
  verifiedLandInventories,
  ({ one, many }) => ({
    acquisitionCase: one(acquisitionCases, {
      fields: [verifiedLandInventories.caseId],
      references: [acquisitionCases.id],
    }),
    preparer: one(users, {
      fields: [verifiedLandInventories.preparedBy],
      references: [users.id],
      relationName: 'inventoryPreparer',
    }),
    submitter: one(users, {
      fields: [verifiedLandInventories.submittedBy],
      references: [users.id],
      relationName: 'inventorySubmitter',
    }),
    reviewer: one(users, {
      fields: [verifiedLandInventories.reviewedBy],
      references: [users.id],
      relationName: 'inventoryReviewer',
    }),
    previousVersion: one(verifiedLandInventories, {
      fields: [verifiedLandInventories.previousVersionId],
      references: [verifiedLandInventories.id],
      relationName: 'previousInventoryVersion',
    }),
    snapshots: many(inventoryParcelSnapshots),
    workflowHistory: many(verifiedLandInventoryWorkflowHistory),
  })
);

export const inventoryParcelSnapshotsRelations = relations(
  inventoryParcelSnapshots,
  ({ one }) => ({
    inventory: one(verifiedLandInventories, {
      fields: [inventoryParcelSnapshots.inventoryId],
      references: [verifiedLandInventories.id],
    }),
    parcel: one(landParcels, {
      fields: [inventoryParcelSnapshots.parcelId],
      references: [landParcels.id],
    }),
    caseParcel: one(acquisitionCaseParcels, {
      fields: [inventoryParcelSnapshots.caseParcelId],
      references: [acquisitionCaseParcels.id],
    }),
    acceptedReport: one(fieldVerificationReports, {
      fields: [inventoryParcelSnapshots.acceptedReportId],
      references: [fieldVerificationReports.id],
    }),
    reviewingOfficer: one(users, {
      fields: [inventoryParcelSnapshots.reviewingOfficerId],
      references: [users.id],
    }),
  })
);

export const verifiedLandInventoryWorkflowHistoryRelations = relations(
  verifiedLandInventoryWorkflowHistory,
  ({ one }) => ({
    inventory: one(verifiedLandInventories, {
      fields: [verifiedLandInventoryWorkflowHistory.inventoryId],
      references: [verifiedLandInventories.id],
    }),
    case: one(acquisitionCases, {
      fields: [verifiedLandInventoryWorkflowHistory.caseId],
      references: [acquisitionCases.id],
    }),
    actor: one(users, {
      fields: [verifiedLandInventoryWorkflowHistory.actorId],
      references: [users.id],
    }),
  })
);

export type VerifiedLandInventory = typeof verifiedLandInventories.$inferSelect;
export type NewVerifiedLandInventory = typeof verifiedLandInventories.$inferInsert;
export type InventoryParcelSnapshot = typeof inventoryParcelSnapshots.$inferSelect;
export type NewInventoryParcelSnapshot = typeof inventoryParcelSnapshots.$inferInsert;
export type VerifiedLandInventoryWorkflowHistory =
  typeof verifiedLandInventoryWorkflowHistory.$inferSelect;
export type NewVerifiedLandInventoryWorkflowHistory =
  typeof verifiedLandInventoryWorkflowHistory.$inferInsert;

