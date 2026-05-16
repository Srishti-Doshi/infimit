/**
 * requestId middleware
 *
 * - Accepts an incoming `X-Request-Id` (trusted from load balancer / upstream)
 * - Generates a UUID v4 if absent
 * - Sets `req.requestId` and echoes back `X-Request-Id` on the response
 *
 * Must be mounted BEFORE requestLogger so log lines carry the id.
 */
import type { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

const HEADER = 'x-request-id';

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(HEADER);
  const id = incoming && incoming.length > 0 && incoming.length <= 128 ? incoming : uuidv4();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
