import { X } from 'lucide-react';
import { type KeyboardEvent, useId, useState } from 'react';

import { cn } from '@/lib/cn';

interface TagsInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  /** Cap; default 10 (matches the submit rule from docs/07-workflows.md §7.1). */
  max?: number;
  /** Per-tag character cap; default 50 (matches the backend validator). */
  maxLength?: number;
  label?: string;
  helperText?: string;
  errorText?: string;
  placeholder?: string;
}

/**
 * TagsInput — chip-style multi-input.
 *
 * - Enter or comma commits the current text as a tag.
 * - Backspace on an empty input removes the last tag.
 * - Click the × to remove a tag.
 * - Duplicate tags (case-insensitive) are silently merged.
 *
 * Controlled: caller owns the `string[]`. Pair with `Controller` from RHF when
 * a form needs validation.
 */
export function TagsInput({
  value,
  onChange,
  max = 10,
  maxLength = 50,
  label,
  helperText,
  errorText,
  placeholder = 'Add a tag…',
}: TagsInputProps): JSX.Element {
  const reactId = useId();
  const inputId = `${reactId}-tag`;
  const helperId = `${reactId}-help`;
  const errorId = `${reactId}-err`;
  const [draft, setDraft] = useState('');

  const atCap = value.length >= max;
  const isError = Boolean(errorText);

  function commit(raw: string): void {
    const tag = raw.trim().slice(0, maxLength);
    if (!tag) return;
    if (atCap) return;
    if (value.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...value, tag]);
    setDraft('');
  }

  function remove(index: number): void {
    onChange(value.filter((_, i) => i !== index));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(draft);
      return;
    }
    if (e.key === 'Backspace' && draft.length === 0 && value.length > 0) {
      e.preventDefault();
      remove(value.length - 1);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={inputId} className="text-body-sm font-medium text-ink-primary">
          {label}
        </label>
      ) : null}
      <div
        className={cn(
          'flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5 transition-colors',
          'focus-within:border-brand-red-500 focus-within:ring-2 focus-within:ring-brand-red-500/20',
          isError &&
            'border-brand-red-500 focus-within:border-brand-red-600 focus-within:ring-brand-red-500/30',
        )}
      >
        {value.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="inline-flex items-center gap-1 rounded-full bg-surface-rose-tint px-2 py-0.5 text-body-xs font-medium text-brand-red-700"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove tag ${tag}`}
              className="inline-flex rounded-full hover:text-brand-red-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red-500"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id={inputId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => commit(draft)}
          aria-invalid={isError || undefined}
          aria-describedby={isError ? errorId : helperText ? helperId : undefined}
          placeholder={atCap ? `Max ${max} tags` : placeholder}
          disabled={atCap}
          maxLength={maxLength}
          className="min-w-[8rem] flex-1 bg-transparent py-1 text-body-sm text-ink-primary placeholder:text-ink-tertiary focus:outline-none disabled:cursor-not-allowed disabled:text-ink-tertiary"
        />
      </div>
      {isError ? (
        <p id={errorId} className="text-body-xs text-brand-red-500">
          {errorText}
        </p>
      ) : helperText ? (
        <p id={helperId} className="text-body-xs text-ink-tertiary">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
