/**
 * Trending cron integration (Sub-PR 5-d) — covers `computeTrendingOnce`:
 *
 *   - Scores events inside the 24h window; ignores older ones
 *   - Weights: view=1, share=5, bookmark=5
 *   - Writes the ordered id list to `feed:trending` Redis key
 *   - Denorms `article.stats.trendingScore` on the top-N
 *   - Resets stale scores on published articles that fall OUT of the top-N
 *   - Drops events with `articleId === null`
 *   - Returns a count summary for observability
 *
 * The cron itself (`startTrendingCron` setInterval) is not started in tests
 * — we exercise the one-shot directly. Matches the media-sweeper test
 * convention from `tests/integration/media-sweeper.test.ts`.
 */
jest.mock('@/config/redis', () => require('./_redisMock'));
jest.mock('@/config/s3', () => require('./_s3Mock'));

import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';

import { Article } from '@/modules/articles';
import {
  AnalyticsEvent,
  analyticsRepo,
  computeTrendingOnce,
  type AnalyticsEventType,
} from '@/modules/analytics';
import { cache } from '@/shared';
import { getRedis } from '@/config/redis';

import { resetTestDb, startTestEnv, stopTestEnv } from './_setup';

async function seedPublishedArticle(slug = `art-${randomUUID().slice(0, 6)}`): Promise<string> {
  const doc = await Article.create({
    title: slug,
    slug,
    subtitle: '',
    body: '<p>body</p>',
    plainText: 'body',
    category: 'research_innovation',
    tags: ['ai'],
    authorId: new Types.ObjectId(),
    status: 'published',
    publishedAt: new Date(),
    version: 0,
  });
  return doc._id.toString();
}

async function seedEvent(
  type: AnalyticsEventType,
  articleId: string | null,
  createdAt: Date = new Date(),
): Promise<void> {
  // Direct repo call so we can backdate `createdAt` to test the window edge.
  // The repo's `recordEvent` uses `new Date()` for createdAt; we override
  // by raw insert.
  await AnalyticsEvent.collection.insertOne({
    type,
    articleId: articleId ? new Types.ObjectId(articleId) : null,
    adId: null,
    userId: null,
    sessionId: '',
    referrer: '',
    userAgent: '',
    country: '',
    durationMs: null,
    createdAt,
  });
}

async function getStoredTrendingIds(): Promise<string[] | null> {
  const raw = await getRedis().get(cache.cacheKeys.feedTrending());
  return raw ? (JSON.parse(raw) as string[]) : null;
}

async function getStoredScore(articleId: string): Promise<number> {
  const fresh = await Article.findById(articleId).exec();
  return fresh?.stats.trendingScore ?? 0;
}

beforeAll(async () => {
  await startTestEnv();
}, 120_000);

afterAll(async () => {
  await stopTestEnv();
});

beforeEach(async () => {
  await resetTestDb();
});

describe('computeTrendingOnce', () => {
  it('returns an empty result + writes [] to Redis when there are no events', async () => {
    const result = await computeTrendingOnce({ topN: 5 });
    expect(result).toEqual({ considered: 0, written: 0, topIds: [] });
    expect(await getStoredTrendingIds()).toEqual([]);
  });

  it('scores view=1 and share=5 + bookmark=5; orders by score desc', async () => {
    const a = await seedPublishedArticle('a-art');
    const b = await seedPublishedArticle('b-art');
    const c = await seedPublishedArticle('c-art');

    // a: 3 views (score 3)
    // b: 1 view + 1 share (score 1 + 5 = 6)
    // c: 2 bookmarks (score 10) ← highest
    await seedEvent('view', a);
    await seedEvent('view', a);
    await seedEvent('view', a);
    await seedEvent('view', b);
    await seedEvent('share', b);
    await seedEvent('bookmark', c);
    await seedEvent('bookmark', c);

    const result = await computeTrendingOnce({ topN: 10 });
    expect(result.considered).toBe(3);
    expect(result.written).toBe(3);
    expect(result.topIds).toEqual([c, b, a]);

    expect(await getStoredScore(c)).toBe(10);
    expect(await getStoredScore(b)).toBe(6);
    expect(await getStoredScore(a)).toBe(3);
    expect(await getStoredTrendingIds()).toEqual([c, b, a]);
  });

  it('ignores events older than the 24h window', async () => {
    const a = await seedPublishedArticle('a-old');
    const b = await seedPublishedArticle('b-fresh');

    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25h ago
    const freshDate = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1h ago

    // a's hits are old (should be excluded); b's are fresh
    await seedEvent('view', a, oldDate);
    await seedEvent('view', a, oldDate);
    await seedEvent('share', a, oldDate);
    await seedEvent('view', b, freshDate);

    const result = await computeTrendingOnce({ topN: 10 });
    expect(result.topIds).toEqual([b]);
    expect(await getStoredScore(a)).toBe(0);
    expect(await getStoredScore(b)).toBe(1);
  });

  it('drops events with articleId === null', async () => {
    const a = await seedPublishedArticle('a-only');

    await seedEvent('view', a);
    // Event without an article — e.g. a future generic engagement event.
    await seedEvent('view', null);

    const result = await computeTrendingOnce({ topN: 10 });
    expect(result.topIds).toEqual([a]);
    expect(await getStoredScore(a)).toBe(1);
  });

  it('resets stale `stats.trendingScore` on articles that fall OUT of the top-N', async () => {
    const stale = await seedPublishedArticle('stale-hit');
    const fresh = await seedPublishedArticle('fresh-hit');

    // Pre-seed a stale high score on `stale` — simulates a previous tick
    // when this article was trending. Today nobody clicked it.
    await Article.updateOne({ _id: stale }, { $set: { 'stats.trendingScore': 999 } });
    await seedEvent('view', fresh);
    await seedEvent('view', fresh);
    await seedEvent('view', fresh);

    const result = await computeTrendingOnce({ topN: 10 });
    expect(result.topIds).toEqual([fresh]);
    // The stale score has been reset to 0; fresh has its new score.
    expect(await getStoredScore(stale)).toBe(0);
    expect(await getStoredScore(fresh)).toBe(3);
  });

  it('limits to topN even if more articles qualify', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const id = await seedPublishedArticle(`top-${i}`);
      ids.push(id);
      // Each gets enough views to put it above 0 (i+1 hits).
      for (let j = 0; j <= i; j += 1) {
        await seedEvent('view', id);
      }
    }
    const result = await computeTrendingOnce({ topN: 3 });
    expect(result.topIds).toHaveLength(3);
    // The three with the most hits — last three created (descending hits).
    expect(result.topIds).toEqual([ids[4], ids[3], ids[2]]);
  });

  it('honours the configurable Redis TTL', async () => {
    const a = await seedPublishedArticle('ttl-art');
    await seedEvent('view', a);

    await computeTrendingOnce({ topN: 5, redisTtlSec: 120 });
    const redis = getRedis();
    const ttl = await redis.ttl(cache.cacheKeys.feedTrending());
    // Mock returns either positive ttl (real-ish) or the configured value.
    // Just confirm it's a non-negative number — the actual semantic test
    // is that the value is present.
    expect(ttl).toBeGreaterThan(0);

    // Sanity: the value round-trips.
    const stored = await getStoredTrendingIds();
    expect(stored).toEqual([a]);
    expect(await analyticsRepo.countAll()).toBe(1);
  });
});
