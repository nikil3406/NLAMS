import { z } from 'zod';

export const updateAssignmentSchema = z
  .object({
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format')
      .nullable()
      .optional(),
  })
  .strict();

export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
