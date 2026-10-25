import { z } from 'zod';

export const REVIEW_DECISIONS = [
  'PERMIT_FIELD_VERIFICATION',
  'AUTHORIZE_FIELD_VERIFICATION',
  'RETURN_FOR_CORRECTION',
  'REJECT',
] as const;

export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const reviewAcquisitionCaseSchema = z
  .object({
    decision: z.enum(REVIEW_DECISIONS, {
      required_error: 'Decision is required',
      invalid_type_error: `Decision must be one of: ${REVIEW_DECISIONS.join(', ')}`,
    }),
    remarks: z
      .string()
      .trim()
      .max(1000, { message: 'Remarks must not exceed 1000 characters' })
      .optional()
      .nullable(),
    reason: z
      .string()
      .trim()
      .max(1000, { message: 'Reason must not exceed 1000 characters' })
      .optional()
      .nullable(),
  })
  .superRefine((data, ctx) => {
    const effectiveRemarks = (data.remarks ?? data.reason ?? '').trim();

    if (data.decision === 'RETURN_FOR_CORRECTION' && effectiveRemarks.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['remarks'],
        message: 'Remarks are mandatory when returning a case for correction',
      });
    }

    if (data.decision === 'REJECT' && effectiveRemarks.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['remarks'],
        message: 'A rejection reason is mandatory when rejecting a case',
      });
    }
  });

export type ReviewAcquisitionCaseInput = z.infer<typeof reviewAcquisitionCaseSchema>;
