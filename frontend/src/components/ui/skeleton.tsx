import { type HTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

/**
 * Skeleton — animated placeholder bar. Use to reserve space while loading.
 *
 * The component is decorative (`aria-hidden`); surrounding text/labels carry
 * the live-region semantics if you need them.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-line/60', className)}
      {...props}
    />
  );
}
