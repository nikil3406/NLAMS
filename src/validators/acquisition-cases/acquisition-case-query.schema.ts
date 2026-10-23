import { z } from 'zod';
import { ACQUISITION_CASE_STATUSES } from '../../../db/schema/acquisition-cases';

export const acquisitionCaseQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z
    .enum(ACQUISITION_CASE_STATUSES, {
      invalid_type_error: `Status must be one of: ${ACQUISITION_CASE_STATUSES.join(', ')}`,
    })
    .optional(),
  projectId: z.string().uuid({ message: 'Invalid project ID format' }).optional(),
  page: z.coerce.number().int().positive({ message: 'Page must be a positive integer' }).default(1),
  limit: z.coerce
    .number()
    .int()
    .positive({ message: 'Limit must be a positive integer' })
    .max(100, { message: 'Limit cannot exceed 100' })
    .default(20),
});

export type AcquisitionCaseQueryInput = z.infer<typeof acquisitionCaseQuerySchema>;
