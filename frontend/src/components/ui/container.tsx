import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/cn';

/**
 * Container — content max-width wrapper with responsive horizontal padding.
 *
 * Widths align with the design system:
 *   - narrow  — prose, modals, single-column forms (576px max)
 *   - default — most page content (1152px max)
 *   - wide    — hero / landing sections (1408px max)
 *   - full    — unbounded width (rarely needed, escape hatch)
 */
const containerVariants = cva('mx-auto w-full px-4 sm:px-6 lg:px-8', {
  variants: {
    width: {
      narrow: 'max-w-content-narrow',
      default: 'max-w-content-default',
      wide: 'max-w-content-wide',
      full: 'max-w-none',
    },
  },
  defaultVariants: {
    width: 'default',
  },
});

interface ContainerProps
  extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof containerVariants> {}

export function Container({ width, className, ...props }: ContainerProps): JSX.Element {
  return <div className={cn(containerVariants({ width }), className)} {...props} />;
}
