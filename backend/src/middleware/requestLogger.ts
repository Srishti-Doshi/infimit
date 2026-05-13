/**
 * requestLogger middleware
 *
 * Emits one JSON line per request with:
 *   { requestId, method, route, status, durationMs, userId? }
 *
 * Built on pino-http with a custom serializer + child binding so handlers
 * can do `req.log.info(...)` and the line inherits the requestId.
 *
 * Per docs/10-security.md §10.5: never log request bodies; only metadata.
 */
import pinoHttp from 'pino-http';
import { logger } from '@/config/logger';

export const requestLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as { requestId?: string }).requestId ?? 'unknown',
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res, err) =>
    `${req.method} ${req.url} ${res.statusCode} ${err?.message ?? ''}`,
  serializers: {
    req: (req: { method: string; url: string; id: string; headers: Record<string, string> }) => ({
      method: req.method,
      url: req.url,
      id: req.id,
      userAgent: req.headers['user-agent'],
    }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
  customProps: (req) => {
    const userId = (req as { user?: { id?: string } }).user?.id;
    return userId ? { userId } : {};
  },
});
