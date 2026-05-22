import { QueryClient } from '@tanstack/react-query';

/**
 * Factory for the app's shared TanStack QueryClient.
 *
 * Defaults are tuned for an editorial product:
 *   - `staleTime: 30s` — articles don't churn every keystroke; trade
 *      freshness for fewer requests during reading.
 *   - `gcTime: 5m` — keep cached queries around for back/forward navigation
 *     so re-visiting a recent article is instant.
 *   - `refetchOnWindowFocus: false` — would re-fetch on every tab switch
 *     and feels janky in a reader UI.
 *   - `retry`: only retry on transient failures, skip 4xx (except 408/429).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          const status =
            typeof error === 'object' && error !== null && 'details' in error
              ? ((error as { details?: { status?: number } }).details?.status ?? 0)
              : 0;
          // Don't retry client errors except request-timeout and rate-limit.
          if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
            return false;
          }
          return failureCount < 2;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}
