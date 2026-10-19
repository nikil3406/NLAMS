import { z } from 'zod';
import { PROJECT_TYPES, PROJECT_STATUSES } from '../../../db/schema/projects';

export const projectQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().trim().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  projectType: z.enum(PROJECT_TYPES).optional(),
  implementingAgencyId: z.string().uuid().optional(),
  administrativeUnitId: z.string().uuid().optional(),
  landAcquisitionRequired: z
    .preprocess((val) => {
      if (val === 'true' || val === true) return true;
      if (val === 'false' || val === false) return false;
      return undefined;
    }, z.boolean().optional())
    .optional(),
});

export type ProjectQueryInput = z.infer<typeof projectQuerySchema>;
