import { z } from 'zod';

export const updateAdministrativeUnitSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name cannot be empty')
      .max(255, 'Name must not exceed 255 characters')
      .optional(),
    code: z
      .string()
      .trim()
      .min(1, 'Code cannot be empty')
      .max(50, 'Code must not exceed 50 characters')
      .regex(
        /^[A-Za-z0-9_-]+$/,
        'Code must contain only letters, numbers, hyphens, and underscores'
      )
      .transform((val) => val.toUpperCase())
      .optional(),
    type: z
      .string()
      .trim()
      .min(1, 'Type cannot be empty')
      .max(50, 'Type must not exceed 50 characters')
      .transform((val) => val.toUpperCase())
      .optional(),
    parentId: z
      .string()
      .uuid('Parent ID must be a valid UUID')
      .nullable()
      .optional(),
    status: z
      .enum(['ACTIVE', 'INACTIVE'])
      .optional(),
    isActive: z
      .boolean()
      .optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field must be provided for update' }
  );

export type UpdateAdministrativeUnitInput = z.infer<typeof updateAdministrativeUnitSchema>;
