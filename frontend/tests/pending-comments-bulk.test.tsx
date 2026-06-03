import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { server } from '@/mocks/server';
import PendingCommentsPage from '@/pages/dashboard/editor/comments/pending';
import { renderWithProviders } from '@/test/render';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

/**
 * Bulk moderation flow. Default MSW seeds 3 pending comments
 * (cmt_003 / cmt_004 / cmt_005) — these tests assert the
 * select-all + batch-approve flow against them.
 */

describe('<PendingCommentsPage> bulk moderation', () => {
  it('select-all + Approve all fires N serial approve requests and clears the queue', async () => {
    const user = userEvent.setup();

    const approveCalls: string[] = [];
    server.use(
      http.post(`${BASE}/comments/:id/approve`, ({ params }) => {
        approveCalls.push(String(params.id));
        return HttpResponse.json({
          success: true,
          data: { comment: { id: params.id, status: 'approved' } },
        });
      }),
    );

    renderWithProviders(<PendingCommentsPage />);

    // Wait for the default-seeded pending comments to render.
    await screen.findByText(/disagree with the methodology/i);

    // Three pending rows + the header "select all" checkbox = 4 checkboxes.
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThanOrEqual(4);

    // First checkbox is the header select-all.
    await user.click(checkboxes[0]!);

    // Bulk action bar appears with "3 comments selected".
    expect(await screen.findByText(/3 comments selected/i)).toBeInTheDocument();

    // Approve all kicks off the serial loop.
    await user.click(screen.getByRole('button', { name: /approve all/i }));

    // Backend got hit once per selected id.
    await waitFor(() => expect(approveCalls.length).toBe(3), { timeout: 2000 });

    // Summary toast surfaces "3 comments approved." — but toasts render
    // outside the page tree, so just verify the bar disappeared (selection
    // cleared after a successful batch).
    await waitFor(() => expect(screen.queryByText(/comments selected/i)).not.toBeInTheDocument(), {
      timeout: 2000,
    });
  });

  it('continues through partial failures and reports the split', async () => {
    const user = userEvent.setup();

    // Make the first comment fail, the rest succeed.
    let firstSeen = false;
    server.use(
      http.post(`${BASE}/comments/:id/approve`, () => {
        if (!firstSeen) {
          firstSeen = true;
          return HttpResponse.json(
            { success: false, error: { code: 'INTERNAL_ERROR', message: 'oops' } },
            { status: 500 },
          );
        }
        return HttpResponse.json({ success: true, data: { comment: { id: 'x' } } });
      }),
    );

    // Spy on the warning toast to confirm the partial-failure summary fires.
    const toastModule = await import('@/components/ui');
    const warnSpy = vi.spyOn(toastModule.toast, 'warning').mockImplementation(() => '');

    renderWithProviders(<PendingCommentsPage />);
    await screen.findByText(/disagree with the methodology/i);

    await user.click(screen.getAllByRole('checkbox')[0]!);
    await user.click(screen.getByRole('button', { name: /approve all/i }));

    await waitFor(() => expect(warnSpy).toHaveBeenCalled(), { timeout: 2000 });
    // 1 failed, 2 succeeded out of 3 → warning toast shows the split.
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/2 approved, 1 failed/i);

    warnSpy.mockRestore();
  });
});
