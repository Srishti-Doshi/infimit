/**
 * MSW fixture data — minimal shapes that mirror the backend DTOs.
 *
 * These are NOT contracts — the real DTO definitions live in
 * `docs/04-database-design.md` and will be ported to typed contracts in
 * Subphase 2+. Keep fixtures intentionally thin so they're easy to swap.
 */
import type { Article, FeedCard, HomeFeed } from '@/types/article';
import type { Comment } from '@/types/comment';
import type { Epaper } from '@/types/epaper';
import type { Notification } from '@/types/notification';

export const mockUser = {
  id: 'usr_demo_001',
  name: 'Demo Reader',
  email: 'demo@infimit.test',
  role: 'reader',
  avatarUrl: null,
  createdAt: '2026-01-15T08:00:00.000Z',
};

export const mockOrganisation = {
  id: 'org_oakwood_001',
  name: 'Oakwood Institute',
  slug: 'oakwood-institute',
  city: 'Indore',
  country: 'IN',
  verified: true,
};

export const mockCategories = [
  { id: 'cat_india', slug: 'india', name: 'India' },
  { id: 'cat_world', slug: 'world', name: 'World' },
  { id: 'cat_sport', slug: 'sport', name: 'Sport' },
  { id: 'cat_health', slug: 'health', name: 'Health' },
  { id: 'cat_science', slug: 'science', name: 'Science' },
  { id: 'cat_opinion', slug: 'opinion', name: 'Opinion' },
];

/**
 * Subphase 5 reader-shape summaries — used by the still-stubbed homepage feed,
 * search, and by-slug handlers. Renamed from `mockArticles` in Subphase 3 to
 * make room for the real Article-shape `mockDrafts` below.
 */
export const mockArticleSummaries = [
  {
    id: 'art_demo_001',
    slug: 'global-higher-education-trends-2026',
    title: 'Global Higher Education Trends in 2026',
    excerpt: 'A look at the institutional shifts shaping universities worldwide this year.',
    category: 'research_innovation',
    author: { id: 'usr_author_01', name: 'Ishita Mishra' },
    coverImageUrl: null,
    publishedAt: '2026-05-10T09:00:00.000Z',
    readingTimeMinutes: 6,
  },
  {
    id: 'art_demo_002',
    slug: 'inside-the-2026-engineering-rankings',
    title: 'Inside the 2026 Engineering Rankings',
    excerpt: 'Where Indian institutions stand against their global peers this year.',
    category: 'campus_news',
    author: { id: 'usr_author_02', name: 'Arjun Sharma' },
    coverImageUrl: null,
    publishedAt: '2026-05-08T13:30:00.000Z',
    readingTimeMinutes: 8,
  },
  {
    id: 'art_demo_003',
    slug: 'why-research-funding-models-matter',
    title: 'Why Research Funding Models Matter',
    excerpt: 'The quiet policy decisions reshaping postgraduate research worldwide.',
    category: 'education_policy',
    author: { id: 'usr_author_03', name: 'Priya Nair' },
    coverImageUrl: null,
    publishedAt: '2026-05-05T11:15:00.000Z',
    readingTimeMinutes: 5,
  },
];

/**
 * FeedCard fixtures (Sub-PR 5-fa). Mirror the BE's compact reader-card
 * projection — id, slug, title, subtitle, cover, category, byline, AI
 * summary preview, stats. Drives the home page in mock mode.
 */
function feedCard(
  input: Partial<FeedCard> & Pick<FeedCard, 'id' | 'slug' | 'title' | 'category'>,
): FeedCard {
  return {
    id: input.id,
    slug: input.slug,
    title: input.title,
    subtitle: input.subtitle ?? '',
    coverImageUrl: input.coverImageUrl ?? null,
    category: input.category,
    location: input.location ?? '',
    publishedAt: input.publishedAt ?? '2026-05-01T09:00:00.000Z',
    author: input.author ?? { id: 'usr_author_01', name: 'Ishita Mishra' },
    ai: input.ai ?? { summary: '', readingTimeMin: 5, degraded: false },
    stats: input.stats ?? { views: 0, commentsCount: 0, bookmarks: 0 },
  };
}

