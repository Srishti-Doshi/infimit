import { type ReactNode } from 'react';
import { ErrorBoundary as ReactErrorBoundary, type FallbackProps } from 'react-error-boundary';

import { Button, Container } from '@/components/ui';

/**
 * Friendly fallback rendered when any descendant throws during render.
 * Dev builds include the raw error message under the explanation — prod
 * builds omit it to avoid leaking stack details to readers.
 */
function FallbackUI({ error, resetErrorBoundary }: FallbackProps): JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-6">
      <Container width="narrow" className="text-center">
        <p className="font-display text-display-2xl font-bold leading-none text-brand-red-500">
          Oops
        </p>
        <h1 className="mt-4 font-display text-display-md font-semibold text-ink-primary">
          Something went wrong
        </h1>
        <p className="mx-auto mt-3 max-w-content-narrow text-body-base text-ink-secondary">
          We hit an unexpected error. Try reloading; if it persists, the page may need a moment to
          recover.
        </p>
        {import.meta.env.DEV ? (
          <pre className="mx-auto mt-4 max-w-content-narrow overflow-auto rounded-md bg-surface-subtle p-3 text-left text-body-xs text-ink-tertiary">
            {error instanceof Error ? error.message : String(error)}
          </pre>
        ) : null}
        <Button variant="primary" onClick={resetErrorBoundary} className="mt-6">
          Reload
        </Button>
      </Container>
    </main>
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

/**
 * Top-level error boundary. Mounted in `main.tsx` so it catches every
 * render error in the tree — including QueryClientProvider, RouterProvider,
 * and individual route components.
 *
 * Subphase 5+ pipes `onError` to Sentry per docs/10-security.md §10.5;
 * for now we log to console so devs spot crashes immediately.
 */
export function ErrorBoundary({ children }: ErrorBoundaryProps): JSX.Element {
  return (
    <ReactErrorBoundary
      FallbackComponent={FallbackUI}
      onError={(error, info) => {
        // eslint-disable-next-line no-console
        console.error('ErrorBoundary caught:', error, info);
      }}
    >
      {children}
    </ReactErrorBoundary>
  );
}
