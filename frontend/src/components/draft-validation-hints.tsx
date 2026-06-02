import { CheckCircle2, Circle } from 'lucide-react';

import { Card, CardBody } from '@/components/ui';
import { cn } from '@/lib/cn';
import { SUBMIT_MIN_PLAIN_TEXT, submitReadiness } from '@/lib/articles-schema';
import type { Article } from '@/types/article';

interface DraftValidationHintsProps {
  draft: Partial<Article>;
}

/**
 * Right-rail checklist mirroring `submitReadiness`. Each row is either green
 * (rule met) or muted (rule outstanding). Live-updates from the form's local
 * state — pure render, no fetching.
 *
 * Pairs with the Submit-for-review button (Day 11 wires the action; this
 * file feeds the disabled-until-ready gating).
 */
export function DraftValidationHints({ draft }: DraftValidationHintsProps): JSX.Element {
  const readiness = submitReadiness(draft);
  const plainTextLen = (draft.plainText ?? '').length;
  const tagCount = draft.tags?.length ?? 0;

  const checks: ReadonlyArray<{ key: keyof typeof readiness; label: string; ok: boolean }> = [
    {
      key: 'title',
      label: 'Title is set (≤ 200 characters)',
      ok: readiness.title,
    },
    {
      key: 'body',
      label: `Body has at least ${SUBMIT_MIN_PLAIN_TEXT} characters (${plainTextLen} so far)`,
      ok: readiness.body,
    },
    {
      key: 'category',
      label: 'Category selected',
      ok: readiness.category,
    },
    {
      key: 'cover',
      label: 'Cover image attached',
      ok: readiness.cover,
    },
    {
      key: 'tags',
      label: `Between 1 and 10 tags (${tagCount} so far)`,
      ok: readiness.tags,
    },
  ];

  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <h2 className="font-display text-body-xl font-semibold text-ink-primary">
          Ready to submit?
        </h2>
        <p className="text-body-sm text-ink-secondary">
          All five must be green before the Submit button enables.
        </p>
        <ul className="mt-1 flex flex-col gap-2">
          {checks.map((c) => (
            <li key={c.key} className="flex items-start gap-2">
              {c.ok ? (
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0 text-status-success-text"
                  aria-hidden="true"
                />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-ink-tertiary" aria-hidden="true" />
              )}
              <span
                className={cn('text-body-sm', c.ok ? 'text-ink-primary' : 'text-ink-secondary')}
              >
                {c.label}
              </span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
