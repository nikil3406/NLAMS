import { z } from 'zod';

export const generateInventorySchema = z.object({
  remarks: z.string().max(1000).optional(),
});

export type GenerateInventoryInput = z.infer<typeof generateInventorySchema>;

export const submitInventorySchema = z.object({
  remarks: z.string().max(1000).optional(),
});

export type SubmitInventoryInput = z.infer<typeof submitInventorySchema>;

export const inventoryDecisionSchema = z.object({
  decision: z.enum([
    'APPROVE',
    'APPROVED',
    'REQUEST_CORRECTIONS',
    'CORRECTION_REQUESTED',
    'REJECT',
    'REJECTED',
    'START_REVIEW',
    'UNDER_REVIEW',
  ]),
  remarks: z.string().max(2000).optional(),
});

export type InventoryDecisionInput = z.infer<typeof inventoryDecisionSchema>;

export const listSubmittedInventoriesQuerySchema = z.object({
  status: z
    .enum(['SUBMITTED', 'UNDER_REVIEW', 'ALL'])
    .optional()
    .default('SUBMITTED'),
});

export type ListSubmittedInventoriesQuery = z.infer<
  typeof listSubmittedInventoriesQuerySchema
>;
