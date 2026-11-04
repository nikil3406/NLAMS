import { z } from 'zod';
import {
  FIELD_VERIFICATION_REPORT_OUTCOMES,
  FIELD_VERIFICATION_REPORT_STATUSES,
} from '../../../db/schema/field-verification-reports';
import { FIELD_VERIFICATION_EVIDENCE_TYPES } from '../../../db/schema/field-verification-evidence';
import { FIELD_VERIFICATION_REVIEW_DECISIONS } from '../../../db/schema/field-verification-report-reviews';

export const SUPPORTED_AREA_UNITS = ['SQ_M', 'HECTARE', 'ACRE', 'SQ_KM'] as const;

/**
 * Schema for an evidence item linked to a verification report.
 * Does not accept arbitrary URLs or local filesystem paths.
 */
export const evidenceItemSchema = z.object({
  evidenceType: z.enum(FIELD_VERIFICATION_EVIDENCE_TYPES, {
    errorMap: () => ({
      message: `evidenceType must be one of: ${FIELD_VERIFICATION_EVIDENCE_TYPES.join(', ')}`,
    }),
  }),
  fileReference: z
    .string()
    .min(3, 'fileReference must be at least 3 characters')
    .max(255, 'fileReference cannot exceed 255 characters')
    .refine(
      (val) => !/^https?:\/\//i.test(val) && !/^[a-zA-Z]:\\/i.test(val) && !/^\/[a-zA-Z]/i.test(val),
      {
        message: 'fileReference must be a valid internal storage reference key, not an external URL or raw file path',
      }
    ),
  caption: z.string().max(255).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
});

export type EvidenceItemInput = z.infer<typeof evidenceItemSchema>;

/**
 * Base schema for field verification report attributes.
 */
export const createFieldVerificationReportSchema = z
  .object({
    verificationDate: z
      .string()
      .datetime({ message: 'verificationDate must be a valid ISO 8601 datetime string' })
      .optional()
      .nullable(),
    outcome: z
      .enum(FIELD_VERIFICATION_REPORT_OUTCOMES, {
        errorMap: () => ({
          message: `outcome must be one of: ${FIELD_VERIFICATION_REPORT_OUTCOMES.join(', ')}`,
        }),
      })
      .optional()
      .nullable(),
    observations: z.string().max(5000).optional().nullable(),
    measuredArea: z
      .union([z.number(), z.string()])
      .optional()
      .nullable()
      .transform((val) => {
        if (val === undefined || val === null || val === '') return null;
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) ? null : num;
      }),
    measuredAreaUnit: z
      .enum(SUPPORTED_AREA_UNITS, {
        errorMap: () => ({
          message: `measuredAreaUnit must be one of: ${SUPPORTED_AREA_UNITS.join(', ')}`,
        }),
      })
      .optional()
      .nullable(),
    measurementMethod: z.string().max(100).optional().nullable(),
    measurementNotes: z.string().max(2000).optional().nullable(),
    evidence: z.array(evidenceItemSchema).optional().default([]),
  })
  .superRefine((data, ctx) => {
    // If measuredArea is supplied and non-null, it must be positive and require a unit
    if (data.measuredArea !== null && data.measuredArea !== undefined) {
      if (data.measuredArea <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'measuredArea must be a positive number greater than 0',
          path: ['measuredArea'],
        });
      }
      if (!data.measuredAreaUnit) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'measuredAreaUnit is required when measuredArea is provided',
          path: ['measuredAreaUnit'],
        });
      }
    }
  });

export type CreateFieldVerificationReportInput = z.infer<
  typeof createFieldVerificationReportSchema
>;

/**
 * Update schema for draft report editing.
 */
