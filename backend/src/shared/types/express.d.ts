/**
 * Augment Express's Request with our request-scoped fields:
 *  - requestId: correlation id set by middleware/requestId
 *  - user:      auth context populated by middleware/authGuard (from Subphase 2)
 *  - log:       per-request child logger from middleware/requestLogger
 */
import type { Logger } from 'pino';
import type { AuthContext } from './index';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      user?: AuthContext;
      log: Logger;
    }
  }
}

export {};
