/**
 * Media service — presign + register + delete with refCount accounting.
 *
 * Two distinct flows:
 *   1. issueUploadUrl   — caps-check, generate key, presign PUT
 *   2. registerUpload   — caps-recheck, persist Media doc with the resolved URL
 *
 * Caps are enforced TWICE on purpose: at upload-url so we don't issue a presign
 * that would be wasted, AND at register so a tampered FE can't lie about the
 * size between the two calls. The presigned URL itself binds Content-Type at
 * S3 — that's the third layer of defence for MIME.
 *
 * Delete behaviour:
 *   - Only the uploader (or an editor/admin) can delete.
 *   - If refCount > 0, refuse with 409 — the asset is still referenced by an
 *     article / org / etc. Repository sweepers will GC orphans (refCount=0)
 *     in a future job; this endpoint is for explicit user-driven deletes.
 *   - On accept: drop the S3 object first, then the DB doc. If S3 delete
 *     fails we still drop the doc — the alternative (refusing the user's
 *     delete because S3 hiccuped) is worse than an orphaned object.
 */
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';

import { deleteObject, fetchObjectHead, presignUpload, publicUrlFor } from '@/config/s3';
import { auditLog } from '@/shared/audit';
import { ApiError } from '@/shared/errors';
import { ErrorCode } from '@/shared/errors/errorCodes';

import { checkMediaCap, extensionFor } from './caps';
import { MAGIC_BYTES_HEAD_SIZE, verifyMagic } from './magic-bytes';
import type { MediaDimensions, MediaModel, MediaPurpose } from './model';
import * as mediaRepo from './repository';

export interface IssueUploadUrlInput {
  uploadedBy: string;
  mimeType: string;
  size: number;
  purpose: MediaPurpose;
}

export interface IssuedUploadUrl {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}

export async function issueUploadUrl(input: IssueUploadUrlInput): Promise<IssuedUploadUrl> {
  const violation = checkMediaCap(input.purpose, input.mimeType, input.size);
  if (violation) {
    throw ApiError.validation(
      violation.reason === 'mime'
        ? `MIME type '${String(violation.value)}' not allowed for purpose '${input.purpose}'`
        : `File size ${String(violation.value)} bytes exceeds the ${String(violation.limit)}-byte limit for '${input.purpose}'`,
      { reason: violation.reason, purpose: violation.purpose, limit: violation.limit },
    );
  }

  // Key shape: `uploads/<purpose>/<uuid>.<ext>`. The uuid carries the entropy
  // (no userId leaked into the object key); the purpose segment is reflected
  // back by the register flow to re-derive the cap.
  const id = randomUUID();
  const ext = extensionFor(input.mimeType);
  const key = `uploads/${input.purpose}/${id}.${ext}`;

  const presigned = await presignUpload(key, input.mimeType);

  auditLog(
    {
      entity: 'media',
      action: 'upload_url_issued',
      actor: input.uploadedBy,
      details: { purpose: input.purpose, mimeType: input.mimeType, size: input.size },
    },
    'media_upload_url_issued',
  );

  return presigned;
}

export interface RegisterUploadInput {
  uploadedBy: string;
  key: string;
  mimeType: string;
  size: number;
  dimensions?: MediaDimensions;
}

/**
 * Extract the purpose segment from an issued key like
 * `uploads/<purpose>/<uuid>.<ext>`. Returns null if the shape doesn't match
 * (so the caller can return 422 INVALID_KEY without trusting the input).
 */
function purposeFromKey(key: string): MediaPurpose | null {
  const m = /^uploads\/([a-z_]+)\/[0-9a-f-]+\.[a-z0-9]+$/i.exec(key);
  if (!m) return null;
  const candidate = m[1] as MediaPurpose;
  // Validate against the closed enum — anything not in MEDIA_CAPS is rejected.
  const validPurposes: readonly MediaPurpose[] = [
    'article_cover',
    'article_embed',
    'author_avatar',
    'org_logo',
    'ad_creative',
    'epaper_pdf',
    'epaper_cover',
    'tts_audio',
  ];
  return validPurposes.includes(candidate) ? candidate : null;
}

