import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/cn';

/**
 * Card — content container primitive.
 *
 * Composition pattern: `<Card><Card.Header><Card.Title /></Card.Header>...</Card>`.
 * Tone covers the surface variants seen in the Figma frames:
 *   - default — white surface, hairline border
 *   - subtle  — gray-50 surface
 *   - rose    — soft pink (OTP modal, auth-adjacent surfaces)
 *   - blue    — soft blue (admin stat cards, info surfaces)
 * Elevation adds shadow without changing tone — used sparingly.
 */
const cardVariants = cva('rounded-lg border', {
  variants: {
    tone: {
      default: 'bg-surface border-line',
      subtle: 'bg-surface-subtle border-line',
      rose: 'bg-surface-rose-tint border-brand-red-100',
      blue: 'bg-surface-blue-tint border-line',
    },
    elevation: {
      flat: '',
      raised: 'shadow-elev-1',
      floating: 'shadow-elev-2',
    },
  },
  defaultVariants: {
    tone: 'default',
    elevation: 'flat',
  },
});

interface CardProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { tone, elevation, className, ...props },
  ref,
) {
  return <div ref={ref} className={cn(cardVariants({ tone, elevation }), className)} {...props} />;
});

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...props }, ref) {
    return <div ref={ref} className={cn('flex flex-col gap-1.5 p-6 pb-3', className)} {...props} />;
  },
);

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, children, ...props }, ref) {
    return (
      <h3
        ref={ref}
        className={cn('font-display text-body-xl font-semibold text-ink-primary', className)}
        {...props}
      >
        {children}
      </h3>
    );
  },
);

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className, ...props }, ref) {
  return <p ref={ref} className={cn('text-body-sm text-ink-secondary', className)} {...props} />;
});

export const CardBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardBody({ className, ...props }, ref) {
    // Full `p-6` (top included). The composition pattern that justified `pt-0`
    // (a preceding `<CardHeader>` supplying the top padding) is not used
    // anywhere — every CardBody is standalone, so `pt-0` left content jammed
    // against the card's top edge on every surface. Call sites that want a
    // full-bleed body still override with `className="p-0"` (tailwind-merge).
    return <div ref={ref} className={cn('p-6', className)} {...props} />;
  },
);

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...props }, ref) {
    return (
      <div ref={ref} className={cn('flex items-center gap-3 p-6 pt-3', className)} {...props} />
    );
  },
);
