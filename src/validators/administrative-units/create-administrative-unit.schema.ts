import { z } from 'zod';

export const createAdministrativeUnitSchema = z.object({
  name: z
    .string({ required_error: 'Name is required' })
    .trim()
    .min(1, 'Name cannot be empty')
    .max(255, 'Name must not exceed 255 characters'),
  code: z
    .string({ required_error: 'Code is required' })
    .trim()
    .min(1, 'Code cannot be empty')
    .max(50, 'Code must not exceed 50 characters')
    .regex(
      /^[A-Za-z0-9_-]+$/,
      'Code must contain only letters, numbers, hyphens, and underscores'
    )
    .transform((val) => val.toUpperCase()),
  type: z
    .string({ required_error: 'Type is required' })
    .trim()
    .min(1, 'Type is required')
    .max(50, 'Type must not exceed 50 characters')
    .transform((val) => val.toUpperCase()),
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
});

export type CreateAdministrativeUnitInput = z.infer<typeof createAdministrativeUnitSchema>;
