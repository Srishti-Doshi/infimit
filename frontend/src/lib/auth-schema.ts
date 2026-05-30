import { z } from 'zod';

/**
 * Client-side auth schemas. These mirror the backend's Zod rules
 * (backend/src/modules/auth/validator.ts) so the form never submits something
 * the API would reject — with one deliberate asymmetry on login (see below).
 */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'));

/**
 * Strong-password policy (docs/10-security.md §10.3): ≥10 chars, ≥1 letter,
 * ≥1 number. Used for register + reset — anywhere a NEW password is set.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number');

/**
 * Login intentionally does NOT enforce the strength policy — only non-empty.
 * An existing user's password may predate the current policy, and echoing the
 * rules on a login form leaks policy detail to anyone probing accounts. This
 * matches the backend's login validator, which checks `min(1)` only.
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Display name shown on the public profile / author byline. */
export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(120, 'Name is too long');

/**
 * Reader sign-up. Scope is deliberately readers-only for now: the backend
 * accepts a `role` field, but the design's signup form has no role/org/mobile
 * controls and the institutional/author onboarding lives in a separate flow.
 */
export const readerRegisterSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export type ReaderRegisterInput = z.infer<typeof readerRegisterSchema>;

/** Forgot-password: just an email. Backend always returns 200 (anti-enumeration). */
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/** Reset-password: new password + confirm. The `token` comes from the URL, not the form. */
export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * Profile edit. Backend `PATCH /users/me` accepts `name` (and `slug` for
 * authors — deferred for now). Mirrors that surface.
 */
export const updateProfileSchema = z.object({
  name: nameSchema,
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
