import { StatusPill } from '@/components/ui';
import type { ArticleStatus } from '@/types/article';

/** Display labels + tones per `ArticleStatus`. Single source of truth. */
const STATUS_META: Readonly<
  Record<ArticleStatus, { label: string; tone: 'neutral' | 'warning' | 'success' | 'error' }>
> = {
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'In review', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  published: { label: 'Published', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'error' },
  unpublished: { label: 'Unpublished', tone: 'neutral' },
};

/**
 * Pill that renders the right tone + copy for an article status.
 * Reused in the drafts list, the submissions tracker, and the editor inbox.
 */
export function ArticleStatusBadge({ status }: { status: ArticleStatus }): JSX.Element {
  const { label, tone } = STATUS_META[status];
  return <StatusPill tone={tone}>{label}</StatusPill>;
}