export const updateFieldVerificationReportSchema = z
  .object({
    verificationDate: z
      .string()
      .datetime({ message: 'verificationDate must be a valid ISO 8601 datetime string' })
      .optional()
      .nullable(),
    outcome: z
      .enum(FIELD_VERIFICATION_REPORT_OUTCOMES, {
        errorMap: () => ({
          message: `outcome must be one of: ${FIELD_VERIFICATION_REPORT_OUTCOMES.join(', ')}`,
        }),
      })
      .optional()
      .nullable(),
    observations: z.string().max(5000).optional().nullable(),
    measuredArea: z
      .union([z.number(), z.string()])
      .optional()
      .nullable()
      .transform((val) => {
        if (val === undefined || val === null || val === '') return null;
        const num = typeof val === 'number' ? val : parseFloat(val);
        return isNaN(num) ? null : num;
      }),
    measuredAreaUnit: z
      .enum(SUPPORTED_AREA_UNITS, {
        errorMap: () => ({
          message: `measuredAreaUnit must be one of: ${SUPPORTED_AREA_UNITS.join(', ')}`,
        }),
      })
      .optional()
      .nullable(),
    measurementMethod: z.string().max(100).optional().nullable(),
    measurementNotes: z.string().max(2000).optional().nullable(),
    evidence: z.array(evidenceItemSchema).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.measuredArea !== null && data.measuredArea !== undefined) {
      if (data.measuredArea <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'measuredArea must be a positive number greater than 0',
          path: ['measuredArea'],
        });
      }
      if (!data.measuredAreaUnit) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'measuredAreaUnit is required when measuredArea is provided',
          path: ['measuredAreaUnit'],
        });
      }
    }
  });

export type UpdateFieldVerificationReportInput = z.infer<
  typeof updateFieldVerificationReportSchema
>;

/**
 * Submission payload schema.
 */
export const submitFieldVerificationReportSchema = z.object({
  remarks: z.string().max(2000).optional().nullable(),
  evidence: z.array(evidenceItemSchema).optional(),
});

export type SubmitFieldVerificationReportInput = z.infer<
  typeof submitFieldVerificationReportSchema
>;

/**
 * Query schema for listing reports with pagination.
 */
export const listFieldVerificationReportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type ListFieldVerificationReportsQuery = z.infer<
  typeof listFieldVerificationReportsQuerySchema
>;

/**
 * Schema for formal Land Officer review decision on a submitted field verification report.
 */
export const reviewFieldVerificationReportSchema = z
  .object({
    decision: z.enum(FIELD_VERIFICATION_REVIEW_DECISIONS, {
      errorMap: () => ({
        message: `decision must be one of: ${FIELD_VERIFICATION_REVIEW_DECISIONS.join(', ')}`,
      }),
    }),
    remarks: z.string().max(2000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const trimmedRemarks = data.remarks?.trim() ?? '';
    if (data.decision === 'RETURNED_FOR_CORRECTION' && trimmedRemarks.length < 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Remarks explaining correction requirements are mandatory when returning a report for correction (minimum 5 characters)',
        path: ['remarks'],
      });
    }
    if (data.decision === 'DISCREPANCY_FLAGGED' && trimmedRemarks.length < 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A reason or remarks explaining the discrepancy are mandatory when flagging a report (minimum 5 characters)',
        path: ['remarks'],
      });
    }
  });

export type ReviewFieldVerificationReportInput = z.infer<
  typeof reviewFieldVerificationReportSchema
>;

/**
 * Query schema for review queue listing.
 */
export const listReviewQueueQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  reviewStatus: z
    .enum(['SUBMITTED', 'ACCEPTED', 'RETURNED_FOR_CORRECTION', 'DISCREPANCY_FLAGGED', 'ALL'])
    .optional(),
  outcome: z
    .enum(['VERIFIED', 'DISCREPANCY_FOUND', 'INCONCLUSIVE', 'ALL'])
    .optional(),
  caseId: z.string().uuid().optional(),
});

export type ListReviewQueueQuery = z.infer<typeof listReviewQueueQuerySchema>;
