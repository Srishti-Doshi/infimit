import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/cn';

/**
 * Button — primary interactive primitive.
 *
 * Five variants drawn from the Figma frames:
 *   - primary   — solid brand-red (CTA: Send Request, Submit News, Post Comment)
 *   - secondary — solid ink-primary (auth flow primaries: LOGIN, SIGN UP)
 *   - outline   — accent-red border + text (tertiary: "Authorities")
 *   - ghost     — transparent bg, accent-red text
 *   - link      — inline link styling with underline-on-hover
 *
 * Sizes: sm 32px, md 40px, lg 48px (all comfortably above 44px touch-target
 * at md/lg; sm is for dense UI).
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-150 ease-soft-out focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-brand-red-500 text-ink-inverse hover:bg-brand-red-600 active:bg-brand-red-700 shadow-elev-1',
        secondary:
          'bg-ink-primary text-ink-inverse hover:bg-ink-primary/90 active:bg-ink-primary/80',
        outline:
          'border border-brand-red-500 bg-surface text-brand-red-500 hover:bg-brand-red-50 active:bg-brand-red-100',
        ghost: 'text-brand-red-500 hover:bg-brand-red-50 active:bg-brand-red-100',
        link: 'text-brand-red-500 underline-offset-4 hover:underline px-0 h-auto',
      },
      size: {
        sm: 'h-8 px-3 text-body-xs rounded',
        md: 'h-10 px-4 text-body-sm rounded-md',
        lg: 'h-12 px-6 text-body-base rounded-md',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, loading = false, iconLeft, iconRight, disabled, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : iconLeft ? (
        <span aria-hidden="true" className="inline-flex">
          {iconLeft}
        </span>
      ) : null}
      {children}
      {!loading && iconRight ? (
        <span aria-hidden="true" className="inline-flex">
          {iconRight}
        </span>
      ) : null}
    </button>
  );
});
