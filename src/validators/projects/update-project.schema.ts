import { z } from 'zod';
import { PROJECT_TYPES } from '../../../db/schema/projects';

export const updateProjectSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(3, { message: 'Project name must be at least 3 characters' })
      .max(255, { message: 'Project name must not exceed 255 characters' })
      .optional(),
    description: z
      .string()
      .trim()
      .max(2000, { message: 'Description must not exceed 2000 characters' })
      .optional()
      .nullable(),
    projectType: z
      .enum(PROJECT_TYPES, {
        invalid_type_error: `Project type must be one of: ${PROJECT_TYPES.join(', ')}`,
      })
      .optional(),
    implementingAgencyId: z
      .string()
      .uuid({ message: 'Invalid implementing agency UUID' })
      .optional(),
    administrativeUnitId: z
      .string()
      .uuid({ message: 'Invalid administrative unit UUID' })
      .optional(),
    landAcquisitionRequired: z.boolean().optional(),
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
        if (val === undefined) return undefined;
        if (val === null || val === '') return null;
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
    // Strictly forbidden fields in general update:
    status: z
      .never({ invalid_type_error: 'Status cannot be updated through the general update endpoint' })
      .optional(),
    projectCode: z
      .never({ invalid_type_error: 'Project code is immutable' })
      .optional(),
    id: z
      .never({ invalid_type_error: 'Project ID is immutable' })
      .optional(),
    createdBy: z
      .never({ invalid_type_error: 'Project creator is immutable' })
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

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
