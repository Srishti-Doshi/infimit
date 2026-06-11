/**
 * Shared model registry — used by both `migrate.ts` (which syncs indexes)
 * and `verify-indexes.ts` (which audits them against the live database).
 *
 * Extracting this list keeps the two scripts in lockstep: every Mongoose
 * model in the codebase shows up here, and both tools walk the same set.
 * Adding a new model = adding one line.
 */
import type { Model } from 'mongoose';

import { AnalyticsEvent } from '../src/modules/analytics/model';
import { Article } from '../src/modules/articles/model';
import { Bookmark } from '../src/modules/bookmarks/model';
import { Comment } from '../src/modules/comments/model';
import { Epaper } from '../src/modules/epaper/model';
import { Media } from '../src/modules/media/model';
import { Notification } from '../src/modules/notifications/model';
import { Organisation } from '../src/modules/organisations/model';
import { Session } from '../src/modules/auth/model';
import { User } from '../src/modules/users/model';

export interface RegisteredModel {
  readonly name: string;
  readonly model: Model<unknown>;
}

export const MODELS: RegisteredModel[] = [
  { name: 'User', model: User as Model<unknown> },
  { name: 'Organisation', model: Organisation as Model<unknown> },
  { name: 'Session', model: Session as Model<unknown> },
  { name: 'Article', model: Article as Model<unknown> },
  { name: 'Media', model: Media as Model<unknown> },
  { name: 'Comment', model: Comment as Model<unknown> },
  { name: 'Notification', model: Notification as Model<unknown> },
  { name: 'Epaper', model: Epaper as Model<unknown> },
  { name: 'Bookmark', model: Bookmark as Model<unknown> },
  { name: 'AnalyticsEvent', model: AnalyticsEvent as Model<unknown> },
];
