import { z } from 'zod';

export const createAssignmentSchema = z
  .object({
    administrativeUnitId: z
      .string({ required_error: 'Administrative unit ID is required' })
      .uuid('Invalid administrative unit ID format'),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format')
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format')
      .nullable()
      .optional(),
  })
  .strict();

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
