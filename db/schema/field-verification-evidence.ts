import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { fieldVerificationReports } from './field-verification-reports';
import { discrepancyInvestigations } from './discrepancy-investigations';
import { users } from './users';

/**
 * Supported categories of field verification and investigation evidence.
 */
export const FIELD_VERIFICATION_EVIDENCE_TYPES = [
  'PHOTO',
  'SKETCH',
  'GEO_TAGGED_IMAGE',
  'SURVEY_RECORD',
  'NOTICE_COPY',
  'OTHER',
] as const;

export type FieldVerificationEvidenceType =
  (typeof FIELD_VERIFICATION_EVIDENCE_TYPES)[number];

/**
 * Field verification and investigation evidence persistence entity.
 *
 * Requirements:
 * - Represents verified inspection and investigation evidence (e.g. photos, sketches, survey records).
 * - Linked to either a field report or a discrepancy investigation (or both).
 * - Stores verifiable file/document storage references (not arbitrary URLs or client paths).
 * - Records authenticated creator and creation timestamp.
 */
export const fieldVerificationEvidence = pgTable(
  'field_verification_evidence',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reportId: uuid('report_id')
      .references(() => fieldVerificationReports.id, { onDelete: 'cascade' }),
    investigationId: uuid('investigation_id')
      .references(() => discrepancyInvestigations.id, { onDelete: 'cascade' }),
    evidenceType: varchar('evidence_type', { length: 50 }).notNull(),
    fileReference: varchar('file_reference', { length: 255 }).notNull(),
    caption: varchar('caption', { length: 255 }),
    description: text('description'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('field_verif_evidence_report_id_idx').on(table.reportId),
    index('field_verif_evidence_investigation_id_idx').on(table.investigationId),
    index('field_verif_evidence_created_by_idx').on(table.createdBy),
    check(
      'field_verif_evidence_owner_check',
      sql`${table.reportId} IS NOT NULL OR ${table.investigationId} IS NOT NULL`
    ),
  ]
);

export const fieldVerificationEvidenceRelations = relations(
  fieldVerificationEvidence,
  ({ one }) => ({
    report: one(fieldVerificationReports, {
      fields: [fieldVerificationEvidence.reportId],
      references: [fieldVerificationReports.id],
    }),
    investigation: one(discrepancyInvestigations, {
      fields: [fieldVerificationEvidence.investigationId],
      references: [discrepancyInvestigations.id],
    }),
    creator: one(users, {
      fields: [fieldVerificationEvidence.createdBy],
      references: [users.id],
    }),
  })
);

export type FieldVerificationEvidence = typeof fieldVerificationEvidence.$inferSelect;
export type NewFieldVerificationEvidence = typeof fieldVerificationEvidence.$inferInsert;
