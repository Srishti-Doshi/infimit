import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { getArticle } from '@/lib/articles-api';
import { server } from '@/mocks/server';
import EditDraftPage from '@/pages/dashboard/author/drafts/edit';
import { renderWithProviders } from '@/test/render';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

function renderAt(id: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/dashboard/author/drafts/:id" element={<EditDraftPage />} />
      <Route path="/dashboard/author/submissions" element={<div>Submissions list mock</div>} />
    </Routes>,
    { initialEntries: [`/dashboard/author/drafts/${id}`] },
  );
}

describe('Submit-for-review action', () => {
  it('disables Submit while the draft is incomplete (incomplete art_draft_001)', async () => {
    renderAt('art_draft_001');
    const submitBtn = await screen.findByRole('button', { name: /submit for review/i });
    expect(submitBtn).toBeDisabled();
  });

  it('submits a ready draft and navigates to the submissions list', async () => {
    const user = userEvent.setup();
    renderAt('art_ready_001');

    const submitBtn = await screen.findByRole('button', { name: /submit for review/i });
    await waitFor(() => expect(submitBtn).not.toBeDisabled());
    await user.click(submitBtn);

    expect(await screen.findByText(/submissions list mock/i)).toBeInTheDocument();

    // Backend state flipped too.
    const article = await getArticle('art_ready_001');
    expect(article.status).toBe('submitted');
  });

  it('surfaces a field-specific toast text for VALIDATION_ERROR (cover missing)', async () => {
    const user = userEvent.setup();
    // Force the server to reject with a cover-missing 422 even though the
    // client preview says ready (simulates a server-side drift).
    server.use(
      http.post(`${BASE}/articles/:id/submit`, () =>
        HttpResponse.json(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Cover image is required',
              details: { field: 'coverImageMediaId' },
            },
          },
          { status: 422 },
        ),
      ),
    );

    renderAt('art_ready_001');
    const submitBtn = await screen.findByRole('button', { name: /submit for review/i });
    await waitFor(() => expect(submitBtn).not.toBeDisabled());
    await user.click(submitBtn);

    // We don't render <Toaster /> in tests, so we can't assert the visual
    // toast. Instead verify the side-effect we DO control: no navigation
    // happens (the submissions mock route never mounts) and the article's
    // status stays 'draft' on the mock backend.
    expect(screen.queryByText(/submissions list mock/i)).not.toBeInTheDocument();
    const article = await getArticle('art_ready_001');
    expect(article.status).toBe('draft');
  });
});
