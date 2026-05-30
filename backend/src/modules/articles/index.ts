export { default as articleRoutes } from './routes';

// Model — types + the Mongoose model for downstream cross-module consumers.
export {
  Article,
  ARTICLE_STATUSES,
  type ArticleDocument,
  type ArticleModel,
  type ArticleStatus,
  type ArticlePlacement,
  type ArticleAi,
  type ArticleStats,
} from './model';

// Repository — exposed for cross-module reads (e.g. comments will pull article
// metadata when posting). Service-level error mapping stays the consumer's job.
export * as articlesRepo from './repository';

// Events — the typed emitter + the boot-time registration helper. The shared
// events bus in `@/modules/events` calls registerArticleEventListeners() from
// app.ts at startup; this barrel exposes the emitter for tests or future
// cross-module subscribers (notifications module in Subphase 4).
export {
  articleEvents,
  registerArticleEventListeners,
  type ArticleCreatedPayload,
  type ArticleSubmittedPayload,
} from './events';
