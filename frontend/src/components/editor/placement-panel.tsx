import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Card, CardBody } from '@/components/ui';
import { updateArticlePlacement } from '@/lib/articles-api';
import type { PlacementInput } from '@/lib/articles-schema';
import { toastError } from '@/lib/error-messages';
import type { ApiError } from '@/types/api';
import type { Article, ArticlePlacement } from '@/types/article';

const DEFAULT_PLACEMENT: ArticlePlacement = {
  featured: false,
  trending: false,
  trail: false,
  priority: 0,
};

/**
 * 500ms after the last toggle / slider change, batch-PATCH the accumulated
 * field changes in a single request. Lets editors flip multiple toggles in
 * quick succession without firing N requests.
 */
const DEBOUNCE_MS = 500;

interface PlacementPanelProps {
  article: Article;
}

/**
 * `<PlacementPanel>` — collapsible editorial-surface controls.
 *
 * Visible iff `status === 'published'` (backend rejects placement edits on
 * non-published articles). Collapsed by default since most published
 * articles don't need placement tweaks; expanded explicitly when the editor
 * wants to feature / surface a piece.
 *
 * Optimistic UI: toggles update local state immediately, then debounce
 * 500ms before PATCHing. On 409 VERSION_CONFLICT or any other error,
 * local state rolls back to the last-known-good and a toast surfaces the
 * error. The version sent with each PATCH is read from a ref so concurrent
 * cache updates (e.g. publish/unpublish from a sibling tab) are picked up
 * on the next flush instead of dispatching with a stale token.
 */
export function PlacementPanel({ article }: PlacementPanelProps): JSX.Element | null {
  // Render-time guard — backend rejects non-published placement edits with
  // 422 INVALID_STATE, so don't render the panel at all in those states.
  if (article.status !== 'published') return null;

  return <PlacementPanelInner article={article} />;
}

