/**
 * Database seed — Subphase 2 (plus the author addition from PR closing #33).
 *
 * Idempotent: re-running this script never duplicates records. Each insert
 * checks for an existing row by its unique key first (email for users, slug
 * for organisations) and skips if one is already present.
 *
 * Seeds:
 *   1× admin user        admin@infimit.dev / Admin12345!  (DEV-ONLY default —
 *                                                          ROTATE before any
 *                                                          shared environment)
 *   1× organisation      "Infimit Demo College" (slug: infimit-demo-college)
 *   2× editor users      bound to a subset of the 5 article categories
 *   1× author user       author@infimit.dev — bootstraps the editorial flow
 *                        for QA / dev work without needing the admin promote
 *                        UI (closes #33's "no path to a real author account").
 *   5× article categories logged for visibility (enum lives in
 *                        src/shared/constants/articleCategories.ts — no
 *                        categories collection until articles ship in
 *                        Subphase 3)
 *
 * Run with:  npx tsx scripts/seed.ts
 */
import { Types } from 'mongoose';

import { loadEnv } from '../src/config/env';
import { connectMongo, disconnectMongo } from '../src/config/db';
import { logger } from '../src/config/logger';
import { hashPassword } from '../src/shared/crypto';
import { ARTICLE_CATEGORIES } from '../src/shared/constants/articleCategories';
import * as usersRepo from '../src/modules/users/repository';
import * as orgsRepo from '../src/modules/organisations/repository';
import { Article } from '../src/modules/articles/model';
import { Media } from '../src/modules/media/model';
import type { ArticleCategory } from '../src/shared/constants/articleCategories';

const ADMIN_EMAIL = 'admin@infimit.dev';
const ADMIN_PASSWORD = 'Admin12345!';

const AUTHOR_EMAIL = 'author@infimit.dev';
const AUTHOR_NAME = 'Demo Author';
const AUTHOR_SLUG = 'demo-author';

const ORG_SLUG = 'infimit-demo-college';

interface SeedEditor {
  email: string;
  name: string;
  sectionsOwned: string[];
}

const EDITORS: SeedEditor[] = [
  {
    email: 'edu-editor@infimit.dev',
    name: 'Editor (Education Policy)',
    sectionsOwned: ['education_policy', 'campus_news'],
  },
  {
    email: 'tech-editor@infimit.dev',
    name: 'Editor (Tech in Education)',
    sectionsOwned: ['tech_in_education', 'research_innovation'],
  },
];

async function seedAdmin(): Promise<{ created: boolean; id: string }> {
  const existing = await usersRepo.findActiveByEmail(ADMIN_EMAIL);
  if (existing) {
    return { created: false, id: existing._id.toString() };
  }
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const admin = await usersRepo.createUser({
    email: ADMIN_EMAIL,
    passwordHash,
    name: 'Infimit Admin',
    role: 'admin',
    slug: null,
  });
  // Admins are pre-verified — they don't go through the email-verify flow.
  await usersRepo.updateById(admin._id, { isEmailVerified: true });
  return { created: true, id: admin._id.toString() };
}

async function seedOrganisation(): Promise<{ created: boolean; id: string }> {
  const existing = await orgsRepo.findBySlug(ORG_SLUG);
  if (existing) {
    return { created: false, id: existing._id.toString() };
  }
  const org = await orgsRepo.createOrganisation({
    name: 'Infimit Demo College',
    slug: ORG_SLUG,
    category: 'college',
    description: 'Demo organisation seeded for local development and integration tests.',
    website: 'https://infimit.dev',
    contactEmail: 'contact@infimit.dev',
    verified: true,
  });
  return { created: true, id: org._id.toString() };
}

async function seedEditor(editor: SeedEditor): Promise<{ created: boolean; id: string }> {
  const existing = await usersRepo.findActiveByEmail(editor.email);
  if (existing) {
    return { created: false, id: existing._id.toString() };
  }
  // Same starter password as the admin — operators rotate on first login.
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const user = await usersRepo.createUser({
    email: editor.email,
    passwordHash,
    name: editor.name,
    role: 'editor',
    slug: null,
    sectionsOwned: editor.sectionsOwned,
  });
  await usersRepo.updateById(user._id, { isEmailVerified: true });
  return { created: true, id: user._id.toString() };
}

