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
