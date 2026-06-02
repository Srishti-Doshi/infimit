/**
 * Search controller — HTTP layer.
 *
 * Public endpoint, no auth. Returns published articles ranked by Mongo's
 * text score.
 */
import { type Request, type Response } from 'express';

import { asyncHandler } from '@/shared/utils/asyncHandler';

import { searchText } from './service';
import type { SearchQuery } from './validator';

export const searchHandler = asyncHandler(async (req: Request, res: Response) => {
  // Cast through unknown — validate() middleware has replaced req.query
  // with the parsed schema output (q required + typed), but TS sees the
  // raw `ParsedQs` at the route boundary.
  const query = req.query as unknown as SearchQuery;
  const result = await searchText({
    q: query.q,
    category: query.category,
    page: query.page,
    limit: query.limit,
  });
  res.status(200).json({
    success: true,
    data: {
      items: result.items.map((a) => a.toJSON()),
      total: result.total,
      page: result.page,
      limit: result.limit,
    },
  });
});
