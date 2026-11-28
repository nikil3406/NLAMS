import { z } from 'zod';

export const manageUserImplementingAgencySchema = z
  .object({
    implementingAgencyId: z
      .string({ required_error: 'Implementing Agency ID is required' })
      .uuid({ message: 'Valid Implementing Agency ID is required' }),
    effectiveFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Effective from date must be YYYY-MM-DD' })
      .optional(),
    effectiveUntil: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Effective until date must be YYYY-MM-DD' })
      .optional()
      .nullable(),
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

export type ManageUserImplementingAgencyInput = z.infer<
  typeof manageUserImplementingAgencySchema
>;
