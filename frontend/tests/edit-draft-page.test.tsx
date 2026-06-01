import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { server } from '@/mocks/server';
import { getArticle } from '@/lib/articles-api';
import EditDraftPage from '@/pages/dashboard/author/drafts/edit';
import { renderWithProviders } from '@/test/render';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

/** Mount the edit page under a :id route so `useParams` resolves correctly. */
function renderAt(id: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/dashboard/author/drafts/:id" element={<EditDraftPage />} />
    </Routes>,
    { initialEntries: [`/dashboard/author/drafts/${id}`] },
  );
}

describe('<EditDraftPage>', () => {
  it('loads an existing draft into the form', async () => {
    renderAt('art_draft_001');

    // Title is in the form pre-filled from the seeded mock.
    expect(
      await screen.findByDisplayValue(/untitled draft about campus accessibility/i),
    ).toBeInTheDocument();

    // Status badge renders.
    expect(screen.getByText(/^Draft$/)).toBeInTheDocument();
  });

  it('auto-saves the title after the debounce window', async () => {
    renderAt('art_draft_001');

    const title = await screen.findByDisplayValue(/untitled draft about campus accessibility/i);
    fireEvent.change(title, {
      target: { value: 'Untitled draft about campus accessibility [updated]' },
    });

    // Assert via the server side: the mock PATCH bumps the article in
    // mockDraftsState, so re-fetching it should show the new title and a
    // bumped version. This avoids depending on UI indicator timing.
    await waitFor(
      async () => {
        const article = await getArticle('art_draft_001');
        expect(article.title).toMatch(/\[updated\]/);
        expect(article.version).toBeGreaterThan(3);
      },
      { timeout: 6000, interval: 200 },
    );
  }, 10000);

  it('surfaces a conflict banner when the server returns VERSION_CONFLICT', async () => {
    const user = userEvent.setup();
    server.use(
      http.patch(`${BASE}/articles/:id`, () =>
        HttpResponse.json(
          {
            success: false,
            error: {
              code: 'VERSION_CONFLICT',
              message: 'Stale version',
              details: { currentVersion: 99 },
            },
          },
          { status: 409 },
        ),
      ),
    );

    renderAt('art_draft_001');
    const title = await screen.findByDisplayValue(/untitled draft about campus accessibility/i);
    await user.type(title, '!');

    expect(
      await screen.findByText(/this draft was edited elsewhere/i, undefined, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload draft/i })).toBeInTheDocument();
  });
});
