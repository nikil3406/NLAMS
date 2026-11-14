import { z } from 'zod';

export const createAuthoritySchema = z
  .object({
    authorityCode: z
      .string()
      .trim()
      .min(2, { message: 'Authority code must be at least 2 characters' })
      .max(50, { message: 'Authority code must not exceed 50 characters' }),
    authorityName: z
      .string()
      .trim()
      .min(2, { message: 'Authority name must be at least 2 characters' })
      .max(255, { message: 'Authority name must not exceed 255 characters' }),
    designation: z
      .string()
      .trim()
      .min(2, { message: 'Designation must be at least 2 characters' })
      .max(255, { message: 'Designation must not exceed 255 characters' }),
    authorityLevel: z.enum(['DISTRICT', 'REGIONAL', 'STATE', 'CENTRAL'], {
      errorMap: () => ({
        message: 'Authority level must be DISTRICT, REGIONAL, STATE, or CENTRAL',
      }),
    }),
    status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
    effectiveFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Effective from date must be YYYY-MM-DD' }),
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

export type CreateAuthorityInput = z.infer<typeof createAuthoritySchema>;