export async function registerUpload(input: RegisterUploadInput): Promise<MediaModel> {
  const purpose = purposeFromKey(input.key);
  if (!purpose) {
    throw ApiError.validation('Invalid upload key (purpose unrecognised)');
  }

  // Re-validate the cap with the REGISTER-time mime+size. Defends against a
  // tampered FE that asked for one purpose at presign and tries to register
  // with widened limits — caps are pinned to the purpose, which is derived
  // from the key the backend itself issued.
  const violation = checkMediaCap(purpose, input.mimeType, input.size);
  if (violation) {
    throw ApiError.validation(
      violation.reason === 'mime'
        ? `MIME type '${String(violation.value)}' not allowed for purpose '${purpose}'`
        : `File size ${String(violation.value)} bytes exceeds the ${String(violation.limit)}-byte limit for '${purpose}'`,
      { reason: violation.reason, purpose, limit: violation.limit },
    );
  }

  // Reject double-registration on the same key — a duplicate is either a FE
  // retry (idempotency story: return the existing doc) or an attempted
  // overwrite. Idempotency is the friendlier choice for retries.
  const existing = await mediaRepo.findByKey(input.key);
  if (existing) {
    return existing;
  }

  // Magic-byte verification — fetch the first bytes of the uploaded object
  // from S3 and verify they match the claimed mimeType. Defends against a
  // tampered FE that claimed e.g. `application/pdf` at presign (to pass the
  // cap) but PUT arbitrary bytes (e.g. a renamed JPEG) to the presigned URL.
  // Caps + Content-Type-bound presign are layers 1-2 of MIME defence; this
  // is layer 3, the only one that actually inspects the bytes on disk.
  let head: Buffer;
  try {
    head = await fetchObjectHead(input.key, MAGIC_BYTES_HEAD_SIZE);
  } catch (err) {
    // Range GET failed — object never landed (FE skipped the PUT), or a
    // transient S3 error. Refuse the registration rather than persist a doc
    // pointing at unverifiable bytes.
    throw ApiError.validation('Unable to verify uploaded file contents', {
      reason: 'magic-check-failed',
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const magic = verifyMagic(input.mimeType, head);
  if (!magic.ok) {
    // Caller's claim was wrong. Delete the orphan S3 object best-effort so
    // mis-typed bytes don't linger — the sweeper would eventually GC them
    // but eager cleanup at the source of truth is cleaner.
    try {
      await deleteObject(input.key);
    } catch (err) {
      auditLog(
        {
          entity: 'media',
          action: 'magic_mismatch_cleanup_failed',
          actor: input.uploadedBy,
          details: {
            key: input.key,
            error: err instanceof Error ? err.message : String(err),
          },
        },
        'media_magic_mismatch_cleanup_failed',
      );
    }
    throw ApiError.validation(
      `Uploaded file does not match the claimed MIME type '${input.mimeType}'`,
      {
        reason: 'mime-mismatch',
        purpose,
        claimed: input.mimeType,
        expected: magic.expected,
      },
    );
  }

  const media = await mediaRepo.createMedia({
    key: input.key,
    url: publicUrlFor(input.key),
    mimeType: input.mimeType,
    size: input.size,
    purpose,
    dimensions: input.dimensions ?? null,
    uploadedBy: new Types.ObjectId(input.uploadedBy),
  });

  auditLog(
    {
      entity: 'media',
      entityId: media._id.toString(),
      action: 'registered',
      actor: input.uploadedBy,
      details: { purpose, mimeType: input.mimeType, size: input.size },
    },
    'media_registered',
  );

  return media;
}

export async function getMedia(id: string): Promise<MediaModel> {
  if (!Types.ObjectId.isValid(id)) {
    throw ApiError.notFound('Media not found');
  }
  const media = await mediaRepo.findById(id);
  if (!media) {
    throw ApiError.notFound('Media not found');
  }
  return media;
}

export interface DeleteMediaInput {
  id: string;
  actorId: string;
  actorRole: 'reader' | 'author' | 'editor' | 'admin';
}

export async function deleteMedia(input: DeleteMediaInput): Promise<void> {
  if (!Types.ObjectId.isValid(input.id)) {
    throw ApiError.notFound('Media not found');
  }
  const media = await mediaRepo.findById(input.id);
  if (!media) {
    throw ApiError.notFound('Media not found');
  }

  const isOwner = media.uploadedBy.toString() === input.actorId;
  const isPrivileged = input.actorRole === 'editor' || input.actorRole === 'admin';
  if (!isOwner && !isPrivileged) {
    throw ApiError.forbidden('Only the uploader, an editor, or an admin can delete this media');
  }

  // Don't delete an asset that's still referenced. The article / org / etc.
  // would otherwise have a dangling URL.
  if (media.refCount > 0) {
    throw new ApiError(
      409,
      ErrorCode.CONFLICT,
      `Media is still referenced (refCount=${media.refCount}). Detach references first.`,
      { details: { refCount: media.refCount } },
    );
  }

  // S3 delete first — if the doc deletes but the binary lingers, a future GC
  // sweeper finds it; if the binary deletes but the doc lingers, public reads
  // start returning broken URLs. The former is the better failure mode.
  try {
    await deleteObject(media.key);
  } catch (err) {
    // Swallow + audit — we still proceed to drop the doc. The S3 object
    // becomes an orphan for the sweeper.
    auditLog(
      {
        entity: 'media',
        entityId: media._id.toString(),
        action: 'delete_s3_failed',
        actor: input.actorId,
        details: { error: err instanceof Error ? err.message : String(err) },
      },
      'media_delete_s3_failed',
    );
  }

  await mediaRepo.deleteById(media._id);

  auditLog(
    {
      entity: 'media',
      entityId: media._id.toString(),
      action: 'deleted',
      actor: input.actorId,
      details: { key: media.key, purpose: media.purpose },
    },
    'media_deleted',
  );
}
