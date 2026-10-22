import { z } from 'zod';
import { PROJECT_TYPES } from '../../../db/schema/projects';
import { projectBoundaryInputSchema } from '../spatial/boundary.schema';

export const createProjectSchema = z
  .object({
    name: z
      .string({ required_error: 'Project name is required' })
      .trim()
      .min(3, { message: 'Project name must be at least 3 characters' })
      .max(255, { message: 'Project name must not exceed 255 characters' }),
    description: z
      .string()
      .trim()
      .max(2000, { message: 'Description must not exceed 2000 characters' })
      .optional()
      .nullable(),
    projectType: z.enum(PROJECT_TYPES, {
      required_error: 'Project type is required',
      invalid_type_error: `Project type must be one of: ${PROJECT_TYPES.join(', ')}`,
    }),
    implementingAgencyId: z
      .string({ required_error: 'Implementing agency is required' })
      .uuid({ message: 'Invalid implementing agency UUID' }),
    administrativeUnitId: z
      .string({ required_error: 'Administrative unit is required' })
      .uuid({ message: 'Invalid administrative unit UUID' }),
    landAcquisitionRequired: z.boolean().default(true),
    estimatedCost: z
      .union([
        z.string().regex(/^\d+(\.\d{1,2})?$/, {
          message: 'Estimated cost must be a valid positive amount with up to 2 decimal places',
        }),
        z.number().positive({ message: 'Estimated cost must be a positive number' }),
      ])
      .optional()
      .nullable()
      .transform((val) => {
        if (val === undefined || val === null || val === '') return null;
        return typeof val === 'number' ? val.toFixed(2) : val;
      }),
    plannedStartDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Planned start date must be in YYYY-MM-DD format' })
      .optional()
      .nullable(),
    plannedEndDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Planned end date must be in YYYY-MM-DD format' })
      .optional()
      .nullable(),
    boundary: projectBoundaryInputSchema.optional().nullable(),
    // Client-supplied createdBy, projectCode, id, status, etc. are rejected
    createdBy: z
      .never({ invalid_type_error: 'Client cannot specify createdBy' })
      .optional(),
    projectCode: z
      .never({ invalid_type_error: 'Client cannot specify projectCode' })
      .optional(),
    id: z
      .never({ invalid_type_error: 'Client cannot specify id' })
      .optional(),
    status: z
      .never({ invalid_type_error: 'Initial project status is managed by the server' })
      .optional(),
  })
  .refine(
    (data) => {
      if (data.plannedStartDate && data.plannedEndDate) {
        return new Date(data.plannedEndDate) >= new Date(data.plannedStartDate);
      }
      return true;
    },
    {
      message: 'Planned end date cannot be earlier than planned start date',
      path: ['plannedEndDate'],
    }
  );

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
