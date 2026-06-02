export { default as notificationRoutes } from './routes';

// Model — types + Mongoose model for downstream consumers + the migration script.
export {
  Notification,
  NOTIFICATION_TYPES,
  type NotificationDocument,
  type NotificationModel,
  type NotificationType,
  type NotificationChannel,
} from './model';

// Repository — exposed for tests + cross-module reads (none in P1).
export * as notificationsRepo from './repository';

// Service — `sendNotification` is exposed so other modules CAN emit directly
// in special cases (e.g. an admin-driven "system" notification in P2). In P1
// the listeners do all the writes.
export { sendNotification, sendNotifications } from './service';

// Listeners — registration helper called once at boot from
// `@/modules/events/index.ts`. Test-only reset exported too.
export { registerNotificationListeners, resetNotificationListenersForTests } from './listeners';
