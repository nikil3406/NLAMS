import { z } from 'zod';

export const PROJECT_REVIEW_DECISIONS = [
  'ACCEPT',
  'APPROVE',
  'REQUEST_CORRECTIONS',
  'RETURN_FOR_CORRECTION',
  'REJECT',
] as const;

export type ProjectReviewDecision = (typeof PROJECT_REVIEW_DECISIONS)[number];

export const reviewProjectSchema = z
  .object({
    decision: z.enum(PROJECT_REVIEW_DECISIONS, {
      required_error: 'Review decision is required',
      invalid_type_error: `Decision must be one of: ${PROJECT_REVIEW_DECISIONS.join(', ')}`,
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

    if (
      (data.decision === 'REQUEST_CORRECTIONS' || data.decision === 'RETURN_FOR_CORRECTION') &&
      effectiveRemarks.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['remarks'],
        message: 'Remarks are mandatory when requesting corrections on a project',
      });
    }

    if (data.decision === 'REJECT' && effectiveRemarks.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['remarks'],
        message: 'A rejection reason is mandatory when rejecting a project',
      });
    }
  });

export type ReviewProjectInput = z.infer<typeof reviewProjectSchema>;
