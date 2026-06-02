import { ChevronDown } from 'lucide-react';
import { type ChangeEvent, useId } from 'react';

import { ARTICLE_CATEGORY_LABELS } from '@/lib/articles-schema';
import { cn } from '@/lib/cn';
import { ARTICLE_CATEGORIES, type ArticleCategory } from '@/types/article';

interface CategorySelectProps {
  value: ArticleCategory | '';
  onChange: (next: ArticleCategory) => void;
  label?: string;
  helperText?: string;
  errorText?: string;
  required?: boolean;
}

/**
 * CategorySelect — native `<select>` styled to match the other form primitives.
 *
 * Sticks with a native control so mobile keyboards / screen readers stay
 * predictable. The chevron is decorative (the native chevron is hidden via
 * `appearance: none`).
 */
export function CategorySelect({
  value,
  onChange,
  label,
  helperText,
  errorText,
  required,
}: CategorySelectProps): JSX.Element {
  const reactId = useId();
  const selectId = `${reactId}-cat`;
  const helperId = `${reactId}-help`;
  const errorId = `${reactId}-err`;
  const isError = Boolean(errorText);

  function handleChange(e: ChangeEvent<HTMLSelectElement>): void {
    onChange(e.target.value as ArticleCategory);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={selectId} className="text-body-sm font-medium text-ink-primary">
          {label}
          {required ? <span className="ml-0.5 text-brand-red-500">*</span> : null}
        </label>
      ) : null}
      <div
        className={cn(
          'relative flex h-11 items-center rounded-md border border-line bg-surface px-3.5 transition-colors',
          'focus-within:border-brand-red-500 focus-within:ring-2 focus-within:ring-brand-red-500/20',
          isError &&
            'border-brand-red-500 focus-within:border-brand-red-600 focus-within:ring-brand-red-500/30',
        )}
      >
        <select
          id={selectId}
          value={value}
          onChange={handleChange}
          required={required}
          aria-invalid={isError || undefined}
          aria-describedby={isError ? errorId : helperText ? helperId : undefined}
          className="w-full appearance-none bg-transparent pr-6 text-body-sm text-ink-primary focus:outline-none"
        >
          <option value="" disabled>
            Choose a category…
          </option>
          {ARTICLE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {ARTICLE_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 h-4 w-4 text-ink-tertiary"
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