export const mockHomeFeed: HomeFeed = {
  trail: [
    feedCard({
      id: 'feed_trail_001',
      slug: 'global-higher-education-trends-2026',
      title: 'Global higher education trends in 2026',
      category: 'research_innovation',
    }),
    feedCard({
      id: 'feed_trail_002',
      slug: 'inside-the-2026-engineering-rankings',
      title: 'Inside the 2026 engineering rankings',
      category: 'campus_news',
    }),
    feedCard({
      id: 'feed_trail_003',
      slug: 'campus-accessibility-charter',
      title: 'A new charter for campus accessibility',
      category: 'education_policy',
    }),
  ],
  featured: [
    feedCard({
      id: 'feed_featured_001',
      slug: 'ncea-curriculum-overhaul-2026',
      title: 'NCEA curriculum overhaul lands in 2026',
      subtitle: 'How the national framework is being rewritten for the AI age',
      category: 'education_policy',
      publishedAt: '2026-05-10T09:00:00.000Z',
      ai: {
        summary:
          'New national curriculum centres computational thinking and pairs subject content with mandatory teacher development.',
        readingTimeMin: 6,
        degraded: false,
      },
      stats: { views: 1240, commentsCount: 18, bookmarks: 42 },
    }),
    feedCard({
      id: 'feed_featured_002',
      slug: 'transformer-tutors-classroom-trial',
      title: 'Transformer-based tutors complete first classroom trial',
      subtitle: 'Early results suggest AI explainers narrow the homework gap',
      category: 'tech_in_education',
      publishedAt: '2026-05-12T10:00:00.000Z',
      author: { id: 'usr_author_03', name: 'Priya Nair' },
      ai: {
        summary:
          'Six-school LLM-tutor pilot narrowed the homework-attainment gap; largest gains in households without home internet.',
        readingTimeMin: 7,
        degraded: false,
      },
      stats: { views: 980, commentsCount: 22, bookmarks: 38 },
    }),
    feedCard({
      id: 'feed_featured_003',
      slug: 'state-university-on-campus-startups',
      title: 'State University opens campus to student-led startups',
      subtitle: 'Three teams have already shipped products this semester',
      category: 'campus_news',
      publishedAt: '2026-05-11T08:30:00.000Z',
      author: { id: 'usr_author_02', name: 'Arjun Sharma' },
      ai: {
        summary:
          'Campus venture lab pairs seed grants and mentor access with cross-discipline collaboration; three teams already shipped paying products.',
        readingTimeMin: 5,
        degraded: false,
      },
      stats: { views: 760, commentsCount: 14, bookmarks: 27 },
    }),
  ],
  latest: [
    feedCard({
      id: 'feed_latest_001',
      slug: 'transformer-tutors-classroom-trial',
      title: 'Transformer-based tutors complete first classroom trial',
      subtitle: 'Early results suggest AI explainers narrow the homework gap',
      category: 'tech_in_education',
      publishedAt: '2026-05-12T10:00:00.000Z',
      author: { id: 'usr_author_03', name: 'Priya Nair' },
      ai: {
        summary:
          'Six-school LLM-tutor pilot narrowed the homework-attainment gap, with the largest gains in households without home internet.',
        readingTimeMin: 7,
        degraded: false,
      },
    }),
    feedCard({
      id: 'feed_latest_002',
      slug: 'state-university-on-campus-startups',
      title: 'State University opens campus to student-led startups',
      subtitle: 'Three teams have already shipped products this semester',
      category: 'campus_news',
      publishedAt: '2026-05-11T08:30:00.000Z',
      author: { id: 'usr_author_02', name: 'Arjun Sharma' },
      ai: {
        summary:
          'Campus venture lab pairs seed grants and mentor access with cross-discipline collaboration; three teams launched paying products.',
        readingTimeMin: 5,
        degraded: false,
      },
    }),
    feedCard({
      id: 'feed_latest_003',
      slug: 'why-research-funding-models-matter',
      title: 'Why research funding models matter',
      subtitle: 'The quiet policy decisions reshaping postgraduate research worldwide.',
      category: 'education_policy',
      publishedAt: '2026-05-05T11:15:00.000Z',
      author: { id: 'usr_author_03', name: 'Priya Nair' },
      ai: { summary: '', readingTimeMin: 5, degraded: true },
    }),
  ],
  trending: [
    feedCard({
      id: 'feed_trending_001',
      slug: 'transformer-tutors-classroom-trial',
      title: 'Transformer-based tutors complete first classroom trial',
      category: 'tech_in_education',
    }),
    feedCard({
      id: 'feed_trending_002',
      slug: 'ncea-curriculum-overhaul-2026',
      title: 'NCEA curriculum overhaul lands in 2026',
      category: 'education_policy',
    }),
    feedCard({
      id: 'feed_trending_003',
      slug: 'global-higher-education-trends-2026',
      title: 'Global higher education trends in 2026',
      category: 'research_innovation',
    }),
  ],
};

