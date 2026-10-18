import { z } from 'zod';

/**
 * Validator for PATCH /api/users/[id]
 *
 * Enforces the core business rule:
 * Administrators may manage administrative authority (account status),
 * but are strictly prohibited from modifying personal information (name, email, phone)
 * after account creation.
 */
export const updateUserSchema = z
  .object({
    status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED'], {
      required_error: 'Account status is required',
      invalid_type_error: "Status must be 'ACTIVE', 'INACTIVE', or 'SUSPENDED'",
    }),
    name: z
      .never({
        invalid_type_error: 'Personal information (name) cannot be modified after account creation',
      })
      .optional(),
    email: z
      .never({
        invalid_type_error: 'Personal information (email) cannot be modified after account creation',
      })
      .optional(),
    phone: z
      .never({
        invalid_type_error: 'Personal information (phone) cannot be modified after account creation',
      })
      .optional(),
  })
  .strict({
    message: 'Unauthorized field update. Personal information cannot be modified after account creation.',
  });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
