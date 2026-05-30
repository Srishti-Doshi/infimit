import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button, Container } from '@/components/ui';

/**
 * 403 — landing for `<RequireRole>` mismatches. Same visual treatment as 404.
 */
export default function ForbiddenPage(): JSX.Element {
  return (
    <Container width="narrow" className="py-20 text-center sm:py-28">
      <p className="font-display text-display-2xl font-bold leading-none text-brand-red-500">403</p>
      <h1 className="mt-4 font-display text-display-md font-semibold text-ink-primary">
        You don&apos;t have access to this area
      </h1>
      <p className="mx-auto mt-3 max-w-content-narrow text-body-base text-ink-secondary">
        Your account doesn&rsquo;t have the role required to view this page. If you think this is a
        mistake, ask an admin to check your permissions.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link to="/">
          <Button variant="primary" iconLeft={<ArrowLeft className="h-4 w-4" />}>
            Back to home
          </Button>
        </Link>
      </div>
    </Container>
  );
}