/**
 * Subphase 3 author-shape mock drafts — mirror the real Article wire shape.
 * Used by the new GET /v1/articles + /v1/articles/:id handlers.
 *
 * Loosely typed here (string for `_` placeholders) so this file stays
 * dependency-free; handlers narrow to `Article` at the consumer.
 */
export const mockDrafts: Article[] = [
  {
    id: 'art_draft_001',
    title: 'Untitled draft about campus accessibility',
    subtitle: '',
    body: '<p>Notes so far — needs more structure before submitting.</p>',
    plainText: 'Notes so far — needs more structure before submitting.',
    coverImageUrl: null,
    coverImageMediaId: null,
    media: [],
    category: 'campus_news',
    subcategory: null,
    tags: ['accessibility'],
    location: null,
    authorId: 'usr_demo_001',
    organisationId: null,
    editorId: null,
    status: 'draft',
    rejectionReason: null,
    version: 3,
    submittedAt: null,
    publishedAt: null,
    approvedAt: null,
    createdAt: '2026-05-28T10:00:00.000Z',
    updatedAt: '2026-05-29T16:42:00.000Z',
  },
  {
    id: 'art_draft_002',
    title: 'Edtech adoption survey — Q2 trends',
    subtitle: 'What the latest CIO-panel data tells us',
    body: '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>',
    plainText: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    coverImageUrl: null,
    coverImageMediaId: null,
    media: [],
    category: 'tech_in_education',
    subcategory: null,
    tags: ['survey', 'edtech', 'cio'],
    location: 'Bengaluru',
    authorId: 'usr_demo_001',
    organisationId: null,
    editorId: null,
    status: 'draft',
    rejectionReason: null,
    version: 1,
    submittedAt: null,
    publishedAt: null,
    approvedAt: null,
    createdAt: '2026-05-30T08:15:00.000Z',
    updatedAt: '2026-05-30T08:30:00.000Z',
  },
  {
    id: 'art_submitted_001',
    title: 'Inside the 2026 research-funding shake-up',
    subtitle: 'Why the new NIRF metric matters',
    body: '<p>Full-length article body here.</p>',
    plainText:
      'Full-length article body here. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
    coverImageUrl: 'https://cdn.example.com/cover.jpg',
    coverImageMediaId: '6a1a610c26432f0687a8c9aa',
    media: ['6a1a610c26432f0687a8c9aa'],
    category: 'research_innovation',
    subcategory: null,
    tags: ['research', 'policy', 'nirf'],
    location: 'New Delhi',
    authorId: 'usr_demo_001',
    organisationId: null,
    editorId: null,
    status: 'submitted',
    rejectionReason: null,
    version: 5,
    submittedAt: '2026-05-29T18:00:00.000Z',
    publishedAt: null,
    approvedAt: null,
    createdAt: '2026-05-25T11:00:00.000Z',
    updatedAt: '2026-05-29T18:00:00.000Z',
  },
  // A second submitted article so the editor approval queue (Subphase 4) has
  // more than one row in dev. Author is a DIFFERENT user from the seeded
  // mockUser — the editor approval queue is unfiltered by author, but the
  // author-side "My submissions" list filters to `authorId='me'` and would
  // otherwise list this row twice on the same user's submissions view.
  {
    id: 'art_submitted_002',
    title: 'Why MOOCs are bouncing back in 2026',
    subtitle: 'Pandemic-era cohorts grew up — and stayed online',
    body: '<p>Full-length article body about MOOCs.</p>',
    plainText:
      'Full-length article body about MOOCs. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
    coverImageUrl: 'https://cdn.example.com/moocs-cover.jpg',
    coverImageMediaId: '6a1a610c26432f0687a8c9bb',
    media: ['6a1a610c26432f0687a8c9bb'],
    category: 'tech_in_education',
    subcategory: null,
    tags: ['moocs', 'online-learning'],
    location: 'Bengaluru',
    authorId: 'usr_author_02',
    author: { id: 'usr_author_02', name: 'Arjun Sharma' },
    organisationId: null,
    editorId: null,
    status: 'submitted',
    rejectionReason: null,
    version: 3,
    submittedAt: '2026-06-01T09:00:00.000Z',
    publishedAt: null,
    approvedAt: null,
    createdAt: '2026-05-30T15:30:00.000Z',
    updatedAt: '2026-06-01T09:00:00.000Z',
  },
  // A published article so the PlacementPanel + admin unpublish flow in
  // Subphase 4 can be exercised end-to-end in MSW without first having to
  // walk a draft through submit → approve → publish.
  {
    id: 'art_published_001',
    slug: 'how-indian-campuses-adopted-ai-tutoring',
    title: 'How Indian campuses adopted AI tutoring',
    subtitle: 'A year-long study across twelve institutions',
    body: '<p>The piece walks through enrollment data, dropout signals, and faculty perceptions.</p>',
    plainText:
      'The piece walks through enrollment data, dropout signals, and faculty perceptions across twelve institutions over the past academic year, drawing on interviews with administrators and surveys of student cohorts. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    coverImageUrl: 'https://cdn.example.com/ai-tutoring-cover.jpg',
    coverImageMediaId: '6a1a610c26432f0687a8c9cc',
    media: ['6a1a610c26432f0687a8c9cc'],
    category: 'research_innovation',
    subcategory: null,
    tags: ['ai', 'tutoring', 'india', 'research'],
    location: 'Pan-India',
    authorId: 'usr_demo_001',
    author: { id: 'usr_demo_001', name: 'Demo Reader' },
    organisationId: null,
    editorId: null,
    status: 'published',
    rejectionReason: null,
    placement: { featured: false, trending: false, trail: false, priority: 0 },
    ai: {
      summary:
        'Adoption is uneven across institutions; technology readiness predicts uptake better than budget.',
      keywords: ['ai-tutoring', 'higher-education', 'india'],
      readingTimeMin: 7,
      ttsAudioUrl: null,
      degraded: false,
      model: 'bart-large-cnn',
    },
    version: 9,
    submittedAt: '2026-05-20T08:00:00.000Z',
    publishedAt: '2026-05-22T14:00:00.000Z',
    approvedAt: '2026-05-22T10:00:00.000Z',
    createdAt: '2026-05-15T09:00:00.000Z',
    updatedAt: '2026-05-22T14:00:00.000Z',
  },
  // A draft that passes every submission check — used by Day-11 submit tests.
  // Body HTML and plainText are kept in sync: Tiptap's `onUpdate` fires on
  // mount with the parsed body's text, which would otherwise stomp on a
  // short HTML / long plainText mismatch.
  {
    id: 'art_ready_001',
    title: 'Edtech in 2026: a research roundup',
    subtitle: 'Findings from twelve campus pilots this term',
    body: '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>',
    plainText:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
    coverImageUrl: 'https://cdn.example.com/ready-cover.jpg',
    coverImageMediaId: '6a1a610c26432f0687a8c9ff',
    media: ['6a1a610c26432f0687a8c9ff'],
    category: 'tech_in_education',
    subcategory: null,
    tags: ['edtech', 'research', '2026'],
    location: 'Indore',
    authorId: 'usr_demo_001',
    organisationId: null,
    editorId: null,
    status: 'draft',
    rejectionReason: null,
    version: 2,
    submittedAt: null,
    publishedAt: null,
    approvedAt: null,
    createdAt: '2026-05-28T09:00:00.000Z',
    updatedAt: '2026-05-30T11:00:00.000Z',
  },
];

