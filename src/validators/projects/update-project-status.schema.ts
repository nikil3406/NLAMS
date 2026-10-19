import { z } from 'zod';
import { PROJECT_STATUSES } from '../../../db/schema/projects';

export const updateProjectStatusSchema = z.object({
  status: z.enum(PROJECT_STATUSES, {
    required_error: 'Target status is required',
    invalid_type_error: `Status must be one of: ${PROJECT_STATUSES.join(', ')}`,
  }),
  reason: z.string().trim().max(500).optional(),
});

export type UpdateProjectStatusInput = z.infer<typeof updateProjectStatusSchema>;
