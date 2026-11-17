import { z } from 'zod';
import { SCRUTINY_DECISION_TYPES } from '../../../db/schema/acquisition-proposals';

export const recordDecisionSchema = z.object({
  decisionType: z.enum(SCRUTINY_DECISION_TYPES, {
    errorMap: () => ({
      message: 'Decision type must be APPROVED, CORRECTION_REQUESTED, or REJECTED',
    }),
  }),
  decisionRemarks: z
    .string()
    .trim()
    .min(5, { message: 'Decision remarks/justification must be at least 5 characters' })
    .max(5000, { message: 'Decision remarks must not exceed 5000 characters' }),
  supportingDocuments: z
    .array(
      z.object({
        id: z.string().optional(),
        documentType: z.string(),
        documentNumber: z.string().optional(),
        title: z.string().min(1),
        fileUrl: z.string().optional(),
        fileName: z.string().optional(),
        fileSize: z.number().optional(),
        mimeType: z.string().optional(),
        uploadedAt: z.string().optional(),
      })
    )
    .optional()
    .nullable(),
});

export type RecordDecisionInput = z.infer<typeof recordDecisionSchema>;