/**
 * Subphase 4 comments — match the real `Comment` wire shape
 * (`types/comment.ts`). Mix of approved + pending tied to actual articles
 * in `mockDrafts` so the editor thread (FE-4c) and moderation queue have
 * meaningful content in dev. The legacy `rating` field from earlier
 * subphases was dropped — backend has no such concept.
 */
export const mockComments: Comment[] = [
  // Approved comments on the published article — surface in <CommentThread>.
  {
    id: 'cmt_001',
    articleId: 'art_published_001',
    userId: 'usr_rahul',
    author: { id: 'usr_rahul', name: 'Rahul Verma' },
    parentId: null,
    body: 'Really helpful breakdown of the enrollment shifts — the dropout-signal data was new to me.',
    status: 'approved',
    createdAt: '2026-05-23T08:30:00.000Z',
    updatedAt: '2026-05-23T08:30:00.000Z',
  },
  {
    id: 'cmt_002',
    articleId: 'art_published_001',
    userId: 'usr_anjali',
    author: { id: 'usr_anjali', name: 'Anjali Singh' },
    parentId: null,
    body: 'Looking forward to the follow-up survey. Any chance you’ll share the per-institution numbers?',
    status: 'approved',
    createdAt: '2026-05-23T09:12:00.000Z',
    updatedAt: '2026-05-23T09:12:00.000Z',
  },
  // Pending comments — populate the moderation queue at /dashboard/editor/comments/pending.
  {
    id: 'cmt_003',
    articleId: 'art_published_001',
    userId: 'usr_tarun',
    author: { id: 'usr_tarun', name: 'Tarun Mehta' },
    parentId: null,
    body: 'Disagree with the methodology — your sample skews urban. Curious how this would shape up across tier-2 institutions.',
    status: 'pending',
    createdAt: '2026-06-02T14:00:00.000Z',
    updatedAt: '2026-06-02T14:00:00.000Z',
  },
  {
    id: 'cmt_004',
    articleId: 'art_published_001',
    userId: 'usr_nikhil',
    author: { id: 'usr_nikhil', name: 'Nikhil Patel' },
    parentId: null,
    body: 'Great piece. One nit: the chart on page 3 has a typo in the y-axis label.',
    status: 'pending',
    createdAt: '2026-06-02T15:30:00.000Z',
    updatedAt: '2026-06-02T15:30:00.000Z',
  },
  {
    id: 'cmt_005',
    articleId: 'art_submitted_001',
    userId: 'usr_priya',
    author: { id: 'usr_priya', name: 'Priya Iyer' },
    parentId: null,
    body: 'Even before this is live I think the framing needs a closer look — the NIRF change isn’t as clean as the lede suggests.',
    status: 'pending',
    createdAt: '2026-06-03T10:00:00.000Z',
    updatedAt: '2026-06-03T10:00:00.000Z',
  },
];

