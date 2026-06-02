/**
 * ai-proxy service — opossum-wrapped axios client for the AI sidecar.
 *
 * Talks to the AI service (separate Python process — see docs/06-ai-service.md)
 * over HTTP. Backend code calls `aiProxy.summarize(...)`; everything else
 * (retry, circuit breaker, fallback, X-Degraded propagation, timeouts) is
 * encapsulated here.
 *
 * Resilience layers (in order of defence):
 *   1. axios timeout (2s) — bounds a single attempt.
 *   2. Retry on retriable errors (timeout, 5xx) — single retry with 200ms +
 *      0-100ms jitter. Stops fast-failing the AI on transient hiccups.
 *   3. opossum circuit breaker — after ~5 failures, opens for 30s. Open-state
 *      calls return a fallback `{ summary: '', degraded: true, model:
 *      'circuit-open' }` immediately, no network hop.
 *   4. Caller responsibility — `articles.service.approve` writes
 *      `article.ai.degraded` from the result and proceeds with the state
 *      transition. Approval NEVER waits on (or fails because of) the AI.
 *
 * Lazy construction of the breaker + axios client lets tests reset the
 * module between cases via `resetAiProxyForTests()` (used in unit tests that
 * mock the HTTP layer with `nock`).
 */
import axios, { type AxiosInstance } from 'axios';
import CircuitBreaker from 'opossum';

import { loadEnv } from '@/config/env';
import { logger } from '@/config/logger';

import type { SummarizeOptions, SummarizeResult } from './client';

const HTTP_TIMEOUT_MS = 2_000;
const RETRY_BASE_MS = 200;
const RETRY_JITTER_MS = 100;

// Circuit-breaker tuning per docs/06-ai-service.md §6.4:
//   - 5 consecutive failures within the rolling window → open.
//   - Once open, stays open for 30s before allowing a half-open probe.
//   - errorThresholdPercentage=50 + volumeThreshold=5 means we need at least
//     5 calls AND ≥50% failure rate to open. Tunable later via env if needed.
const CIRCUIT_TIMEOUT_MS = 2_000;
const CIRCUIT_VOLUME_THRESHOLD = 5;
const CIRCUIT_ERROR_PERCENTAGE = 50;
const CIRCUIT_ROLLING_WINDOW_MS = 30_000;
const CIRCUIT_RESET_MS = 30_000;

interface SummarizePayload {
  text: string;
  maxWords: number;
  style: 'neutral' | 'engaging' | 'academic';
}

// ─── Lazy axios client ──────────────────────────────────────────────────

let httpClient: AxiosInstance | null = null;

function getHttpClient(): AxiosInstance {
  if (httpClient) return httpClient;
  const env = loadEnv();
  httpClient = axios.create({
    baseURL: env.AI_SERVICE_URL,
    timeout: HTTP_TIMEOUT_MS,
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Key': env.AI_INTERNAL_KEY,
    },
    // Treat anything ≥ 400 as a failure so axios throws and the breaker
    // observes it.
    validateStatus: (status) => status >= 200 && status < 400,
  });
  return httpClient;
}

// ─── Retry helper ───────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriable(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  // Timeouts: axios surfaces these as `ECONNABORTED` (timeout) or
  // `ETIMEDOUT` (DNS / socket). Both should retry once.
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return true;
  const status = err.response?.status;
  // 5xx from the AI is "service problem, try once more". 4xx (incl. 429) is
  // NOT retried — the caller's input is the problem, or the AI is rate-limiting
  // on purpose.
  return typeof status === 'number' && status >= 500 && status < 600;
}

interface RawSummarizeResponse {
  summary?: string;
  confidence?: number;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  cached?: boolean;
  degraded?: boolean;
}

