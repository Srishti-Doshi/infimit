import { setupServer } from 'msw/node';

import { handlers } from './handlers';

/**
 * Node-side MSW server for Vitest. Shares the exact same `handlers` array
 * as the browser worker so tests exercise the same fixture contract that
 * dev uses. Lifecycle is managed in `src/test/setup.ts`:
 *   - beforeAll: server.listen()
 *   - afterEach: server.resetHandlers()
 *   - afterAll:  server.close()
 */
export const server = setupServer(...handlers);
