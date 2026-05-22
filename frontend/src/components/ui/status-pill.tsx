import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/cn';

/**
 * StatusPill — color-coded status indicator.
 *
 * Tones map to the status colors seen across the Figma frames:
 *   - success — Accepted / Approved (green)
 *   - warning — Pending (amber)
 *   - error   — Rejected (red)
 *   - info    — informational (blue)
 *   - neutral — inert / default (gray)
 */
const statusPillVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-body-xs font-medium tracking-wide',
  {
    variants: {
      tone: {
        success: 'bg-status-success-bg text-status-success-text',
        warning: 'bg-status-warning-bg text-status-warning-text',
        error: 'bg-status-error-bg text-status-error-text',
        info: 'bg-status-info-bg text-status-info-text',
        neutral: 'bg-surface-subtle text-ink-secondary ring-1 ring-line ring-inset',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
);

interface StatusPillProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof statusPillVariants> {}

export function StatusPill({ tone, className, ...props }: StatusPillProps): JSX.Element {
  return <span className={cn(statusPillVariants({ tone }), className)} {...props} />;
}
