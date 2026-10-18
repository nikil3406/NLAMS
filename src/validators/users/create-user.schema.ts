import { z } from 'zod';

export const createUserSchema = z.object({
  name: z
    .string({ required_error: 'Name is required' })
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(255, 'Name must not exceed 255 characters'),
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email('Invalid email address')
    .max(255, 'Email must not exceed 255 characters')
    .toLowerCase(),
  phone: z
    .string()
    .trim()
    .max(50, 'Phone must not exceed 50 characters')
    .regex(/^[+0-9\s\-()]*$/, 'Phone number contains invalid characters')
    .optional()
    .nullable(),
  roleId: z
    .string({ required_error: 'Role is required' })
    .uuid('Invalid role ID format'),
  administrativeUnitId: z
    .string({ required_error: 'Administrative unit is required' })
    .uuid('Invalid administrative unit ID format'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
