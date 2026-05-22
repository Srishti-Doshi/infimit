import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { server } from '@/mocks/server';

/**
 * Global test setup.
 *
 * - jest-dom extends Vitest's `expect` with DOM-aware matchers
 *   (toBeInTheDocument, toHaveAttribute, toHaveClass, …).
 * - MSW node-server intercepts fetch/axios calls during tests, using the
 *   same handlers as the dev browser worker. Per-test overrides go through
 *   `server.use(...)` inside the test body.
 */
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
