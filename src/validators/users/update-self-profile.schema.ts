import { z } from 'zod';

/**
 * Validator for PATCH /api/users/me/profile
 *
 * Allows authenticated users to update their own personal information:
 * name, email, and phone number.
 *
 * Rejects unauthorized privileged fields such as role, permissions,
 * administrativeUnitId, password_hash, or status.
 */
export const updateSelfProfileSchema = z
  .object({
    name: z
      .string({ required_error: 'Name is required' })
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(255, 'Name must not exceed 255 characters')
      .optional(),
    email: z
      .string()
      .trim()
      .email('Invalid email address')
      .max(255, 'Email must not exceed 255 characters')
      .toLowerCase()
      .optional(),
    phone: z
      .string()
      .trim()
      .max(50, 'Phone must not exceed 50 characters')
      .regex(/^[+0-9\s\-()]*$/, 'Phone number contains invalid characters')
      .nullable()
      .optional(),
  })
  .strict({
    message: 'Unauthorized field in request. Only personal profile fields (name, email, phone) can be modified.',
  })
  .refine(
    (data) => data.name !== undefined || data.email !== undefined || data.phone !== undefined,
    {
      message: 'At least one field (name, email, or phone) must be provided for update',
    }
  );

export type UpdateSelfProfileInput = z.infer<typeof updateSelfProfileSchema>;
