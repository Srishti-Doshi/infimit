/**
 * Identity domain types (Subphase 2).
 *
 * Shapes mirror what the backend actually returns — verified against
 * `backend/tests/integration/{auth,users}.test.ts`, not the prose in
 * docs/05-api-documentation.md. The serialized user never includes
 * `passwordHash` (the backend strips it).
 */

export type Role = 'reader' | 'author' | 'editor' | 'admin';

/**
 * Authenticated user as returned by `/auth/login`, `/auth/register`,
 * `/auth/me`, and `/users/me`. Core identity fields are always present;
 * the rest are role- or profile-dependent.
 */
export interface User {
  id: string;
  role: Role;
  name: string;
  email: string;
  slug?: string | null;
  avatarUrl?: string | null;
  bio?: string;
  isEmailVerified?: boolean;
  organisationId?: string | null;
}

/** Access token + its lifetime in seconds (`expiresIn`), per the auth contract. */
export interface AuthTokens {
  accessToken: string;
  expiresIn: number;
}

/** Body of a successful login/register: the user plus a fresh token pair. */
export interface AuthPayload extends AuthTokens {
  user: User;
}

/**
 * `/auth/refresh` rotates the token pair. It always returns a new
 * `accessToken`; `user` is included so a cold rehydrate can repopulate the
 * store from the refresh cookie alone.
 */
export interface RefreshPayload {
  accessToken: string;
  expiresIn?: number;
  user?: User;
}
