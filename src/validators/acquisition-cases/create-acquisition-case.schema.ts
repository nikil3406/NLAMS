import { z } from 'zod';

export const createAcquisitionCaseSchema = z.object({
  projectId: z.string().uuid({ message: 'Invalid project ID format' }),
  title: z
    .string()
    .trim()
    .min(3, { message: 'Case title must be at least 3 characters' })
    .max(255, { message: 'Case title must not exceed 255 characters' }),
  description: z
    .string()
    .trim()
    .max(2000, { message: 'Description must not exceed 2000 characters' })
    .optional()
    .nullable(),
  // Strictly forbidden fields:
  status: z
    .never({ invalid_type_error: 'Initial status cannot be supplied by client' })
    .optional(),
  caseReference: z
    .never({ invalid_type_error: 'Case reference cannot be supplied by client' })
    .optional(),
  id: z
    .never({ invalid_type_error: 'Case ID cannot be supplied by client' })
    .optional(),
  createdBy: z
    .never({ invalid_type_error: 'Creator cannot be supplied by client' })
    .optional(),
  updatedBy: z
    .never({ invalid_type_error: 'Updater cannot be supplied by client' })
    .optional(),
  submittedAt: z
    .never({ invalid_type_error: 'Submission timestamp cannot be supplied by client' })
    .optional(),
});

export type CreateAcquisitionCaseInput = z.infer<typeof createAcquisitionCaseSchema>;
