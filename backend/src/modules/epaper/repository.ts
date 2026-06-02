/**
 * Epaper repository — data access for the epapers collection.
 *
 * Thin Mongoose wrappers. The collection is small (one row per issue —
 * maybe one per day at peak) so we don't need to be clever about query
 * shape; everything sorts by issueDate.
 */
import { type FilterQuery, type Types } from 'mongoose';

import { Epaper, type EpaperDocument, type EpaperModel } from './model';

export interface CreateEpaperInput {
  title: string;
  issueDate: Date;
  pdfMediaId: Types.ObjectId;
  coverMediaId: Types.ObjectId;
  pageCount?: number;
  uploadedBy: Types.ObjectId;
}

export async function createEpaper(input: CreateEpaperInput): Promise<EpaperModel> {
  return Epaper.create({
    title: input.title,
    issueDate: input.issueDate,
    pdfMediaId: input.pdfMediaId,
    coverMediaId: input.coverMediaId,
    pageCount: input.pageCount ?? 0,
    uploadedBy: input.uploadedBy,
  });
}

export async function findById(id: Types.ObjectId | string): Promise<EpaperModel | null> {
  return Epaper.findById(id).exec();
}

export interface ListEpapersOptions {
  page?: number;
  limit?: number;
  from?: Date;
  to?: Date;
}

export async function list(
  options: ListEpapersOptions = {},
): Promise<{ items: EpaperModel[]; total: number }> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.max(1, Math.min(100, options.limit ?? 20));
  const skip = (page - 1) * limit;

  const filter: FilterQuery<EpaperDocument> = {};
  if (options.from || options.to) {
    filter.issueDate = {};
    if (options.from) filter.issueDate.$gte = options.from;
    if (options.to) filter.issueDate.$lte = options.to;
  }

  const [items, total] = await Promise.all([
    Epaper.find(filter).sort({ issueDate: -1 }).skip(skip).limit(limit).exec(),
    Epaper.countDocuments(filter).exec(),
  ]);

  return { items, total };
}

export async function deleteById(id: Types.ObjectId | string): Promise<boolean> {
  const result = await Epaper.deleteOne({ _id: id }).exec();
  return result.deletedCount === 1;
}

/**
 * Increment a stats counter atomically. Used by the download endpoint to
 * bump `downloads` without optimistic concurrency (counters are not
 * multi-writer sensitive — last write wins is fine).
 */
export async function incrementStat(
  id: Types.ObjectId | string,
  stat: 'downloads' | 'views',
  by = 1,
): Promise<void> {
  await Epaper.updateOne({ _id: id }, { $inc: { [`stats.${stat}`]: by } }).exec();
}