function PlacementPanelInner({ article }: PlacementPanelProps): JSX.Element {
  const queryClient = useQueryClient();
  const initial = article.placement ?? DEFAULT_PLACEMENT;

  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<ArticlePlacement>(initial);

  const pendingRef = useRef<Partial<ArticlePlacement>>({});
  const lastGoodRef = useRef<ArticlePlacement>(initial);
  const versionRef = useRef<number>(article.version);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep version + last-known-good in sync with the server-truth article doc.
  // When TanStack Query swaps in a fresher copy (mutation success, refetch,
  // sibling-tab invalidation), this effect re-anchors the rollback target.
  useEffect(() => {
    const next = article.placement ?? DEFAULT_PLACEMENT;
    versionRef.current = article.version;
    lastGoodRef.current = next;
    // Reset local state ONLY when no edit is pending — otherwise an in-flight
    // optimistic toggle would get clobbered by an inbound refetch.
    if (Object.keys(pendingRef.current).length === 0) {
      setLocal(next);
    }
  }, [article.placement, article.version]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  const mutation = useMutation({
    mutationFn: (patch: PlacementInput) => updateArticlePlacement(article.id, patch),
    onSuccess: (updated) => {
      queryClient.setQueryData(['articles', article.id], updated);
      // useEffect above will re-anchor local + version + last-good from the
      // fresh article. pendingRef stays whatever it is — any later toggle
      // during the round-trip is correctly preserved.
      pendingRef.current = {};
    },
    onError: (error: ApiError['error']) => {
      // Rollback to last server-truth.
      setLocal(lastGoodRef.current);
      pendingRef.current = {};
      toastError(error);
      // Force a refetch for 409s so the next attempt uses the fresh version.
      if (error.code === 'VERSION_CONFLICT') {
        void queryClient.invalidateQueries({ queryKey: ['articles', article.id] });
      }
    },
  });

  function update<K extends keyof ArticlePlacement>(field: K, value: ArticlePlacement[K]): void {
    setLocal((prev) => ({ ...prev, [field]: value }));
    pendingRef.current = { ...pendingRef.current, [field]: value };
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, DEBOUNCE_MS);
  }

  function flush(): void {
    if (Object.keys(pendingRef.current).length === 0) return;
    const patch: PlacementInput = {
      ...pendingRef.current,
      version: versionRef.current,
    } as PlacementInput;
    mutation.mutate(patch);
  }

  return (
    <Card className="mt-6">
      <CardBody className="p-0">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-subtle"
        >
          <div>
            <h2 className="font-display text-body-lg font-semibold text-ink-primary">
              Editorial placement
            </h2>
            <p className="mt-0.5 text-body-sm text-ink-secondary">
              Featured / trending / trail flags + priority. <PlacementSummary placement={local} />
            </p>
          </div>
          {open ? (
            <ChevronDown className="h-5 w-5 shrink-0 text-ink-tertiary" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-5 w-5 shrink-0 text-ink-tertiary" aria-hidden="true" />
          )}
        </button>

        {open ? (
          <div className="border-t border-line px-5 py-4">
            <fieldset className="space-y-3" disabled={mutation.isPending}>
              <legend className="sr-only">Placement flags</legend>
              <Toggle
                id="placement-featured"
                label="Featured"
                description="Pin to the home hero rotation."
                checked={local.featured}
                onChange={(v) => update('featured', v)}
              />
              <Toggle
                id="placement-trending"
                label="Trending"
                description="Surface in the trending list ahead of view-based score."
                checked={local.trending}
                onChange={(v) => update('trending', v)}
              />
              <Toggle
                id="placement-trail"
                label="Trail"
                description="Show in section trail strips below the hero."
                checked={local.trail}
                onChange={(v) => update('trail', v)}
              />
            </fieldset>

            <div className="mt-5">
              <label
                htmlFor="placement-priority"
                className="flex items-baseline justify-between text-body-sm font-medium text-ink-primary"
              >
                <span>Priority</span>
                <span className="text-body-xs text-ink-tertiary">{local.priority} / 100</span>
              </label>
              {/*
               * Slider commit semantics (#47): `onChange` only updates local
               * visual state — the thumb tracks the cursor 1:1 without
               * firing a network call on every step. The PATCH is queued by
               * `update()` on RELEASE only (mouse-up / touch-end / key-up),
               * which then runs through the existing 500 ms debounce so a
               * follow-up toggle still batches into the same request.
               *
               * Pre-fix, a slow drag with natural pauses ≥500 ms fired one
               * PATCH per pause — observed as ~4 requests for a single 0→6
               * drag in QA.
               */}
              <input
                id="placement-priority"
                type="range"
                min={0}
                max={100}
                step={1}
                value={local.priority}
                disabled={mutation.isPending}
                onChange={(e) =>
                  setLocal((prev) => ({ ...prev, priority: Number(e.target.value) }))
                }
                onMouseUp={(e) => update('priority', Number((e.target as HTMLInputElement).value))}
                onTouchEnd={(e) => update('priority', Number((e.target as HTMLInputElement).value))}
                onKeyUp={(e) => update('priority', Number((e.target as HTMLInputElement).value))}
                className="mt-2 w-full accent-brand-red-500"
              />
              <p className="mt-1 text-body-xs text-ink-tertiary">
                Higher priority ranks above other featured articles in the same section.
              </p>
            </div>

            <p className="mt-4 text-body-xs text-ink-tertiary" aria-live="polite">
              {mutation.isPending ? 'Saving…' : 'Changes save automatically.'}
            </p>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

interface ToggleProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

function Toggle({ id, label, description, checked, onChange }: ToggleProps): JSX.Element {
  // jsx-a11y/label-has-associated-control can't introspect text inside the
  // nested layout divs of the label, so we set `aria-label` on the input
  // explicitly. Visible text remains via the divs; click target stays the
  // whole card thanks to `htmlFor`.
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 rounded-md border border-line p-3 transition-colors hover:bg-surface-subtle has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
    >
      <input
        id={id}
        type="checkbox"
        aria-label={label}
        aria-describedby={`${id}-desc`}
        className="mt-0.5 h-4 w-4 cursor-pointer accent-brand-red-500"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="min-w-0 flex-1">
        <div className="text-body-sm font-medium text-ink-primary">{label}</div>
        <div id={`${id}-desc`} className="mt-0.5 text-body-xs text-ink-tertiary">
          {description}
        </div>
      </div>
    </label>
  );
}

function PlacementSummary({ placement }: { placement: ArticlePlacement }): JSX.Element {
  const active: string[] = [];
  if (placement.featured) active.push('Featured');
  if (placement.trending) active.push('Trending');
  if (placement.trail) active.push('Trail');
  if (active.length === 0) return <span>No surfaces active.</span>;
  return (
    <span>
      Active: <span className="font-medium text-ink-primary">{active.join(' · ')}</span>
    </span>
  );
}
