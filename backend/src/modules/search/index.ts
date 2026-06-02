export { default as searchRoutes } from './routes';

// Service — exposed so other modules CAN invoke index/remove directly in
// special cases (e.g. a backfill cron in Phase 2). In P1 the listeners do it.
export { searchText, indexArticle, removeArticle } from './service';

// Listeners — boot-time registration helper called from @/modules/events.
export { registerSearchListeners, resetSearchListenersForTests } from './listeners';
