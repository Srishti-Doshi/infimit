/**
 * Search event listeners.
 *
 * Subscribes to `article.published` → `indexArticle` and
 * `article.unpublished` → `removeArticle`. Both are no-ops on Mongo (the
 * text index updates with the underlying document) — the listeners exist
 * so the migration to Atlas Search / Qdrant in Phase 2 just swaps the
 * service body without touching emitters or callers.
 *
 * Failures are caught + logged so a search-index hiccup never blocks the
 * publish thread.
 */
import { Types } from 'mongoose';

import { articleEvents, Article } from '@/modules/articles';
import { logger } from '@/config/logger';

import { indexArticle, removeArticle } from './service';

let registered = false;

export function registerSearchListeners(): void {
  if (registered) return;
  registered = true;

  articleEvents.on('article.published', (payload) => {
    void persistSafely(async () => {
      // Look up the full article so we hand it to the indexer (Phase 2
      // implementations will need title + plainText + tags + slug).
      const article = await Article.findById(payload.articleId).exec();
      if (article) await indexArticle(article);
    }, payload.articleId);
  });

  articleEvents.on('article.unpublished', (payload) => {
    void persistSafely(
      () => removeArticle(new Types.ObjectId(payload.articleId)),
      payload.articleId,
    );
  });
}

/** Test-only: detach listeners so each test file starts clean. */
export function resetSearchListenersForTests(): void {
  // The shared emitter has notifications + search listeners both attached
  // to article.published / article.unpublished. We only need to remove ours,
  // but `removeAllListeners` is global — that's OK because every integration
  // test calls `startTestEnv` → `registerEventListeners` which re-attaches
  // everyone.
  articleEvents.removeAllListeners('article.published');
  articleEvents.removeAllListeners('article.unpublished');
  registered = false;
}

async function persistSafely(action: () => Promise<unknown>, articleId: string): Promise<void> {
  try {
    await action();
  } catch (err) {
    logger.warn({ err, articleId }, 'search_listener_failed');
  }
}
