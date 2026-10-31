import { z } from 'zod';

// Password requirement from RULES.md:
// "more than 8 characters (so minimum 9), at least one uppercase, one lowercase, one special character"
export const passwordSchema = z
  .string({ required_error: 'Password is required.' })
  .min(9, 'Password must be more than 8 characters (minimum 9 characters).')
  .max(100, 'Password must not exceed 100 characters.')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character.');

export const emailSchema = z
  .string({ required_error: 'Email is required.' })
  .trim()
  .toLowerCase()
  .email('Please provide a valid email address.')
  .max(255, 'Email must not exceed 255 characters.');

export const signupSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    name: z.string({ required_error: 'Full name or company name is required.' }).trim().min(2, 'Name must be at least 2 characters.').max(255),
    company: z.string().trim().max(255).optional(),
    phone: z.string().trim().max(50).optional(),
    street: z.string().trim().max(255).optional(),
    city: z.string().trim().max(100).optional(),
    state: z.string().trim().max(100).optional(),
    postalCode: z.string().trim().max(20).optional(),
    country: z.string().trim().max(100).optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string({ required_error: 'Password is required.' }).min(1, 'Password is required.'),
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z.string({ required_error: 'Reset token is required.' }).min(1, 'Reset token is required.'),
    newPassword: passwordSchema,
  })
  .strict();

export const createStaffSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    name: z.string({ required_error: 'Staff name is required.' }).trim().min(2, 'Name must be at least 2 characters.').max(255),
  })
  .strict();

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

