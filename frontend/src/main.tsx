import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from './components/error-boundary';
import { createQueryClient } from './lib/query-client';
import './styles/tailwind.css';

const queryClient = createQueryClient();

/**
 * Bootstrap order:
 *   1. (Optional) start MSW. The dynamic `import()` is gated by the dev flag
 *      so production builds tree-shake all mock code out of the bundle.
 *   2. Render React, wrapping the entire tree in `<ErrorBoundary>` so render
 *      crashes anywhere — including inside QueryClient or Router — surface a
 *      friendly fallback instead of a white screen.
 *
 * Awaiting MSW *before* rendering ensures the very first request issued by
 * any component goes through the mocks — no flash of uncaught network call.
 */
async function bootstrap(): Promise<void> {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === 'true') {
    const { worker } = await import('./mocks/browser');
    await worker.start({
      onUnhandledRequest: 'bypass',
      serviceWorker: { url: '/mockServiceWorker.js' },
    });
  }

  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Root element #root not found in index.html');
  }

  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}

void bootstrap();
