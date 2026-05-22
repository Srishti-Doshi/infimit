import { Link } from 'react-router-dom';

import { cn } from '@/lib/cn';

interface LogoProps {
  /** `default` = main header treatment with tagline; `compact` = smaller, drawer/footer. */
  variant?: 'default' | 'compact';
  className?: string;
  /** When true, the tagline is hidden (used on very narrow viewports). */
  hideTagline?: boolean;
}

/**
 * Logo — wordmark "THE INFIMIT" in Fraunces display serif, with optional
 * red tagline. The wordmark scales fluidly across breakpoints via Tailwind's
 * responsive text utilities, so the header doesn't need to know the viewport.
 */
export function Logo({
  variant = 'default',
  className,
  hideTagline = false,
}: LogoProps): JSX.Element {
  const wordmarkSize =
    variant === 'compact'
      ? 'text-body-xl'
      : 'text-display-sm sm:text-display-md lg:text-display-lg';

  const taglineSize =
    variant === 'compact' ? 'text-[0.625rem]' : 'text-[0.6875rem] sm:text-body-xs';

  return (
    <Link
      to="/"
      className={cn('inline-block focus-visible:outline-none', className)}
      aria-label="The Infimit — Home"
    >
      <span
        className={cn(
          'block font-display font-bold uppercase leading-none tracking-tight text-ink-primary',
          wordmarkSize,
        )}
      >
        The Infimit
      </span>
      {!hideTagline ? (
        <span
          className={cn(
            'mt-1 block font-semibold uppercase tracking-wide text-brand-red-500',
            taglineSize,
          )}
        >
          Global Higher Education News at Your Fingertips
        </span>
      ) : null}
    </Link>
  );
}
