import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .min(1, 'Email is required')
    .max(255, 'Email must not exceed 255 characters')
    .email('Invalid email address format'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required')
    .max(128, 'Password must not exceed 128 characters'),
});

export type LoginInput = z.infer<typeof loginSchema>;
