import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { server } from '@/mocks/server';
import { getArticle } from '@/lib/articles-api';
import { mockDrafts } from '@/mocks/fixtures';
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

  // Pins #100 — pre-fix the autosave PATCHed every field on every tick,
  // including the (~5-20 KB) body even on a title-only edit. The fix
  // tracks a `lastSavedRef` snapshot and only sends fields that diverged
  // from it.
  it('autosaves only the changed fields after a title-only edit (partial diff)', async () => {
    const patchBodies: unknown[] = [];
    server.use(
      http.patch(`${BASE}/articles/:id`, async ({ request }) => {
        const body = await request.json();
        patchBodies.push(body);
        // Echo the request shape back with a bumped version so the
        // composer's local state advances correctly.
        const incoming = body as Record<string, unknown>;
        return HttpResponse.json({
          success: true,
          data: {
            article: {
              ...mockDrafts[0],
              ...incoming,
              version: ((incoming.version as number | undefined) ?? 0) + 1,
            },
          },
        });
      }),
    );

    renderAt('art_draft_001');

    const title = await screen.findByDisplayValue(/untitled draft about campus accessibility/i);
    fireEvent.change(title, {
      target: { value: 'Untitled draft about campus accessibility [partial-diff]' },
    });

    await waitFor(() => expect(patchBodies.length).toBeGreaterThan(0), {
      timeout: 6000,
      interval: 200,
    });

    const sent = patchBodies[0] as Record<string, unknown>;
    // Must include the changed title + the version token for OCC.
    expect(sent.title).toMatch(/\[partial-diff\]/);
    expect(typeof sent.version).toBe('number');
    // Must NOT include unchanged fields — this is the #100 fix.
    expect(sent).not.toHaveProperty('subtitle');
    expect(sent).not.toHaveProperty('category');
    expect(sent).not.toHaveProperty('tags');
    expect(sent).not.toHaveProperty('body');
    expect(sent).not.toHaveProperty('plainText');
    expect(sent).not.toHaveProperty('coverImageMediaId');
  }, 10000);

  it('shows the rejection banner with reason when article.status is rejected (#49)', async () => {
    const rejectedDraft = {
      ...mockDrafts[0]!,
      status: 'rejected' as const,
      rejectionReason:
        'Body is too short on context. Please add 2-3 paragraphs on the methodology before re-submitting.',
      version: mockDrafts[0]!.version + 1,
    };
    server.use(
      http.get(`${BASE}/articles/:id`, () =>
        HttpResponse.json({ success: true, data: { article: rejectedDraft } }),
      ),
    );

    renderAt('art_draft_001');

    expect(await screen.findByText(/an editor requested revisions/i)).toBeInTheDocument();
    expect(screen.getByText(/body is too short on context/i)).toBeInTheDocument();
    expect(
      screen.getByText(/make the requested changes and re-submit when ready/i),
    ).toBeInTheDocument();
  });
});
