/**
 * Cross-module shared types — kept thin in Subphase 1.
 * Module-local DTOs live in their respective `modules/<x>/index.ts`.
 */

export type UserRole = 'reader' | 'author' | 'editor' | 'admin';

/**
 * Auth context attached to req.user by the authGuard middleware.
 * Skeleton in Subphase 1 — populated by Subphase 2.
 */
export interface AuthContext {
  id: string;
  role: UserRole;
  organisationId?: string;
  email: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}
