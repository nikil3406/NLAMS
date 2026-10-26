import { z } from 'zod';
import { PARCEL_AREA_UNITS } from '../../../db/schema/land-parcels';
import { geoJsonGeometrySchema } from '../spatial/boundary.schema';
import { convertAreaToSqm } from '../../lib/geo-utils';

export const parcelAreaUnitSchema = z.enum(PARCEL_AREA_UNITS, {
  invalid_type_error: `Area unit must be one of: ${PARCEL_AREA_UNITS.join(', ')}`,
});

/**
 * Schema for associating an existing parcel to an acquisition case.
 */
export const associateExistingParcelSchema = z.object({
  parcelId: z
    .string()
    .trim()
    .min(1, { message: 'Parcel ID or UUID is required' })
    .max(50, { message: 'Parcel ID must not exceed 50 characters' }),
  proposedAffectedArea: z.coerce
    .number()
    .positive({ message: 'Proposed affected area must be a positive number' }),
  affectedAreaUnit: parcelAreaUnitSchema,
  // Strictly forbidden client fields
  id: z.never({ invalid_type_error: 'ID cannot be supplied by client' }).optional(),
  caseId: z.never({ invalid_type_error: 'Case ID cannot be supplied by client' }).optional(),
  createdBy: z.never({ invalid_type_error: 'Creator cannot be supplied by client' }).optional(),
  updatedBy: z.never({ invalid_type_error: 'Updater cannot be supplied by client' }).optional(),
  createdAt: z.never({ invalid_type_error: 'Creation timestamp cannot be supplied by client' }).optional(),
  updatedAt: z.never({ invalid_type_error: 'Update timestamp cannot be supplied by client' }).optional(),
  status: z.never({ invalid_type_error: 'Status cannot be supplied by client' }).optional(),
});

export type AssociateExistingParcelInput = z.infer<typeof associateExistingParcelSchema>;

/**
 * Schema for creating a canonical land parcel and associating it with an acquisition case.
 */
export const createAndAssociateParcelSchema = z
  .object({
    parcelId: z
      .string()
      .trim()
      .max(50, { message: 'Parcel ID must not exceed 50 characters' })
      .optional(),
    administrativeUnitId: z
      .string()
      .uuid({ message: 'Invalid administrative unit ID format' })
      .optional()
      .nullable(),
    state: z
      .string()
      .trim()
      .min(1, { message: 'State is required' })
      .max(100, { message: 'State must not exceed 100 characters' }),
    district: z
      .string()
      .trim()
      .min(1, { message: 'District is required' })
      .max(100, { message: 'District must not exceed 100 characters' }),
    taluk: z
      .string()
      .trim()
      .min(1, { message: 'Taluk is required' })
      .max(100, { message: 'Taluk must not exceed 100 characters' }),
    village: z
      .string()
      .trim()
      .min(1, { message: 'Village is required' })
      .max(100, { message: 'Village must not exceed 100 characters' }),
    surveyNumber: z
      .string()
      .trim()
      .min(1, { message: 'Survey number is required' })
      .max(100, { message: 'Survey number must not exceed 100 characters' }),
    subdivisionNumber: z
      .string()
      .trim()
      .max(100, { message: 'Subdivision number must not exceed 100 characters' })
      .optional()
      .nullable(),
    landRecordReference: z
      .string()
      .trim()
      .max(255, { message: 'Land record reference must not exceed 255 characters' })
      .optional()
      .nullable(),
    totalArea: z.coerce
      .number()
      .positive({ message: 'Total parcel area must be a positive number' }),
    areaUnit: parcelAreaUnitSchema,
    proposedAffectedArea: z.coerce
      .number()
      .positive({ message: 'Proposed affected area must be a positive number' }),
    affectedAreaUnit: parcelAreaUnitSchema,
    landUse: z
      .string()
      .trim()
      .max(100, { message: 'Land use must not exceed 100 characters' })
      .optional()
      .nullable(),
    physicalDescription: z
      .string()
      .trim()
      .max(2000, { message: 'Physical description must not exceed 2000 characters' })
      .optional()
      .nullable(),
    geometry: geoJsonGeometrySchema.optional().nullable(),
    // Strictly forbidden client fields
    id: z.never({ invalid_type_error: 'ID cannot be supplied by client' }).optional(),
    caseId: z.never({ invalid_type_error: 'Case ID cannot be supplied by client' }).optional(),
    createdBy: z.never({ invalid_type_error: 'Creator cannot be supplied by client' }).optional(),
    updatedBy: z.never({ invalid_type_error: 'Updater cannot be supplied by client' }).optional(),
    createdAt: z.never({ invalid_type_error: 'Creation timestamp cannot be supplied by client' }).optional(),
    updatedAt: z.never({ invalid_type_error: 'Update timestamp cannot be supplied by client' }).optional(),
    status: z.never({ invalid_type_error: 'Status cannot be supplied by client' }).optional(),
  })
  .refine(
    (data) => {
      const totalSqm = convertAreaToSqm(data.totalArea, data.areaUnit);
      const proposedSqm = convertAreaToSqm(data.proposedAffectedArea, data.affectedAreaUnit);
      return proposedSqm <= totalSqm + 1e-4;
    },
    {
      message: 'Proposed affected area cannot exceed total recorded parcel area',
      path: ['proposedAffectedArea'],
    }
  );

