/**
 * Zod schemas for the media module.
 *
 * The MIME/size caps live in caps.ts and are enforced at the service layer
 * with structured 422s — the validator only checks request *shape*. This keeps
 * the API contract (validator) and the security policy (caps) decoupled.
 */
import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const mediaPurposeSchema = z.enum([
  'article_cover',
  'article_embed',
  'author_avatar',
  'org_logo',
  'ad_creative',
  'epaper_pdf',
  'epaper_cover',
  'tts_audio',
]);

/**
 * `POST /v1/media/upload-url`
 *
 * The FE declares intent (purpose + mime + size). The service caps-checks and,
 * if acceptable, returns a presigned PUT URL + the S3 key the upload will land
 * at. The FE PUTs the binary directly to S3.
 */
export const uploadUrlBodySchema = z.object({
  mimeType: z.string().trim().toLowerCase().min(1).max(100),
  // Bytes. Capped at 100 MB at the schema layer — any per-purpose cap below
  // this is enforced in the service. Negative/zero sizes are nonsense.
  size: z.coerce
    .number()
    .int()
    .positive()
    .max(100 * 1024 * 1024),
  purpose: mediaPurposeSchema,
});
export type UploadUrlBody = z.infer<typeof uploadUrlBodySchema>;

/**
 * `POST /v1/media/register`
 *
 * Called by the FE after a successful PUT to the presigned URL. Confirms the
 * upload landed and records the metadata. The service re-validates the cap
 * against `(purpose-from-key, mimeType, size)` so a tampered FE can't widen
 * the limits between upload-url issuance and register.
 *
 * `dimensions` is optional — images supply it; PDFs and audio don't.
 */
export const registerBodySchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(500)
    // Keys are always issued under `uploads/<purpose>/<uuid>.<ext>`.
    // Pinning the prefix here defends against a tampered FE trying to register
    // an arbitrary key the backend didn't issue.
    .regex(/^uploads\//, 'key must begin with uploads/'),
  mimeType: z.string().trim().toLowerCase().min(1).max(100),
  size: z.coerce
    .number()
    .int()
    .positive()
    .max(100 * 1024 * 1024),
  dimensions: z
    .object({
      width: z.coerce.number().int().positive().max(50_000),
      height: z.coerce.number().int().positive().max(50_000),
    })
    .optional(),
});
export type RegisterBody = z.infer<typeof registerBodySchema>;

/** Path-param: 24-char hex ObjectId. */
export const mediaIdParamSchema = z.object({
  id: z.string().regex(objectIdRegex, 'Invalid media id'),
});