async function seedAuthor(organisationId: string): Promise<{ created: boolean; id: string }> {
  const existing = await usersRepo.findActiveByEmail(AUTHOR_EMAIL);
  if (existing) {
    return { created: false, id: existing._id.toString() };
  }
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const user = await usersRepo.createUser({
    email: AUTHOR_EMAIL,
    passwordHash,
    name: AUTHOR_NAME,
    role: 'author',
    slug: AUTHOR_SLUG,
    organisationId: new Types.ObjectId(organisationId),
  });
  await usersRepo.updateById(user._id, { isEmailVerified: true });
  return { created: true, id: user._id.toString() };
}

interface DemoArticleSeed {
  slug: string;
  title: string;
  subtitle: string;
  category: ArticleCategory;
  location: string;
  tags: string[];
  body: string;
  summary: string;
}

/**
 * Three demo published articles — one per category that the seeded editors
 * own (so the editor portal has real content to manipulate on first boot)
 * plus a third to populate the home feed with more than just a single card.
 *
 * Bodies are 350-600 chars (above the 300-char submit minimum, well below
 * the 500 KB validator cap). plainText is derived by stripping the wrapping
 * `<p>` tags — same shape the article create flow produces in real life.
 *
 * The PDF generator (5-e) renders these too; QA scenarios for the
 * `/v1/articles/:id/pdf` smoke walk against seeded data.
 */
const DEMO_ARTICLES: DemoArticleSeed[] = [
  {
    slug: 'ncea-curriculum-overhaul-2026',
    title: 'NCEA curriculum overhaul lands in 2026',
    subtitle: 'How the national framework is being rewritten for the AI age',
    category: 'education_policy',
    location: 'Wellington',
    tags: ['policy', 'curriculum', 'ai'],
    body:
      'The Ministry of Education has unveiled a sweeping rewrite of the national curriculum, ' +
      'centred on integrating computational thinking into every subject from year one. School ' +
      'principals welcomed the long-promised funding boost but flagged a tight implementation ' +
      'window. Teacher unions are pressing for a phased rollout that pairs new modules with the ' +
      'professional development needed to teach them well. Independent researchers note the ' +
      'reform borrows heavily from the 2024 Finnish trial, which produced double-digit gains ' +
      'in problem-solving scores within two years of adoption.',
    summary:
      'New national curriculum centres computational thinking and pairs subject content with ' +
      'mandatory teacher development. Unions push for a phased rollout.',
  },
  {
    slug: 'state-university-on-campus-startups',
    title: 'State University opens campus to student-led startups',
    subtitle: 'Three teams have already shipped products this semester',
    category: 'campus_news',
    location: 'Bengaluru',
    tags: ['campus', 'startups', 'entrepreneurship'],
    body:
      'A new venture lab tucked between the maths block and the cafeteria is quietly producing ' +
      'shipping product — three student teams have launched paying customers this term alone. ' +
      'The lab offers seed grants, legal templates, and weekly mentor hours from industry alums. ' +
      'Critics worry the model selects for visible commercial output over the slower research ' +
      'work that drove the university to prominence; supporters point to the cross-discipline ' +
      'collaboration the program has unlocked, with engineering students pairing with arts ' +
      'majors on accessible-design products.',
    summary:
      'A campus venture lab pairs seed grants and mentor access with cross-discipline ' +
      'collaboration; three student teams have already launched paying products.',
  },
  {
    slug: 'transformer-tutors-classroom-trial',
    title: 'Transformer-based tutors complete first classroom trial',
    subtitle: 'Early results suggest AI explainers narrow the homework gap',
    category: 'tech_in_education',
    location: 'Hyderabad',
    tags: ['ai', 'tutoring', 'research'],
    body:
      'A six-school pilot of large-language-model tutors wraps this week with cautiously ' +
      'positive results. Year-eight students using the LLM tutor for nightly homework ' +
      'scored an average of nine points higher on the end-of-term assessment than the control ' +
      'cohort, with the largest gains concentrated in households without home internet — the ' +
      'tutor runs offline on a school-issued tablet. Researchers were careful to note that ' +
      'the trial does not eliminate the achievement gap, but it materially narrows it for the ' +
      'most digitally underserved students. Phase two will expand to thirty schools across ' +
      'three states.',
    summary:
      'A six-school LLM-tutor pilot narrowed the homework-attainment gap, with the largest ' +
      'gains concentrated in households without home internet.',
  },
];

