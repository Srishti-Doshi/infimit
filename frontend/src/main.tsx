import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';

import App from './App';
import { ErrorBoundary } from './components/error-boundary';
import { createQueryClient } from './lib/query-client';
import './styles/tailwind.css';

const queryClient = createQueryClient();

/**
 * Warm the media-origin connection at boot. Cover images are the LCP element
 * on article pages and live on a different origin than the app (MinIO in dev,
 * object store/CDN in production) — without this, DNS + TCP setup only starts
 * after the article payload reveals the image URL, landing squarely on the
 * LCP critical path. Preconnecting here overlaps the handshake with the API
 * fetch instead. No `crossorigin` attribute: `<img>` fetches are no-CORS, and
 * a preconnect only matches requests of the same credential mode.
 */
const mediaOrigin = import.meta.env.VITE_MEDIA_ORIGIN ?? 'http://localhost:9000';
const preconnect = document.createElement('link');
preconnect.rel = 'preconnect';
preconnect.href = mediaOrigin;
document.head.appendChild(preconnect);

/**
 * Article LCP prefetch — on a direct article-page load, start the article
 * fetch NOW instead of after the route chunk loads and the component mounts.
 * The cover (the page's LCP element) can't be requested until the payload
 * reveals its URL, so every millisecond the API call starts earlier comes
 * straight off LCP. The dynamic import keeps articles-api (and its zod
 * schema chunk) out of the entry bundle — it resolves in parallel with the
 * route chunk the router is about to request anyway. queryKey + staleTime
 * mirror the page's useQuery exactly so the mount dedupes onto this
 * in-flight fetch instead of firing a second one.
 *
 * Skipped when MSW is on: bootstrap() awaits the worker before rendering,
 * and a prefetch fired before that would bypass the mocks.
 */
const mswEnabled = import.meta.env.DEV && import.meta.env.VITE_USE_MOCK !== 'false';
const articleSlugInPath = window.location.pathname.match(/^\/article\/([^/]+)$/)?.[1];
if (articleSlugInPath && !mswEnabled) {
  // Warm-start the route chunk too: the router's lazy() would only request
  // it after the entry finishes executing, adding a serial network hop to
  // the LCP chain. import() here begins the download immediately; lazy()'s
  // own import() later joins the same in-flight module request.
  void import('./pages/article');
  const slug = decodeURIComponent(articleSlugInPath);
  void import('./lib/articles-api').then(({ getArticleBySlug }) =>
    queryClient.prefetchQuery({
      queryKey: ['articles', 'slug', slug],
      queryFn: () => getArticleBySlug(slug),
      staleTime: 60_000,
    }),
  );
}

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
  // MSW is on by default in dev so the UI works without a backend.
  // Set `VITE_USE_MOCK=false` in a local .env to hit the real backend instead.
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK !== 'false') {
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
        <HelmetProvider>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </HelmetProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}

void bootstrap();
