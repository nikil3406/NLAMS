import { z } from 'zod';

export const updateAuthoritySchema = z
  .object({
    authorityName: z
      .string()
      .trim()
      .min(2, { message: 'Authority name must be at least 2 characters' })
      .max(255, { message: 'Authority name must not exceed 255 characters' })
      .optional(),
    designation: z
      .string()
      .trim()
      .min(2, { message: 'Designation must be at least 2 characters' })
      .max(255, { message: 'Designation must not exceed 255 characters' })
      .optional(),
    authorityLevel: z
      .enum(['DISTRICT', 'REGIONAL', 'STATE', 'CENTRAL'])
      .optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
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

export type UpdateAuthorityInput = z.infer<typeof updateAuthoritySchema>;

