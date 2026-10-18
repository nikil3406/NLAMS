import { z } from 'zod';

export const assignRoleSchema = z
  .object({
    roleId: z
      .string({ required_error: 'Role ID is required' })
      .uuid('Invalid role ID format'),
  })
  .strict();

export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
