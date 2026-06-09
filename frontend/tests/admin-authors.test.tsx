import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { server } from '@/mocks/server';
import AdminAuthorsPage from '@/pages/dashboard/admin/authors';
import { useAuthStore } from '@/store/auth-store';
import { renderWithProviders } from '@/test/render';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'admin1', name: 'Anita Admin', email: 'admin@infimit.dev', role: 'admin' },
    accessToken: 'admin-tok',
    isHydrated: true,
  });
});

afterEach(() => {
  useAuthStore.setState({ user: null, accessToken: null, isHydrated: false });
});

function authorFixture(overrides: { id?: string; name?: string; email?: string; slug?: string }) {
  return {
    id: overrides.id ?? 'usr_author_001',
    name: overrides.name ?? 'Priya Sharma',
    email: overrides.email ?? 'priya@infimit.com',
    role: 'author' as const,
    slug: overrides.slug ?? 'priya-sharma',
    isActive: true,
  };
}

describe('<AdminAuthorsPage>', () => {
  it('lists existing authors', async () => {
    server.use(
      http.get(`${BASE}/users/authors`, () =>
        HttpResponse.json({
          success: true,
          data: { total: 1, items: [authorFixture({})], page: 1, limit: 20 },
        }),
      ),
    );

    renderWithProviders(<AdminAuthorsPage />, { initialEntries: ['/dashboard/admin/authors'] });

    expect(await screen.findByText('Priya Sharma')).toBeInTheDocument();
    expect(screen.getByText('priya@infimit.com')).toBeInTheDocument();
    expect(screen.getByText('priya-sharma')).toBeInTheDocument();
  });

  it('creates a new author via the modal and refetches the list', async () => {
    const user = userEvent.setup();
    let registerCalledWith: Record<string, unknown> | null = null;
    let registerHit = false;

    server.use(
      http.get(`${BASE}/users/authors`, () =>
        HttpResponse.json({
          success: true,
          data: {
            total: registerHit ? 1 : 0,
            items: registerHit ? [authorFixture({ name: 'New Author', email: 'new@infimit.dev' })] : [],
            page: 1,
            limit: 20,
          },
        }),
      ),
      http.post(`${BASE}/auth/register`, async ({ request }) => {
        registerCalledWith = (await request.json()) as Record<string, unknown>;
        registerHit = true;
        return HttpResponse.json(
          {
            success: true,
            data: {
              user: authorFixture({
                id: 'usr_author_new',
                name: 'New Author',
                email: 'new@infimit.dev',
              }),
              accessToken: 'token',
              expiresIn: 900,
            },
          },
          { status: 201 },
        );
      }),
    );

    renderWithProviders(<AdminAuthorsPage />, { initialEntries: ['/dashboard/admin/authors'] });

    await user.click(await screen.findByRole('button', { name: /create author/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'New Author');
    await user.type(within(dialog).getByLabelText('Email'), 'new@infimit.dev');
    await user.type(within(dialog).getByLabelText('Starter password'), 'Author12345!');
    await user.type(within(dialog).getByLabelText(/organisation slug/i), 'infimit-demo-college');
    await user.click(within(dialog).getByRole('button', { name: /^create author$/i }));

    await waitFor(() => expect(registerCalledWith).not.toBeNull());
    expect(registerCalledWith).toMatchObject({
      role: 'author',
      name: 'New Author',
      email: 'new@infimit.dev',
      organisationSlug: 'infimit-demo-college',
    });
    await waitFor(() => expect(screen.getByText('New Author')).toBeInTheDocument());
  });

  it('looks up by email, opens the role modal, and PATCHes the role', async () => {
    const user = userEvent.setup();
    let lookupQuery: string | null = null;
    let patchBody: Record<string, unknown> | null = null;
    let patchedId: string | null = null;

    server.use(
      http.get(`${BASE}/users/lookup`, ({ request }) => {
        const url = new URL(request.url);
        lookupQuery = url.searchParams.get('email');
        return HttpResponse.json({
          success: true,
          data: {
            user: {
              id: 'usr_reader_42',
              name: 'Reader Person',
              email: 'reader@example.com',
              role: 'reader',
            },
          },
        });
      }),
      http.patch(`${BASE}/users/:id/role`, async ({ request, params }) => {
        patchedId = String(params.id);
        patchBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          success: true,
          data: {
            user: {
              id: patchedId,
              name: 'Reader Person',
              email: 'reader@example.com',
              role: (patchBody as { role: string }).role,
            },
          },
        });
      }),
    );

    renderWithProviders(<AdminAuthorsPage />, { initialEntries: ['/dashboard/admin/authors'] });

    await user.click(await screen.findByRole('button', { name: /promote by email/i }));
    const lookupDialog = await screen.findByRole('dialog');
    await user.type(within(lookupDialog).getByLabelText('Email'), 'reader@example.com');
    await user.click(within(lookupDialog).getByRole('button', { name: /^find user$/i }));

    await waitFor(() => expect(lookupQuery).toBe('reader@example.com'));

    // Role-change modal now open. Default selection is 'author'.
    const roleDialog = await screen.findByRole('dialog');
    expect(within(roleDialog).getByText(/current role for/i)).toBeInTheDocument();
    await user.click(within(roleDialog).getByRole('button', { name: /^apply$/i }));

    await waitFor(() => expect(patchedId).toBe('usr_reader_42'));
    expect(patchBody).toEqual({ role: 'author' });
  });

  it('shows a 404 error inline when the email is not found', async () => {
    const user = userEvent.setup();

    server.use(
      http.get(`${BASE}/users/lookup`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'No active user' } },
          { status: 404 },
        ),
      ),
    );

    renderWithProviders(<AdminAuthorsPage />, { initialEntries: ['/dashboard/admin/authors'] });

    await user.click(await screen.findByRole('button', { name: /promote by email/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Email'), 'ghost@example.com');
    await user.click(within(dialog).getByRole('button', { name: /^find user$/i }));

    await waitFor(() =>
      expect(within(dialog).getByText(/no active user with that email/i)).toBeInTheDocument(),
    );
  });
});
