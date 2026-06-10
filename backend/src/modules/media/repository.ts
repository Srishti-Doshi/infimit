/**
 * Media repository — data access for the media collection.
 *
 * Thin Mongoose wrappers. Service-layer maps repository nulls to ApiError.
 */
import { type Types } from 'mongoose';

import {
  Media,
  type MediaDimensions,
  type MediaDocument,
  type MediaModel,
  type MediaPurpose,
} from './model';

export interface CreateMediaInput {
  key: string;
  url: string;
  mimeType: string;
  size: number;
  purpose: MediaPurpose;
  dimensions?: MediaDimensions | null;
  uploadedBy: Types.ObjectId;
}

export async function createMedia(input: CreateMediaInput): Promise<MediaModel> {
  return Media.create({
    key: input.key,
    url: input.url,
    mimeType: input.mimeType,
    size: input.size,
    purpose: input.purpose,
    dimensions: input.dimensions ?? null,
    uploadedBy: input.uploadedBy,
    // refCount starts at 0 — articles that reference this media will increment
    // it via $inc when they persist the reference (Subphase 3 articles work).
    refCount: 0,
  });
}

export async function findById(id: Types.ObjectId | string): Promise<MediaModel | null> {
  return Media.findById(id).exec();
}

export async function findByKey(key: string): Promise<MediaModel | null> {
  return Media.findOne({ key }).exec();
}

export async function updateById(
  id: Types.ObjectId | string,
  patch: Partial<Pick<MediaDocument, 'refCount'>>,
): Promise<MediaModel | null> {
  return Media.findByIdAndUpdate(id, { $set: patch }, { new: true }).exec();
}

/** Atomically adjust refCount (positive to bump, negative to decrement). */
export async function adjustRefCount(
  id: Types.ObjectId | string,
  delta: number,
): Promise<MediaModel | null> {
  return Media.findByIdAndUpdate(id, { $inc: { refCount: delta } }, { new: true }).exec();
}

export async function deleteById(id: Types.ObjectId | string): Promise<boolean> {
  const result = await Media.deleteOne({ _id: id }).exec();
  return result.deletedCount === 1;
}

/**
 * List orphan media docs: `refCount === 0` AND created before `olderThan`.
 *
 * The grace cutoff exists because a freshly-uploaded media doc starts at
 * `refCount: 0` (the article that will reference it hasn't been persisted
 * yet — there's a window during the upload-url → register → article-create
 * dance where the doc is legitimately at 0). Sweeping these would race the
 * happy path. Default grace is 1 hour, which comfortably covers any
 * upload-and-publish flow.
 *
 * Caps at `limit` per call so the sweeper can paginate through a large
 * backlog without holding too many docs in memory.
 */
export async function findOrphans(olderThan: Date, limit: number): Promise<MediaModel[]> {
  return Media.find({
    refCount: 0,
    createdAt: { $lt: olderThan },
  })
    .sort({ createdAt: 1 })
    .limit(limit)
    .exec();
}
