import { ArrowLeft, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button, Container, StatusPill } from '@/components/ui';

interface PlaceholderPageProps {
  /** Page name shown as the heading (e.g. "Login", "Article") */
  name: string;
  /** Subphase that will deliver this page (2 / 3 / 4 / 5) */
  subphase: number;
  /** Optional one-sentence elaboration on what the page will do */
  description?: string;
}

/**
 * PlaceholderPage — shared "Coming in Subphase X" view rendered by every
 * non-404 route in the Subphase 1 scaffold. Reserves the route, surfaces
 * the contract envelope visually, and points users home.
 */
export function PlaceholderPage({
  name,
  subphase,
  description,
}: PlaceholderPageProps): JSX.Element {
  return (
    <Container width="narrow" className="py-16 sm:py-24">
      <div className="text-center">
        <StatusPill tone="info" className="inline-flex">
          <Clock className="h-3 w-3" aria-hidden="true" />
          Coming in Subphase {subphase}
        </StatusPill>
        <h1 className="mt-6 font-display text-display-lg font-semibold text-ink-primary">{name}</h1>
        <p className="mx-auto mt-3 max-w-content-narrow text-body-base text-ink-secondary">
          {description ??
            `This route is reserved by the Subphase 1 scaffold. The full ${name} experience lands in Subphase ${subphase}.`}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/">
            <Button variant="primary" iconLeft={<ArrowLeft className="h-4 w-4" />}>
              Back to home
            </Button>
          </Link>
        </div>
      </div>
    </Container>
  );
}
