import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ApprovalQueueRow } from '@/components/editor/approval-queue-row';
import type { Article } from '@/types/article';

/**
 * `<ApprovalQueueRow>` is a presentational row. Tests check:
 *  - All five columns project the right field (title / author / category /
 *    submitted timestamp / status badge).
 *  - The title links to the preview route under `/dashboard/editor/...`.
 *  - Sensible fallbacks: untitled label, "—" for missing author, falls back
 *    to `updatedAt` when `submittedAt` is null.
 */
function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: 'art_test_001',
    title: 'A submission about campus housing reform',
    subtitle: 'Survey across four institutions',
    body: '<p>x</p>',
    plainText: 'x'.repeat(400),
    coverImageUrl: null,
    coverImageMediaId: null,
    media: [],
    category: 'campus_news',
    subcategory: null,
    tags: ['campus', 'housing'],
    location: null,
    authorId: 'usr_author_001',
    author: { id: 'usr_author_001', name: 'Anika Rao' },
    organisationId: null,
    editorId: null,
    status: 'submitted',
    rejectionReason: null,
    version: 4,
    submittedAt: '2026-06-01T09:00:00.000Z',
    publishedAt: null,
    approvedAt: null,
    createdAt: '2026-05-25T11:00:00.000Z',
    updatedAt: '2026-06-01T09:00:00.000Z',
    ...overrides,
  };
}

/** Helper — rows render inside a <table><tbody>, so wrap accordingly. */
function renderRow(article: Article): ReturnType<typeof render> {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <table>
        <tbody>
          <ApprovalQueueRow article={article} />
        </tbody>
      </table>
    </MemoryRouter>,
  );
}

describe('<ApprovalQueueRow>', () => {
  it('projects title, author, category, and status', () => {
    renderRow(makeArticle());

    expect(
      screen.getByRole('link', { name: /a submission about campus housing reform/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/anika rao/i)).toBeInTheDocument();
    expect(screen.getByText(/campus news/i)).toBeInTheDocument();
    expect(screen.getByText(/in review/i)).toBeInTheDocument();
  });

  it('links the title to the preview route at /dashboard/editor/approvals/:id', () => {
    renderRow(makeArticle({ id: 'art_xyz_42' }));
    const link = screen.getByRole('link', { name: /a submission about/i });
    expect(link).toHaveAttribute('href', '/dashboard/editor/approvals/art_xyz_42');
  });

  it('falls back gracefully when subtitle / author are missing', () => {
    renderRow(makeArticle({ subtitle: '', author: undefined, title: '' }));
    // Untitled label appears in place of empty title.
    expect(screen.getByRole('link', { name: /untitled submission/i })).toBeInTheDocument();
    // Em-dash sits in the author column when no author projection.
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
