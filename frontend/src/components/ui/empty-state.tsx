import { type ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface EmptyStateProps {
  /** Decorative icon — pass a lucide icon, will be coloured via the tint. */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Primary call-to-action (usually a `<Button>`). */
  action?: ReactNode;
  className?: string;
}

/**
 * EmptyState — friendly placeholder used when a list has no items. Renders
 * inside an existing surface (Card / Modal) — controls only its own layout.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps): JSX.Element {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {icon ? (
        <div
          aria-hidden="true"
          className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-surface-rose-tint text-brand-red-600"
        >
          {icon}
        </div>
      ) : null}
      <p className="font-display text-body-xl font-semibold text-ink-primary">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-body-sm text-ink-secondary">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
