/**
 * Cache wrapper unit tests.
 *
 * Mocks `@/config/redis` with the existing in-memory stub used by the
 * integration suite so the cache wrapper's getOrSet / del / single-flight
 * semantics are exercised against deterministic state.
 */
jest.mock('@/config/redis', () => require('../../integration/_redisMock'));

import { getOrSet, del, resetCacheForTests } from '../../../src/shared/cache';
import { __resetRedisMock } from '../../integration/_redisMock';

beforeEach(() => {
  __resetRedisMock();
  resetCacheForTests();
});

describe('getOrSet — basic semantics', () => {
  it('runs the loader on cache miss and returns its value', async () => {
    const loader = jest.fn(async () => ({ id: '1', name: 'Hello' }));
    const result = await getOrSet('article:slug:hello', 60, loader);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: '1', name: 'Hello' });
  });

  it('returns the cached value on the second call (loader not re-invoked)', async () => {
    const loader = jest.fn(async () => ({ id: '1', name: 'Hello' }));

    await getOrSet('article:slug:hello', 60, loader);
    const second = await getOrSet('article:slug:hello', 60, loader);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(second).toEqual({ id: '1', name: 'Hello' });
  });

  it('respects different keys independently', async () => {
    const loaderA = jest.fn(async () => 'A');
    const loaderB = jest.fn(async () => 'B');

    const a = await getOrSet('feed:home', 60, loaderA);
    const b = await getOrSet('feed:trending', 60, loaderB);

    expect(a).toBe('A');
    expect(b).toBe('B');
    expect(loaderA).toHaveBeenCalledTimes(1);
    expect(loaderB).toHaveBeenCalledTimes(1);
  });

  it('forceRefresh skips the cache read but still writes back', async () => {
    const loader = jest.fn(async () => 'first');
    await getOrSet('feed:home', 60, loader); // primes cache with 'first'

    const loader2 = jest.fn(async () => 'second');
    const result = await getOrSet('feed:home', 60, loader2, { forceRefresh: true });
    expect(result).toBe('second');
    expect(loader2).toHaveBeenCalledTimes(1);

    // Subsequent default call returns the refreshed value.
    const loader3 = jest.fn(async () => 'should-not-be-called');
    const third = await getOrSet('feed:home', 60, loader3);
    expect(third).toBe('second');
    expect(loader3).not.toHaveBeenCalled();
  });
});

describe('getOrSet — single-flight stampede prevention', () => {
  it('coalesces N concurrent misses on the same key onto ONE loader call', async () => {
    // Loader has a small delay so concurrent callers pile up onto the same
    // in-flight promise rather than each running to completion in series.
    const loader = jest.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'the-value';
    });

    // Fire 10 concurrent calls. With single-flight they share one loader call.
    const calls = Array.from({ length: 10 }, () => getOrSet('feed:home', 60, loader));
    const results = await Promise.all(calls);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r === 'the-value')).toBe(true);
  });

  it('clears the in-flight slot after the loader resolves (next call hits cache)', async () => {
    const loader = jest.fn(async () => 'value');
    await getOrSet('article:slug:x', 60, loader);

    // Second call: should hit the redis cache, not the in-flight map and
    // not the loader.
    const loader2 = jest.fn(async () => 'never');
    await getOrSet('article:slug:x', 60, loader2);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader2).not.toHaveBeenCalled();
  });

  it('clears the in-flight slot on loader rejection (next call retries)', async () => {
    const failing = jest.fn(async () => {
      throw new Error('loader exploded');
    });
    await expect(getOrSet('feed:home', 60, failing)).rejects.toThrow('loader exploded');

    // The rejection shouldn't leave a stale promise in the in-flight map —
    // a subsequent call must be free to try again with a fresh loader.
    const recovery = jest.fn(async () => 'recovered');
    const result = await getOrSet('feed:home', 60, recovery);
    expect(result).toBe('recovered');
    expect(recovery).toHaveBeenCalledTimes(1);
  });
});

describe('del — invalidation', () => {
  it('removes a single key', async () => {
    await getOrSet('article:slug:gone', 60, async () => 'temp');
    await del('article:slug:gone');

    // Next getOrSet should miss the cache and re-run the loader.
    const loader = jest.fn(async () => 'fresh');
    const result = await getOrSet('article:slug:gone', 60, loader);
    expect(loader).toHaveBeenCalled();
    expect(result).toBe('fresh');
  });

  it('removes multiple keys in one call', async () => {
    await getOrSet('feed:home', 60, async () => 'h');
    await getOrSet('feed:trending', 60, async () => 't');
    await del('feed:home', 'feed:trending');

    const homeLoader = jest.fn(async () => 'h2');
    const trendingLoader = jest.fn(async () => 't2');
    await getOrSet('feed:home', 60, homeLoader);
    await getOrSet('feed:trending', 60, trendingLoader);

    expect(homeLoader).toHaveBeenCalled();
    expect(trendingLoader).toHaveBeenCalled();
  });

  it('is a no-op when passed zero keys', async () => {
    await expect(del()).resolves.toBeUndefined();
  });
});
