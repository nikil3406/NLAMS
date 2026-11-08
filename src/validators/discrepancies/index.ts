import { z } from 'zod';
import {
  PARCEL_DISCREPANCY_CATEGORIES,
  PARCEL_DISCREPANCY_STATUSES,
} from '../../../db/schema/parcel-discrepancies';
import { DISCREPANCY_RESOLUTION_DECISIONS } from '../../../db/schema/discrepancy-resolution-history';
import { FIELD_VERIFICATION_EVIDENCE_TYPES } from '../../../db/schema/field-verification-evidence';

export const listDiscrepanciesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(['ALL', ...PARCEL_DISCREPANCY_STATUSES] as [string, ...string[]])
    .optional()
    .default('ALL'),
  category: z
    .enum(['ALL', ...PARCEL_DISCREPANCY_CATEGORIES] as [string, ...string[]])
    .optional()
    .default('ALL'),
  caseParcelId: z.string().uuid().optional(),
});

export type ListDiscrepanciesQuery = z.infer<typeof listDiscrepanciesQuerySchema>;

export const startInvestigationSchema = z.object({
  investigatorId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
});

export type StartInvestigationInput = z.infer<typeof startInvestigationSchema>;

export const updateInvestigationSchema = z.object({
  findings: z.string().max(5000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export type UpdateInvestigationInput = z.infer<typeof updateInvestigationSchema>;

export const attachInvestigationEvidenceSchema = z.object({
  evidenceType: z.enum(FIELD_VERIFICATION_EVIDENCE_TYPES),
  fileReference: z.string().min(1, 'File reference is required').max(255),
  caption: z.string().max(255).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
});

export type AttachInvestigationEvidenceInput = z.infer<
  typeof attachInvestigationEvidenceSchema
>;

export const submitInvestigationSchema = z.object({
  findings: z
    .string({ required_error: 'Investigation findings are required' })
    .min(5, 'Investigation findings must be at least 5 characters long')
    .max(5000),
  notes: z.string().max(2000).optional().nullable(),
});

export type SubmitInvestigationInput = z.infer<typeof submitInvestigationSchema>;

export const resolveDiscrepancySchema = z.object({
  decision: z.enum(DISCREPANCY_RESOLUTION_DECISIONS, {
    required_error: 'Resolution decision is required',
    invalid_type_error: `Decision must be one of: ${DISCREPANCY_RESOLUTION_DECISIONS.join(', ')}`,
  }),
  remarks: z
    .string({ required_error: 'Resolution remarks and reason are required' })
    .min(5, 'Remarks must be at least 5 characters long')
    .max(2000),
});

export type ResolveDiscrepancyInput = z.infer<typeof resolveDiscrepancySchema>;

export const createDiscrepancyEvidenceSchema = z.object({
  evidenceType: z.enum(FIELD_VERIFICATION_EVIDENCE_TYPES),
  fileReference: z.string().min(1, 'File reference is required').max(255),
  caption: z.string().max(255).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
});

export const createDiscrepancySchema = z.object({
  caseParcelId: z.string().uuid({ message: 'Valid case parcel ID is required' }),
  category: z.enum(PARCEL_DISCREPANCY_CATEGORIES, {
    required_error: 'Discrepancy category is required',
  }),
  description: z
    .string({ required_error: 'Discrepancy description is required' })
    .min(5, 'Discrepancy description must be at least 5 characters long')
    .max(2000),
  reportId: z.string().uuid().optional().nullable(),
  evidence: z.array(createDiscrepancyEvidenceSchema).optional(),
});

export type CreateDiscrepancyInput = z.infer<typeof createDiscrepancySchema>;


