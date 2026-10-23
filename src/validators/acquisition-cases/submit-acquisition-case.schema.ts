import { z } from 'zod';

export const submitAcquisitionCaseSchema = z.object({
  remarks: z
    .string()
    .trim()
    .max(1000, { message: 'Submission remarks must not exceed 1000 characters' })
    .optional()
    .nullable(),
});

export type SubmitAcquisitionCaseInput = z.infer<typeof submitAcquisitionCaseSchema>;
