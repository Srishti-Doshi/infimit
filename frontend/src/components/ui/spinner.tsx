import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/cn';

/**
 * Spinner — indeterminate loading indicator.
 * Used standalone for route fallbacks and inside `<Button loading>`.
 */
const spinnerVariants = cva(
  'inline-block animate-spin rounded-full border-2 border-current border-r-transparent align-[-0.125em]',
  {
    variants: {
      size: {
        sm: 'h-4 w-4',
        md: 'h-6 w-6',
        lg: 'h-8 w-8',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
);

interface SpinnerProps extends VariantProps<typeof spinnerVariants> {
  className?: string;
  label?: string;
}

export function Spinner({ size, className, label = 'Loading' }: SpinnerProps): JSX.Element {
  return (
    <span role="status" className={cn(spinnerVariants({ size }), className)}>
      <span className="sr-only">{label}</span>
    </span>
  );
}
