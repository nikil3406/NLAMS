import { z } from 'zod';

export const submitAcquisitionProposalSchema = z.object({
  remarks: z
    .string()
    .trim()
    .max(1000, { message: 'Remarks must not exceed 1000 characters' })
    .optional(),
});

export type SubmitAcquisitionProposalInput = z.infer<
  typeof submitAcquisitionProposalSchema
>;

export const createProposalVersionSchema = z.object({
  remarks: z
    .string()
    .trim()
    .max(1000, { message: 'Remarks must not exceed 1000 characters' })
    .optional(),
});

export type CreateProposalVersionInput = z.infer<
  typeof createProposalVersionSchema
>;

