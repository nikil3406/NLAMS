import { z } from 'zod';

export const manageUserAuthorityAssignmentSchema = z
  .object({
    authorityId: z.string().uuid({ message: 'Valid Competent Authority ID is required' }),
    effectiveFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Effective from date must be YYYY-MM-DD' })
      .optional(),
    effectiveUntil: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Effective until date must be YYYY-MM-DD' })
      .optional()
      .nullable(),
    status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  })
  .refine(
    (data) => {
      if (data.effectiveFrom && data.effectiveUntil) {
        return new Date(data.effectiveUntil) >= new Date(data.effectiveFrom);
      }
      return true;
    },
    {
      message: 'Effective until date cannot be earlier than effective from date',
      path: ['effectiveUntil'],
    }
  );

export type ManageUserAuthorityAssignmentInput = z.infer<
  typeof manageUserAuthorityAssignmentSchema
>;

export const updateUserAuthorityAssignmentStatusSchema = z
  .object({
    status: z.enum(['ACTIVE', 'INACTIVE'], {
      required_error: 'Status is required',
      invalid_type_error: "Status must be 'ACTIVE' or 'INACTIVE'",
    }),
    effectiveUntil: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Effective until date must be YYYY-MM-DD' })
      .optional()
      .nullable(),
  });

export type UpdateUserAuthorityAssignmentStatusInput = z.infer<
  typeof updateUserAuthorityAssignmentStatusSchema
>;
