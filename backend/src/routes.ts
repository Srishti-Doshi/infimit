/**
 * Top-level router composition — mounts every module under /v1.
 *
 * Health probes are mounted at the root in app.ts (not here) so orchestrators
 * don't depend on the API version.
 *
 * Per docs/05-api-documentation.md §5: all business routes live under /v1.
 */
import { Router } from 'express';

import { authRoutes } from '@/modules/auth';
import { userRoutes } from '@/modules/users';
import { organisationRoutes } from '@/modules/organisations';
import { articleRoutes } from '@/modules/articles';
import { commentRoutes } from '@/modules/comments';
import { mediaRoutes } from '@/modules/media';
import { tagRoutes } from '@/modules/tags';
import { analyticsRoutes } from '@/modules/analytics';
import { notificationRoutes } from '@/modules/notifications';
import { adRoutes } from '@/modules/ads';
import { epaperRoutes } from '@/modules/epaper';
import { bookmarkRoutes } from '@/modules/bookmarks';
import { searchRoutes } from '@/modules/search';

const apiV1 = Router();

apiV1.use('/auth', authRoutes);
apiV1.use('/users', userRoutes);
apiV1.use('/organisations', organisationRoutes);
apiV1.use('/articles', articleRoutes);
apiV1.use('/articles/:articleId/comments', commentRoutes);
apiV1.use('/comments', commentRoutes);
apiV1.use('/media', mediaRoutes);
apiV1.use('/tags', tagRoutes);
apiV1.use('/analytics', analyticsRoutes);
apiV1.use('/notifications', notificationRoutes);
apiV1.use('/ads', adRoutes);
apiV1.use('/epapers', epaperRoutes);
apiV1.use('/bookmarks', bookmarkRoutes);
apiV1.use('/search', searchRoutes);

export default apiV1;
