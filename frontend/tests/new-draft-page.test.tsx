import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';

import { server } from '@/mocks/server';
import NewDraftPage from '@/pages/dashboard/author/drafts/new';
import { renderWithProviders } from '@/test/render';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

/**
 * Happy-path test for the new-draft composer. Renders inside its own Routes
 * harness so we can assert the post-create navigation to /drafts/:id by
 * detecting the stub element rendered at that route.
 */
describe('<NewDraftPage>', () => {
  it('creates a draft and navigates to its edit route', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/dashboard/author/drafts/new" element={<NewDraftPage />} />
        <Route
          path="/dashboard/author/drafts/:id"
          element={<div data-testid="edit-stub">Edit page (post-create stub)</div>}
        />
      </Routes>,
      { initialEntries: ['/dashboard/author/drafts/new'] },
    );

    await user.type(screen.getByLabelText('Title'), 'Notes on campus internet access');

    // Category select — pre-defaults to campus_news, leave it.
    // Add one tag.
    const tagInput = screen.getByPlaceholderText(/add a tag/i);
    await user.type(tagInput, 'access{Enter}');
    expect(screen.getByText('access')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /save draft/i }));

    // After success, NewDraftPage navigates to /drafts/:id — the stub appears.
    await waitFor(() => expect(screen.getByTestId('edit-stub')).toBeInTheDocument());
  });

  // Pins #101 — pre-fix the new-draft page was explicit-save only, so a
  // user typing into the form had nothing persisted until they explicitly
  // clicked Save. Closing the tab mid-compose lost everything. The fix
  // auto-POSTs the draft after the title hits non-empty + the autosave
  // debounce window expires.
  it('auto-creates the draft after the autosave debounce once title is non-empty', async () => {
    const posts: unknown[] = [];
    server.use(
      http.post(`${BASE}/articles`, async ({ request }) => {
        const body = await request.json();
        posts.push(body);
        return HttpResponse.json(
          {
            success: true,
            data: {
              article: {
                id: 'art_autosaved_001',
                title: (body as { title?: string }).title ?? '',
                version: 0,
                status: 'draft',
              },
            },
          },
          { status: 201 },
        );
      }),
    );

    renderWithProviders(<NewDraftPage />, {
      initialEntries: ['/dashboard/author/drafts/new'],
    });

    // `fireEvent.change` flips the input value in a single tick — autosave's
    // debounce timer starts here.
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Auto-saved title' },
    });

    await waitFor(() => expect(posts.length).toBeGreaterThan(0), {
      timeout: 6000,
      interval: 200,
    });

    const sent = posts[0] as Record<string, unknown>;
    expect(sent.title).toBe('Auto-saved title');
    // URL was silently swapped to the captured id (no React Router navigation).
    expect(window.location.pathname).toBe('/dashboard/author/drafts/art_autosaved_001');
  }, 10000);

  it('blocks submission and surfaces a title error when title is missing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewDraftPage />, {
      initialEntries: ['/dashboard/author/drafts/new'],
    });

    await user.click(screen.getByRole('button', { name: /save draft/i }));

    expect(await screen.findByText(/title is required/i)).toBeInTheDocument();
  });
});
