import { z } from 'zod';

export const listUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
  roleId: z.string().uuid().optional(),
  administrativeUnitId: z.string().uuid().optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersSchema>;
