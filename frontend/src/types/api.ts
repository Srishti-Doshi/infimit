/**
 * Backend response envelope shape (per docs/05-api-documentation.md §5 and
 * docs/02-system-architecture.md §2.5).
 *
 * Every backend response is either an `ApiSuccess<T>` (with `data` and
 * optional pagination `meta`) or an `ApiError` (with a typed error code).
 * The discriminator is `success`.
 */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/**
 * Type guard — narrows an `ApiResponse<T>` to its success branch.
 */
export function isApiSuccess<T>(response: ApiResponse<T>): response is ApiSuccess<T> {
  return response.success === true;
}