async function seedDemoCover(uploadedBy: string): Promise<string> {
  // A single shared "demo cover" media doc — every demo article points at it.
  // refCount is set to 3 to match the three articles that reference it; the
  // GC sweeper won't touch a non-zero refCount even after the TTL.
  const existing = await Media.findOne({ key: 'seed/demo-cover.jpg' }).exec();
  if (existing) {
    return existing._id.toString();
  }
  const doc = await Media.create({
    key: 'seed/demo-cover.jpg',
    url: 'https://mock-cdn.test/seed/demo-cover.jpg',
    mimeType: 'image/jpeg',
    size: 100_000,
    purpose: 'article_cover',
    uploadedBy: new Types.ObjectId(uploadedBy),
    refCount: DEMO_ARTICLES.length,
  });
  return doc._id.toString();
}

async function seedDemoArticle(
  seed: DemoArticleSeed,
  authorId: string,
  organisationId: string,
  coverMediaId: string,
  now: Date,
): Promise<{ created: boolean; id: string }> {
  const existing = await Article.findOne({ slug: seed.slug }).exec();
  if (existing) {
    return { created: false, id: existing._id.toString() };
  }
  const doc = await Article.create({
    title: seed.title,
    slug: seed.slug,
    subtitle: seed.subtitle,
    body: `<p>${seed.body}</p>`,
    plainText: seed.body,
    category: seed.category,
    tags: seed.tags,
    location: seed.location,
    authorId: new Types.ObjectId(authorId),
    organisationId: new Types.ObjectId(organisationId),
    coverImageMediaId: new Types.ObjectId(coverMediaId),
    coverImageUrl: 'https://mock-cdn.test/seed/demo-cover.jpg',
    media: [new Types.ObjectId(coverMediaId)],
    status: 'published',
    publishedAt: now,
    submittedAt: now,
    approvedAt: now,
    ai: {
      summary: seed.summary,
      keywords: seed.tags,
      readingTimeMin: Math.max(1, Math.round(seed.body.split(/\s+/).length / 200)),
      ttsAudioUrl: null,
      embedding: null,
      // Seed summaries are hand-written, not produced by the AI proxy — but
      // they're available and meaningful, so degraded is false (the reader-
      // facing UI renders the summary normally).
      degraded: false,
      model: 'seed-handwritten',
    },
    version: 0,
  });
  return { created: true, id: doc._id.toString() };
}

async function main(): Promise<void> {
  loadEnv();
  await connectMongo();
  logger.info('seed_started');

  const admin = await seedAdmin();
  logger.info({ id: admin.id, created: admin.created }, 'seed_admin');

  const org = await seedOrganisation();
  logger.info({ id: org.id, slug: ORG_SLUG, created: org.created }, 'seed_organisation');

  for (const editor of EDITORS) {
    const result = await seedEditor(editor);
    logger.info({ id: result.id, email: editor.email, created: result.created }, 'seed_editor');
  }

  const author = await seedAuthor(org.id);
  logger.info({ id: author.id, email: AUTHOR_EMAIL, created: author.created }, 'seed_author');

  logger.info({ categories: ARTICLE_CATEGORIES }, 'seed_article_categories_enum');

  // ─── Demo published articles (Subphase 5 / 5-e) ─────────────────────────
  // Three published pieces by the seed author — populates the home feed,
  // gives the editor portal real content to triage, and provides article
  // ids for the PDF + analytics + bookmarks smoke walks.
  const cover = await seedDemoCover(admin.id);
  const now = new Date();
  for (const seed of DEMO_ARTICLES) {
    // eslint-disable-next-line no-await-in-loop
    const result = await seedDemoArticle(seed, author.id, org.id, cover, now);
    logger.info({ id: result.id, slug: seed.slug, created: result.created }, 'seed_demo_article');
  }

  logger.info(
    { adminEmail: ADMIN_EMAIL, adminPassword: '<set in seed.ts — ROTATE before sharing>' },
    'seed_completed',
  );

  await disconnectMongo();
}

main().catch((err) => {
  logger.error({ err }, 'seed_failed');
  process.exit(1);
});
