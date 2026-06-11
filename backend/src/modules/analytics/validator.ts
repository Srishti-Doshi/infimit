/**
 * Zod schemas for the analytics module — docs/05-api-documentation.md §5.8.
 *
 * `POST /v1/analytics/track` accepts a fairly permissive body: most fields
 * are optional, and we DELIBERATELY ignore `userId` from the body — that's
 * always derived server-side from `req.user`. The schema doesn't include
 * `userId` at all so a stray body field gets silently dropped (Zod strips
 * unknown keys by default with `.object`, not `.strict`).
 */
import { z } from 'zod';

import { ANALYTICS_EVENT_TYPES } from './model';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectIdString = z.string().regex(objectIdRegex, 'Invalid id');

/**
 * `POST /v1/analytics/track` body.
 *
 * `type` is the only strictly required field. `articleId` is required for
 * any article-scoped type (`view`, `read_complete`, `share`, `bookmark`,
 * `comment`); `adId` for the ad-scoped types. The service enforces the
 * shape rule because Zod refines don't compose cleanly across enum-driven
 * required-when-X scenarios.
 */
export const trackEventBodySchema = z.object({
  type: z.enum(ANALYTICS_EVENT_TYPES),
  articleId: objectIdString.optional(),
  adId: objectIdString.optional(),
  sessionId: z.string().trim().min(1).max(120).optional(),
  referrer: z.string().trim().max(500).optional(),
  durationMs: z
    .number()
    .int()
    .nonnegative()
    .max(24 * 60 * 60 * 1000)
    .optional(),
});
export type TrackEventBody = z.infer<typeof trackEventBodySchema>;

/** Path-param id used by both `articles/:id` and `authors/:id` stats reads. */
export const idParamSchema = z.object({
  id: objectIdString,
});
