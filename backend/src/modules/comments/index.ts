export { default as commentRoutes } from './routes';

// Model — Subphase 3 ships the schema + indexes only; the write/moderation
// logic lands in Subphase 4. The model is exported so other modules (e.g.
// articles' commentsCount stat) and the migration script can reach it.
export {
  Comment,
  COMMENT_STATUSES,
  type CommentDocument,
  type CommentModel,
  type CommentStatus,
  type CommentAiModeration,
} from './model';
