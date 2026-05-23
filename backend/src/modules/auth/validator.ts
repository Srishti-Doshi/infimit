/**
 * Zod schemas for the auth module's request bodies.
 *
 * Password policy per docs/10-security.md §10.3:
 *   - ≥ 10 chars
 *   - at least one letter
 *   - at least one number
 *
 * Email is lowercased + trimmed at the boundary so the partial unique index
 * on the users collection sees a normalised value.
 */
import { z } from 'zod';

export const passwordSchema = z
  .string({ required_error: 'Password is required' })
  .min(10, 'Password must be at least 10 characters')
  .max(255, 'Password must be at most 255 characters')
  .regex(/[A-Za-z]/, 'Password must include at least one letter')
  .regex(/[0-9]/, 'Password must include at least one number');

export const emailSchema = z
  .string({ required_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .email('Invalid email address');

export const registerBodySchema = z
  .object({
    role: z.enum(['reader', 'author']),
    name: z.string().trim().min(1, 'Name is required').max(255),
    email: emailSchema,
    password: passwordSchema,
    organisationSlug: z.string().trim().toLowerCase().optional(),
  })
  .refine(
    (data) =>
      data.role !== 'author' ||
      (typeof data.organisationSlug === 'string' && data.organisationSlug.length > 0),
    {
      message: 'organisationSlug is required when role is "author"',
      path: ['organisationSlug'],
    },
  );

export type RegisterBody = z.infer<typeof registerBodySchema>;

/**
 * Login body — password is only checked for non-empty here; we don't echo the
 * strength rules to a login form (the user's existing password may be older
 * than the current policy, and we never want to leak policy specifics to a
 * possible attacker probing email enumeration).
 */
export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required'),
});

export type LoginBody = z.infer<typeof loginBodySchema>;

/**
 * Verify-email body — accepts the signed JWT we issued at registration.
 * The service validates signature + purpose claim before consuming.
 */
export const verifyEmailBodySchema = z.object({
  token: z.string({ required_error: 'token is required' }).min(1, 'token is required'),
});

export type VerifyEmailBody = z.infer<typeof verifyEmailBodySchema>;

/**
 * Forgot-password body — accepts an email. The service intentionally returns
 * the same response for "user exists" and "user doesn't exist" to prevent
 * email enumeration via response timing or shape.
 */
export const forgotPasswordBodySchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>;

/**
 * Reset-password body — token from the email, plus the new password (subject
 * to the full strength policy).
 */
export const resetPasswordBodySchema = z.object({
  token: z.string({ required_error: 'token is required' }).min(1, 'token is required'),
  password: passwordSchema,
});

export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;
