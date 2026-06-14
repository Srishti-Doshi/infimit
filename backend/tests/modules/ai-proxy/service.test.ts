/**
 * ai-proxy unit tests — nock-mocked HTTP layer.
 *
 * These tests own the resilience contract: timeout, retry semantics,
 * X-Degraded propagation, circuit-open fallback. Tighten deliberately.
 *
 * The AI service URL points at the env default (`http://localhost:8000`)
 * which is what `loadEnv()` returns when nothing overrides it; nock
 * intercepts on that origin so no real socket opens.
 */
import nock from 'nock';

import { aiProxy, resetAiProxyForTests } from '../../../src/modules/ai-proxy';
import { resetEnvForTests } from '../../../src/config/env';

const AI_BASE = 'http://localhost:8000';

const VALID_RESPONSE = {
  summary: 'Education policy is shifting.',
  confidence: 0.92,
  model: 'mock-llama-3',
  tokensIn: 150,
  tokensOut: 12,
  cached: false,
  degraded: false,
};

beforeEach(() => {
  process.env.AI_SERVICE_URL = AI_BASE;
  process.env.AI_INTERNAL_KEY = 'test-internal-key';
  process.env.AI_REQUEST_TIMEOUT_MS = '2000';
  resetEnvForTests();
  resetAiProxyForTests();
  nock.cleanAll();
  // Block any non-mocked HTTP from this test file — surfaces typos in
  // nock interceptor URLs as clear errors instead of hanging requests.
  nock.disableNetConnect();
});

afterAll(() => {
  nock.cleanAll();
  nock.enableNetConnect();
  resetAiProxyForTests();
});

describe('aiProxy.summarize — happy path', () => {
  it('returns the AI service result with default opts', async () => {
    nock(AI_BASE).post('/v1/summarize').reply(200, VALID_RESPONSE);
    const result = await aiProxy.summarize('Some article text.');
    expect(result.summary).toBe('Education policy is shifting.');
    expect(result.model).toBe('mock-llama-3');
    expect(result.degraded).toBe(false);
  });

  it('passes through caller-supplied maxWords + style', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    nock(AI_BASE)
      .post('/v1/summarize', (body) => {
        capturedBody = body;
        return true;
      })
      .reply(200, VALID_RESPONSE);

    await aiProxy.summarize('text', { maxWords: 80, style: 'engaging' });
    expect(capturedBody).toMatchObject({ text: 'text', maxWords: 80, style: 'engaging' });
  });

  it('sends X-Internal-Key header on every call', async () => {
    let capturedKey: string | undefined;
    nock(AI_BASE, {
      reqheaders: {
        'x-internal-key': (val: string) => {
          capturedKey = val;
          return true;
        },
      },
    })
      .post('/v1/summarize')
      .reply(200, VALID_RESPONSE);

    await aiProxy.summarize('text');
    expect(capturedKey).toBe('test-internal-key');
  });
});

describe('aiProxy.summarize — degraded propagation', () => {
  it('surfaces degraded:true from the response body', async () => {
    nock(AI_BASE)
      .post('/v1/summarize')
      .reply(200, { ...VALID_RESPONSE, degraded: true, model: 'fallback-extractive' });

    const result = await aiProxy.summarize('text');
    expect(result.degraded).toBe(true);
    expect(result.model).toBe('fallback-extractive');
  });

  it('surfaces X-Degraded header as degraded:true even when body says false', async () => {
    nock(AI_BASE).post('/v1/summarize').reply(200, VALID_RESPONSE, { 'X-Degraded': 'true' });
    const result = await aiProxy.summarize('text');
    expect(result.degraded).toBe(true);
  });
});

describe('aiProxy.summarize — retry on retriable errors', () => {
  it('retries once on 500 and returns the second attempt', async () => {
    nock(AI_BASE).post('/v1/summarize').reply(500, { error: 'temporary' });
    nock(AI_BASE).post('/v1/summarize').reply(200, VALID_RESPONSE);

    const result = await aiProxy.summarize('text');
    expect(result.summary).toBe(VALID_RESPONSE.summary);
    expect(result.degraded).toBe(false);
  });

  it('does NOT retry on 4xx (caller-error class) — single HTTP call, then fallback', async () => {
    // opossum's fallback fires on any rejection. We verify the no-retry
    // contract by counting HTTP calls instead of expecting a throw.
    let calls = 0;
    nock(AI_BASE)
      .post('/v1/summarize')
      .times(2)
      .reply(() => {
        calls += 1;
        return [400, { error: 'bad input' }];
      });

    const result = await aiProxy.summarize('text');
    expect(calls).toBe(1); // no retry on 4xx
    expect(result.degraded).toBe(true); // fallback kicked in
    expect(result.model).toBe('circuit-open');
  });

  it('falls back when both attempts fail with 500 (retry exhausted)', async () => {
    let calls = 0;
    nock(AI_BASE)
      .post('/v1/summarize')
      .times(2)
      .reply(() => {
        calls += 1;
        return [500, { error: 'oops' }];
      });

    const result = await aiProxy.summarize('text');
    expect(calls).toBe(2); // initial + 1 retry
    expect(result.degraded).toBe(true);
    expect(result.model).toBe('circuit-open');
  });
});

describe('aiProxy.summarize — circuit breaker', () => {
  it('opens after 5 consecutive failures; subsequent calls short-circuit (no HTTP)', async () => {
    // Five failed calls to trip the breaker (volumeThreshold=5 + 50% error
    // rate). Each call costs one retry, so we mock 10 responses (5 calls ×
    // 2 attempts each).
    nock(AI_BASE).post('/v1/summarize').times(10).reply(500, { error: 'down' });

    for (let i = 0; i < 5; i += 1) {
      // Each pre-open call returns the fallback (opossum's fallback fires on
      // any rejection); the breaker counts these as failures until the
      // threshold trips.
      // eslint-disable-next-line no-await-in-loop
      const r = await aiProxy.summarize('text');
      expect(r.degraded).toBe(true);
    }

    // Sixth call: breaker is open. Verify by removing ALL interceptors so
    // that any HTTP attempt would throw NetConnectNotAllowed. If the
    // fallback resolves cleanly without that, the circuit short-circuited.
    nock.cleanAll();
    nock.disableNetConnect();
    const fallback = await aiProxy.summarize('text');
    expect(fallback.degraded).toBe(true);
    expect(fallback.model).toBe('circuit-open');
    expect(fallback.summary).toBe('');
  });
});

describe('aiProxy.summarize — timeout is env-driven (AI_REQUEST_TIMEOUT_MS)', () => {
  it('falls back when the response is slower than AI_REQUEST_TIMEOUT_MS', async () => {
    // Tight budget; the response arrives well after it. Pre-fix the timeout was
    // hardcoded at 2000ms, so this 300ms-delayed reply would NOT trip it and
    // the call would succeed — this test fails on the old code and passes once
    // AI_REQUEST_TIMEOUT_MS is wired into both the axios client and the breaker.
    process.env.AI_REQUEST_TIMEOUT_MS = '50';
    resetEnvForTests();
    resetAiProxyForTests();
    nock(AI_BASE).post('/v1/summarize').delay(300).times(5).reply(200, VALID_RESPONSE);

    const result = await aiProxy.summarize('text');
    expect(result.degraded).toBe(true);
    expect(result.model).toBe('circuit-open');
    expect(result.summary).toBe('');
  });
});
