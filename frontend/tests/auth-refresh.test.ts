import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';

import { apiClient } from '@/lib/api-client';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/store/auth-store';

/**
 * Exercises the subtle part of the api-client: the single-flight 401→refresh
 * interceptor. Verifies (a) N concurrent 401s trigger exactly ONE refresh and
 * each original request is replayed with the rotated token, and (b) a failed
 * refresh clears the session.
 */
const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

afterEach(() => {
  useAuthStore.getState().clear();
});

describe('apiClient — single-flight 401 refresh', () => {
  it('refreshes once for concurrent 401s and replays each request with the new token', async () => {
    useAuthStore.getState().setAccessToken('stale-token');
    let refreshCalls = 0;

    server.use(
      http.post(`${BASE}/auth/refresh`, () => {
        refreshCalls += 1;
        return HttpResponse.json({ success: true, data: { accessToken: 'fresh-token' } });
      }),
      http.get(`${BASE}/users/me`, ({ request }) => {
        if (request.headers.get('authorization') === 'Bearer fresh-token') {
          return HttpResponse.json({ success: true, data: { user: { id: 'u1' } } });
        }
        return HttpResponse.json(
          { success: false, error: { code: 'UNAUTHORIZED', message: 'expired' } },
          { status: 401 },
        );
      }),
    );

    const responses = await Promise.all([
      apiClient.get('/users/me'),
      apiClient.get('/users/me'),
      apiClient.get('/users/me'),
    ]);

    expect(refreshCalls).toBe(1);
    responses.forEach((res) => expect(res.status).toBe(200));
    expect(useAuthStore.getState().accessToken).toBe('fresh-token');
  });

  it('clears the session when the refresh itself fails', async () => {
    useAuthStore.getState().setAccessToken('stale-token');

    server.use(
      http.get(`${BASE}/users/me`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'UNAUTHORIZED', message: 'expired' } },
          { status: 401 },
        ),
      ),
      http.post(`${BASE}/auth/refresh`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'INVALID_TOKEN', message: 'replayed' } },
          { status: 401 },
        ),
      ),
    );

    await expect(apiClient.get('/users/me')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  // 403 = "valid token, no permission" — must NOT trigger refresh or clear
  // the session. Pins down the FE-4d follow-up deferred from PR #5: previous
  // versions of the interceptor used to bounce 403s to /auth/login like a
  // session loss, which broke role-denial UX.
  it('does NOT clear the session on a 403 FORBIDDEN response', async () => {
    useAuthStore.getState().setAccessToken('valid-token');
    let refreshCalls = 0;

    server.use(
      http.post(`${BASE}/auth/refresh`, () => {
        refreshCalls += 1;
        return HttpResponse.json({ success: true, data: { accessToken: 'fresh' } });
      }),
      http.get(`${BASE}/users/editors`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'not allowed' } },
          { status: 403 },
        ),
      ),
    );

    await expect(apiClient.get('/users/editors')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(refreshCalls).toBe(0);
    expect(useAuthStore.getState().accessToken).toBe('valid-token');
  });
});
