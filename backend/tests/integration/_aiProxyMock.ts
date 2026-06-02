/**
 * Module-boundary mock for `@/modules/ai-proxy`.
 *
 * The real module's resilience layer (axios + opossum + retry) is exercised
 * in `tests/modules/ai-proxy/service.test.ts` with nock. Integration tests
 * only care about WHAT articles.service does with the result, so we replace
 * the module entirely with a deterministic stub.
 *
 * Tests can override the next response with `__setNextAiResponse(...)`:
 *   - simulate "AI degraded / circuit open" with `{ degraded: true, summary: '', model: 'circuit-open' }`
 *   - simulate a slow / specific response by passing partial overrides
 *
 * `resetAiProxyForTests()` is wired into the same lifecycle as the redis +
 * s3 mocks so it clears between cases.
 */
import type { SummarizeOptions, SummarizeResult } from '@/modules/ai-proxy';

const DEFAULT_RESPONSE: SummarizeResult = {
  summary: 'A concise mock summary of the article body.',
  confidence: 0.9,
  model: 'mock-llama-3',
  tokensIn: 100,
  tokensOut: 20,
  cached: false,
  degraded: false,
};

let nextResponse: SummarizeResult = { ...DEFAULT_RESPONSE };
const calls: Array<{ text: string; opts: SummarizeOptions }> = [];

export const aiProxy = {
  async summarize(text: string, opts: SummarizeOptions = {}): Promise<SummarizeResult> {
    calls.push({ text, opts });
    return { ...nextResponse };
  },
};

export function resetAiProxyForTests(): void {
  nextResponse = { ...DEFAULT_RESPONSE };
  calls.length = 0;
}

export function __setNextAiResponse(partial: Partial<SummarizeResult>): void {
  nextResponse = { ...DEFAULT_RESPONSE, ...partial };
}

export function __aiProxyCalls(): ReadonlyArray<{ text: string; opts: SummarizeOptions }> {
  return calls;
}
