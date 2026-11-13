import { z } from 'zod';

export const supportingDocumentSchema = z.object({
  id: z.string().optional(),
  documentType: z
    .string()
    .trim()
    .min(1, { message: 'Document type is required' }),
  documentNumber: z.string().trim().optional(),
  title: z
    .string()
    .trim()
    .min(1, { message: 'Document title is required' }),
  fileUrl: z.string().trim().optional(),
  fileName: z.string().trim().optional(),
  fileSize: z.number().int().nonnegative().optional(),
  mimeType: z.string().trim().optional(),
  uploadedAt: z.string().optional(),
});

export const createAcquisitionProposalSchema = z.object({
  acquisitionCaseId: z
    .string()
    .uuid({ message: 'Invalid acquisition case ID format' }),
  linkedInventoryId: z
    .string()
    .uuid({ message: 'Invalid linked inventory ID format' }),
  acquisitionJustification: z
    .string()
    .trim()
    .min(10, { message: 'Acquisition justification must be at least 10 characters' }),
  publicPurpose: z
    .string()
    .trim()
    .min(10, { message: 'Public purpose must be at least 10 characters' }),
  legalFramework: z
    .string()
    .trim()
    .min(3, { message: 'Applicable legal framework must be at least 3 characters' }),
  landRequirementExplanation: z
    .string()
    .trim()
    .min(10, { message: 'Land requirement explanation must be at least 10 characters' }),
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

  // Strictly forbidden client-supplied fields
  id: z
    .never({ invalid_type_error: 'Proposal ID cannot be supplied by client' })
    .optional(),
  proposalNumber: z
    .never({ invalid_type_error: 'Proposal number cannot be supplied by client' })
    .optional(),
  currentStatus: z
    .never({ invalid_type_error: 'Current status cannot be supplied by client' })
    .optional(),
  currentVersionNumber: z
    .never({ invalid_type_error: 'Version number cannot be supplied by client' })
    .optional(),
  createdBy: z
    .never({ invalid_type_error: 'Creator cannot be supplied by client' })
    .optional(),
  projectId: z
    .never({ invalid_type_error: 'Project ID cannot be supplied directly by client' })
    .optional(),
  implementingAgencyId: z
    .never({ invalid_type_error: 'Implementing agency ID cannot be supplied directly by client' })
    .optional(),
});

export type CreateAcquisitionProposalInput = z.infer<
  typeof createAcquisitionProposalSchema
>;

