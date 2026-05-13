/**
 * events module — internal cross-module event handlers.
 *
 * No HTTP surface. The router export is intentionally empty so the
 * canonical module shape from docs/12-folder-structure.md §12.2 is preserved.
 *
 * Subphase 4 will register listeners here that subscribe to:
 *   article.approved → notifications.send + audit
 *   article.published → cache invalidate + search index
 *   comment.approved → notifications.send
 */
import { Router } from 'express';

const router = Router();
export default router;