/**
 * Subphase 4 notifications — server-emitted by event listeners on the real
 * backend, so the FE never POSTs to create. Mix of unread + read for the
 * mockUser so the bell badge and list page have meaningful content in dev.
 */
export const mockNotifications: Notification[] = [
  {
    id: 'ntf_001',
    userId: 'usr_demo_001',
    type: 'article_approved',
    title: 'Your draft was approved',
    body: '“Edtech in 2026: a research roundup” is now ready to publish.',
    link: '/dashboard/author/submissions',
    metadata: { articleId: 'art_ready_001' },
    read: false,
    readAt: null,
    channel: 'in_app',
    createdAt: '2026-06-03T08:30:00.000Z',
    updatedAt: '2026-06-03T08:30:00.000Z',
  },
  {
    id: 'ntf_002',
    userId: 'usr_demo_001',
    type: 'new_comment',
    title: 'New comment on your article',
    body: 'Rahul Verma commented on “How Indian campuses adopted AI tutoring”.',
    link: '/article/how-indian-campuses-adopted-ai-tutoring',
    metadata: { articleId: 'art_published_001', commentId: 'cmt_001' },
    read: false,
    readAt: null,
    channel: 'in_app',
    createdAt: '2026-06-02T15:12:00.000Z',
    updatedAt: '2026-06-02T15:12:00.000Z',
  },
  {
    id: 'ntf_003',
    userId: 'usr_demo_001',
    type: 'article_published',
    title: 'Your article is live',
    body: '“How Indian campuses adopted AI tutoring” has been published.',
    link: '/article/how-indian-campuses-adopted-ai-tutoring',
    metadata: { articleId: 'art_published_001' },
    read: true,
    readAt: '2026-05-23T09:00:00.000Z',
    channel: 'in_app',
    createdAt: '2026-05-22T14:05:00.000Z',
    updatedAt: '2026-05-23T09:00:00.000Z',
  },
];

