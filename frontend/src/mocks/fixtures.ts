/**
 * MSW fixture data — minimal shapes that mirror the backend DTOs.
 *
 * These are NOT contracts — the real DTO definitions live in
 * `docs/04-database-design.md` and will be ported to typed contracts in
 * Subphase 2+. Keep fixtures intentionally thin so they're easy to swap.
 */

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

export const mockArticles = [
  {
    id: 'art_demo_001',
    slug: 'global-higher-education-trends-2026',
    title: 'Global Higher Education Trends in 2026',
    excerpt: 'A look at the institutional shifts shaping universities worldwide this year.',
    category: 'world',
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
    category: 'india',
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
    category: 'opinion',
    author: { id: 'usr_author_03', name: 'Priya Nair' },
    coverImageUrl: null,
    publishedAt: '2026-05-05T11:15:00.000Z',
    readingTimeMinutes: 5,
  },
];

export const mockComments = [
  {
    id: 'cmt_001',
    articleId: 'art_demo_001',
    author: { id: 'usr_rahul', name: 'Rahul' },
    body: 'This is very informative news. Thanks for sharing!',
    rating: 4,
    status: 'approved',
    createdAt: '2026-05-11T07:30:00.000Z',
  },
  {
    id: 'cmt_002',
    articleId: 'art_demo_001',
    author: { id: 'usr_anjali', name: 'Anjali' },
    body: 'Great update. Looking forward to more such news.',
    rating: 5,
    status: 'approved',
    createdAt: '2026-05-11T09:12:00.000Z',
  },
];

export const mockTags = [
  { id: 'tag_hi_ed', slug: 'higher-education', name: 'Higher Education' },
  { id: 'tag_research', slug: 'research', name: 'Research' },
  { id: 'tag_policy', slug: 'policy', name: 'Policy' },
];

export const mockEpaperIssues = [
  {
    id: 'epp_2026_05_18',
    publishedAt: '2026-05-18T05:00:00.000Z',
    title: 'Saturday Edition · 18 May 2026',
    pdfUrl: null,
  },
];
