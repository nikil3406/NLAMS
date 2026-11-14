import { z } from 'zod';

export const addJurisdictionSchema = z
  .object({
    stateId: z.string().uuid({ message: 'Valid state administrative unit ID is required' }),
    districtId: z.string().uuid({ message: 'Invalid district ID format' }).optional().nullable(),
    talukId: z.string().uuid({ message: 'Invalid taluk ID format' }).optional().nullable(),
    villageId: z.string().uuid({ message: 'Invalid village ID format' }).optional().nullable(),
    effectiveFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Effective from date must be YYYY-MM-DD' }),
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

export type AddJurisdictionInput = z.infer<typeof addJurisdictionSchema>;

export const updateJurisdictionSchema = z
  .object({
    effectiveFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Effective from date must be YYYY-MM-DD' })
      .optional(),
    effectiveUntil: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Effective until date must be YYYY-MM-DD' })
      .optional()
      .nullable(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
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

export type UpdateJurisdictionInput = z.infer<typeof updateJurisdictionSchema>;

