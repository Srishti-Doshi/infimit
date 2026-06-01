import { useEffect, useRef, useState } from 'react';

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutoSaveOptions {
  /**
   * Stringified key reflecting the *content* you want to save. The hook fires
   * `save()` whenever this changes (after the debounce). Use something like
   * `JSON.stringify({ title, body, version })` — equality, not reference.
   */
  trigger: string;
  /** Async save function. The hook awaits this; surface conflicts inside it. */
  save: () => Promise<void>;
  /** Debounce window in ms; default 1500 (per Subphase 3 plan §6 day 6). */
  delay?: number;
  /**
   * Skip auto-saving (e.g. while the page is still loading the initial draft,
   * or after a version conflict locks editing). Default true.
   */
  enabled?: boolean;
}

/**
 * `useAutoSave` — debounced auto-save with status surface.
 *
 * Behaviour:
 *   - The first run is treated as the baseline; nothing fires until `trigger`
 *     changes (otherwise mounting would immediately PATCH the just-loaded
 *     draft).
 *   - Each subsequent `trigger` change starts a fresh debounce; if `trigger`
 *     changes again before the timer fires, the old timer is cleared.
 *   - On `save()` resolve → status='saved' + lastSavedAt now. On reject →
 *     status='error' (the parent's `save` is responsible for the *kind* of
 *     error, e.g. surfacing a VERSION_CONFLICT banner).
 *
 * The hook deliberately does NOT own the version token or the mutation —
 * callers wrap their own mutation inside `save` so they can react to specific
 * error codes (409, 422, …) however they want.
 */
export function useAutoSave({ trigger, save, delay = 1500, enabled = true }: UseAutoSaveOptions): {
  status: AutoSaveStatus;
  lastSavedAt: Date | null;
} {
  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const firstRun = useRef(true);
  // Keep `save` reactive without re-debouncing on every parent render — the
  // effect deps only watch the trigger string.
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (!enabled) return;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setStatus('saving');
      saveRef
        .current()
        .then(() => {
          if (cancelled) return;
          setStatus('saved');
          setLastSavedAt(new Date());
        })
        .catch(() => {
          if (cancelled) return;
          setStatus('error');
        });
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trigger, delay, enabled]);

  return { status, lastSavedAt };
}
