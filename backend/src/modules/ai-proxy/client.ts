/**
 * ai-proxy client — SKELETON. Real implementation in Subphase 4
 * (per Backend_Handler_Documentation §4: opossum circuit breaker, 2 s
 * timeout, 1 retry with 200 ms jitter, fallback on circuit-open).
 *
 * For Subphase 1 we lock the **shape** of the public surface so consumers
 * (articles.service.approve, etc.) can be written against the type now
 * and connected later by swapping the implementation in service.ts.
 *
 * Contract per docs/06-ai-service.md §6.2.1.
 */

export interface SummarizeOptions {
  maxWords?: number;          // 20..120
  style?: 'neutral' | 'engaging' | 'academic';
}

export interface SummarizeResult {
  summary: string;
  confidence: number;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cached: boolean;
  degraded: boolean;
}