export type CreateAndAssociateParcelInput = z.infer<typeof createAndAssociateParcelSchema>;

/**
 * Union schema / dispatcher for POST /api/acquisition-cases/[caseId]/parcels.
 */
export function parseAddParcelInput(body: unknown): CreateAndAssociateParcelInput | AssociateExistingParcelInput {
  if (typeof body === 'object' && body !== null) {
    const obj = body as Record<string, unknown>;
    // If locality / survey fields are provided, parse as full create-and-associate
    if ('surveyNumber' in obj || 'village' in obj || 'state' in obj || 'totalArea' in obj) {
      return createAndAssociateParcelSchema.parse(body);
    }
    // Otherwise parse as association of an existing parcel by parcelId
    return associateExistingParcelSchema.parse(body);
  }
  throw new Error('Invalid parcel input payload');
}

/**
 * Schema for updating permitted case-specific parcel details.
 * PATCH /api/acquisition-cases/[caseId]/parcels/[caseParcelId]
 */
export const updateCaseParcelSchema = z
  .object({
    proposedAffectedArea: z.coerce
      .number()
      .positive({ message: 'Proposed affected area must be a positive number' })
      .optional(),
    affectedAreaUnit: parcelAreaUnitSchema.optional(),
    // Strictly forbidden fields
    id: z.never({ invalid_type_error: 'Case parcel ID cannot be modified' }).optional(),
    caseId: z.never({ invalid_type_error: 'Case ID cannot be modified' }).optional(),
    parcelId: z.never({ invalid_type_error: 'Parcel ID cannot be modified' }).optional(),
    totalArea: z.never({ invalid_type_error: 'Recorded total area cannot be overwritten by case update' }).optional(),
    areaUnit: z.never({ invalid_type_error: 'Recorded area unit cannot be modified by case update' }).optional(),
    createdBy: z.never({ invalid_type_error: 'Creator cannot be modified' }).optional(),
    updatedBy: z.never({ invalid_type_error: 'Updater cannot be supplied by client' }).optional(),
    createdAt: z.never({ invalid_type_error: 'Creation timestamp cannot be modified' }).optional(),
    updatedAt: z.never({ invalid_type_error: 'Update timestamp cannot be supplied by client' }).optional(),
    status: z.never({ invalid_type_error: 'Status cannot be supplied by client' }).optional(),
  })
  .refine(
    (data) => data.proposedAffectedArea !== undefined || data.affectedAreaUnit !== undefined,
    {
      message: 'At least one field (proposedAffectedArea or affectedAreaUnit) must be provided for update',
    }
  );

export type UpdateCaseParcelInput = z.infer<typeof updateCaseParcelSchema>;

/**
 * Schema for querying parcels of an acquisition case.
 * GET /api/acquisition-cases/[caseId]/parcels
 */
export const caseParcelsQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive({ message: 'Page must be a positive integer' }).default(1),
  limit: z.coerce
    .number()
    .int()
    .positive({ message: 'Limit must be a positive integer' })
    .max(100, { message: 'Limit cannot exceed 100' })
    .default(20),
});

export type CaseParcelsQueryInput = z.infer<typeof caseParcelsQuerySchema>;
