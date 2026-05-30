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
