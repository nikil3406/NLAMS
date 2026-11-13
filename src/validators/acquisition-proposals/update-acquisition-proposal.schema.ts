import { z } from 'zod';
import { supportingDocumentSchema } from './create-acquisition-proposal.schema';

export const updateAcquisitionProposalSchema = z.object({
  acquisitionJustification: z
    .string()
    .trim()
    .min(10, { message: 'Acquisition justification must be at least 10 characters' })
    .optional(),
  publicPurpose: z
    .string()
    .trim()
    .min(10, { message: 'Public purpose must be at least 10 characters' })
    .optional(),
  legalFramework: z
    .string()
    .trim()
    .min(3, { message: 'Applicable legal framework must be at least 3 characters' })
    .optional(),
  landRequirementExplanation: z
    .string()
    .trim()
    .min(10, { message: 'Land requirement explanation must be at least 10 characters' })
    .optional(),
  administrativeApprovalRef: z
    .string()
    .trim()
    .max(255, { message: 'Administrative approval reference must not exceed 255 characters' })
    .optional()
    .nullable(),
  administrativeApprovalDate: z
    .string()
    .optional()
    .nullable(),
  additionalDetails: z
    .record(z.unknown())
    .optional()
    .nullable(),
  supportingDocuments: z
    .array(supportingDocumentSchema)
    .optional()
    .nullable(),

  // Strictly forbidden modifications
  acquisitionCaseId: z
    .never({ invalid_type_error: 'Acquisition case cannot be changed through draft update' })
    .optional(),
  linkedInventoryId: z
    .never({ invalid_type_error: 'Linked inventory cannot be changed through draft update' })
    .optional(),
  linkedInventoryVersionId: z
    .never({ invalid_type_error: 'Linked inventory version cannot be changed through draft update' })
    .optional(),
  id: z
    .never({ invalid_type_error: 'Proposal ID cannot be supplied in update body' })
    .optional(),
  proposalNumber: z
    .never({ invalid_type_error: 'Proposal number cannot be changed' })
    .optional(),
  currentStatus: z
    .never({ invalid_type_error: 'Status cannot be changed directly via draft update' })
    .optional(),
  currentVersionNumber: z
    .never({ invalid_type_error: 'Version number cannot be updated directly' })
    .optional(),
  createdBy: z
    .never({ invalid_type_error: 'Creator cannot be modified' })
    .optional(),
  projectId: z
    .never({ invalid_type_error: 'Project cannot be changed' })
    .optional(),
  implementingAgencyId: z
    .never({ invalid_type_error: 'Implementing agency cannot be changed' })
    .optional(),
});

export type UpdateAcquisitionProposalInput = z.infer<
  typeof updateAcquisitionProposalSchema
>;

