// Two routers — mounted at distinct paths in src/routes.ts.
//   - articleScopedCommentRoutes → /articles/:articleId/comments (read + post)
//   - commentModerationRoutes    → /comments                     (moderation queue + actions + delete)
export { articleScopedCommentRoutes, commentModerationRoutes } from './routes';

// Back-compat alias for the pre-Subphase 4 single-router export. Removed in
// a follow-up cleanup once nothing imports it.
export { default as commentRoutes } from './routes';

// Model — Subphase 3 shipped the schema + indexes; Subphase 4 (this PR)
// fills in the write/moderation business logic.
export {
  Comment,
  COMMENT_STATUSES,
  type CommentDocument,
  type CommentModel,
  type CommentStatus,
  type CommentAiModeration,
} from './model';

// Repository — exported as a namespace per the canonical pattern. Used by
// the notifications listeners to look up the article + commenter when a
// `comment.approved` event lands.
export * as commentsRepo from './repository';

// Events — the typed emitter + boot-time registration helper. The shared
// events bus calls `registerCommentEventListeners()` at startup.
export {
  commentEvents,
  registerCommentEventListeners,
  type CommentApprovedPayload,
} from './events';
