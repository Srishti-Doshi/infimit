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
