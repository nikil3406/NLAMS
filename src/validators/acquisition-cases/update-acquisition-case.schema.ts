import { z } from 'zod';

export const updateAcquisitionCaseSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, { message: 'Case title must be at least 3 characters' })
      .max(255, { message: 'Case title must not exceed 255 characters' })
      .optional(),
    description: z
      .string()
      .trim()
      .max(2000, { message: 'Description must not exceed 2000 characters' })
      .optional()
      .nullable(),
    // Strictly forbidden fields:
    status: z
      .never({ invalid_type_error: 'Status cannot be updated through the general update endpoint' })
      .optional(),
    caseReference: z
      .never({ invalid_type_error: 'Case reference is immutable' })
      .optional(),
    projectId: z
      .never({ invalid_type_error: 'Project association is immutable' })
      .optional(),
    id: z
      .never({ invalid_type_error: 'Case ID is immutable' })
      .optional(),
    createdBy: z
      .never({ invalid_type_error: 'Case creator is immutable' })
      .optional(),
    updatedBy: z
      .never({ invalid_type_error: 'Updater cannot be supplied by client' })
      .optional(),
    submittedAt: z
      .never({ invalid_type_error: 'Submission timestamp cannot be supplied by client' })
      .optional(),
    submissionRemarks: z
      .never({ invalid_type_error: 'Submission remarks cannot be supplied through general update' })
      .optional(),
  })
  .refine(
    (data) => {
      const { ...updatable } = data;
      return Object.keys(updatable).length > 0;
    },
    {
      message: 'At least one field must be provided for update',
    }
  );

export type UpdateAcquisitionCaseInput = z.infer<typeof updateAcquisitionCaseSchema>;