function mapResponse(
  data: RawSummarizeResponse,
  headers: Record<string, string | undefined>,
): SummarizeResult {
  // The AI service signals degraded mode either via the `X-Degraded: true`
  // header or via a `degraded: true` field in the body. Surface either as
  // the canonical boolean on the result so callers don't need to know which
  // channel carried it.
  const headerDegraded = (headers['x-degraded'] ?? '').toLowerCase() === 'true';
  return {
    summary: data.summary ?? '',
    confidence: data.confidence ?? 0,
    model: data.model ?? 'unknown',
    tokensIn: data.tokensIn ?? 0,
    tokensOut: data.tokensOut ?? 0,
    cached: data.cached ?? false,
    degraded: Boolean(data.degraded) || headerDegraded,
  };
}

async function callSummarizeOnce(payload: SummarizePayload): Promise<SummarizeResult> {
  const http = getHttpClient();
  const res = await http.post<RawSummarizeResponse>('/v1/summarize', payload);
  return mapResponse(res.data, res.headers as Record<string, string | undefined>);
}

async function callSummarizeWithRetry(payload: SummarizePayload): Promise<SummarizeResult> {
  try {
    return await callSummarizeOnce(payload);
  } catch (err) {
    if (!isRetriable(err)) throw err;
    const delay = RETRY_BASE_MS + Math.random() * RETRY_JITTER_MS;
    logger.debug({ delay, code: axios.isAxiosError(err) ? err.code : undefined }, 'ai_retry');
    await sleep(delay);
    return callSummarizeOnce(payload);
  }
}

// ─── Circuit breaker ────────────────────────────────────────────────────

type SummarizeBreaker = CircuitBreaker<[SummarizePayload], SummarizeResult>;

let breaker: SummarizeBreaker | null = null;

function getBreaker(): SummarizeBreaker {
  if (breaker) return breaker;
  breaker = new CircuitBreaker<[SummarizePayload], SummarizeResult>(callSummarizeWithRetry, {
    name: 'ai-summarize',
    timeout: CIRCUIT_TIMEOUT_MS,
    volumeThreshold: CIRCUIT_VOLUME_THRESHOLD,
    errorThresholdPercentage: CIRCUIT_ERROR_PERCENTAGE,
    rollingCountTimeout: CIRCUIT_ROLLING_WINDOW_MS,
    rollingCountBuckets: 10,
    resetTimeout: CIRCUIT_RESET_MS,
  });

  // Fallback on `open` (and on rejections when set unconditionally — see
  // opossum docs). Returns immediately, no network hop. The caller checks
  // `result.degraded` and proceeds without storing a meaningless summary.
  breaker.fallback(
    (): SummarizeResult => ({
      summary: '',
      confidence: 0,
      model: 'circuit-open',
      tokensIn: 0,
      tokensOut: 0,
      cached: false,
      degraded: true,
    }),
  );

  // Log state transitions. Phase 2 routes these to Prometheus; for Phase 1
  // they're enough to grep audit logs when debugging an AI outage.
  breaker.on('open', () => {
    logger.warn({ breaker: 'ai-summarize', state: 'open' }, 'circuit_open');
  });
  breaker.on('halfOpen', () => {
    logger.info({ breaker: 'ai-summarize', state: 'half_open' }, 'circuit_half_open');
  });
  breaker.on('close', () => {
    logger.info({ breaker: 'ai-summarize', state: 'closed' }, 'circuit_closed');
  });

  return breaker;
}

// ─── Public surface ─────────────────────────────────────────────────────

export const aiProxy = {
  async summarize(text: string, opts: SummarizeOptions = {}): Promise<SummarizeResult> {
    const payload: SummarizePayload = {
      text,
      maxWords: opts.maxWords ?? 60,
      style: opts.style ?? 'neutral',
    };
    return getBreaker().fire(payload);
  },
};

/**
 * Test-only: drops the cached client + breaker so a fresh `loadEnv()` /
 * nock interceptor / fake clock takes effect on the next call.
 */
export function resetAiProxyForTests(): void {
  if (breaker) {
    breaker.shutdown();
    breaker = null;
  }
  httpClient = null;
}
