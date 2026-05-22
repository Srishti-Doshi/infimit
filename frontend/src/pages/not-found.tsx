import { ArrowLeft, Compass } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button, Container } from '@/components/ui';

/**
 * 404 — the one page Subphase 1 fully owns. Designed to match the
 * editorial language: oversized red display numeral, calm explanation,
 * two clear next-step actions. Renders inside `AppLayout` like every
 * other route.
 */
export default function NotFoundPage(): JSX.Element {
  return (
    <Container width="narrow" className="py-20 sm:py-28 text-center">
      <p className="font-display text-display-2xl font-bold leading-none text-brand-red-500">404</p>
      <h1 className="mt-4 font-display text-display-md font-semibold text-ink-primary">
        We couldn&apos;t find that page
      </h1>
      <p className="mx-auto mt-3 max-w-content-narrow text-body-base text-ink-secondary">
        The URL might be misspelled, the page may have moved, or the article you&apos;re looking for
        is part of a feature still under development.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link to="/">
          <Button variant="primary" iconLeft={<ArrowLeft className="h-4 w-4" />}>
            Back to home
          </Button>
        </Link>
        <Link to="/search">
          <Button variant="outline" iconLeft={<Compass className="h-4 w-4" />}>
            Browse news
          </Button>
        </Link>
      </div>
    </Container>
  );
}
