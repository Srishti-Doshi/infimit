/**
 * ai-proxy service — SKELETON. Real wiring in Subphase 4.
 *
 * Stub implementation throws AI_UNAVAILABLE if called pre-Subphase 4.
 * The shape is locked here so callers in Subphase 3 onwards can be coded
 * against the typed interface and swapped in later.
 */
import { ApiError, ErrorCode } from '@/shared/errors';
import type { SummarizeOptions, SummarizeResult } from './client';

export const aiProxy = {
  async summarize(_text: string, _opts: SummarizeOptions = {}): Promise<SummarizeResult> {
    throw new ApiError(503, ErrorCode.AI_UNAVAILABLE, 'ai-proxy not wired until Subphase 4');
  },
};
