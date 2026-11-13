import { z } from 'zod';

export const acquisitionProposalQuerySchema = z.object({
  page: z.coerce
    .number()
    .int()
    .positive({ message: 'Page must be a positive integer' })
    .default(1),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(100, { message: 'Limit cannot exceed 100' })
    .default(20),
  search: z.string().trim().optional(),
  status: z.string().trim().optional(),
  projectId: z.string().uuid().optional(),
  acquisitionCaseId: z.string().uuid().optional(),
});

export type AcquisitionProposalQueryInput = z.infer<
  typeof acquisitionProposalQuerySchema
>;

