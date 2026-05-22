import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

/**
 * VisuallyHidden — content readable by assistive tech, invisible on screen.
 * Use for context that's clear visually but needs explicit announcement
 * (e.g. icon-only buttons, decorative content with screen-reader fallback).
 */
export function VisuallyHidden({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>): JSX.Element {
  return <span className={cn('sr-only', className)} {...props} />;
}