export const mockTags = [
  { id: 'tag_hi_ed', slug: 'higher-education', name: 'Higher Education' },
  { id: 'tag_research', slug: 'research', name: 'Research' },
  { id: 'tag_policy', slug: 'policy', name: 'Policy' },
];

/**
 * Subphase 4 e-paper issues — match the real `Epaper` wire shape
 * (`types/epaper.ts`). Renamed semantically from the Subphase 1 placeholder
 * (`pdfUrl` + `publishedAt`) to the real model fields (`pdfMediaId`,
 * `coverMediaId`, `issueDate`, `stats`).
 */
export const mockEpaperIssues: Epaper[] = [
  {
    id: 'epp_2026_05_30',
    title: 'Morning Edition — 30 May 2026',
    issueDate: '2026-05-30T00:00:00.000Z',
    pdfMediaId: '6a2100000000000000000001',
    coverMediaId: '6a2100000000000000000002',
    coverImageUrl: 'https://cdn.example.com/epapers/2026-05-30-cover.jpg',
    pageCount: 16,
    uploadedBy: 'usr_demo_001',
    stats: { downloads: 47, views: 312 },
    createdAt: '2026-05-30T06:00:00.000Z',
    updatedAt: '2026-05-30T06:00:00.000Z',
  },
  {
    id: 'epp_2026_05_23',
    title: 'Weekly Digest — 23 May 2026',
    issueDate: '2026-05-23T00:00:00.000Z',
    pdfMediaId: '6a2100000000000000000003',
    coverMediaId: '6a2100000000000000000004',
    coverImageUrl: 'https://cdn.example.com/epapers/2026-05-23-cover.jpg',
    pageCount: 24,
    uploadedBy: 'usr_demo_001',
    stats: { downloads: 128, views: 894 },
    createdAt: '2026-05-23T06:00:00.000Z',
    updatedAt: '2026-05-23T06:00:00.000Z',
  },
];
