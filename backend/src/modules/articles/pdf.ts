/**
 * Article PDF rendering — Sub-PR 5-e.
 *
 * Contract: docs/05-api-documentation.md §5.5 (`GET /articles/:id/pdf`).
 * Spec ref: docs/Phase_1/Subphase_5_Reader_Launch/Backend_Handler_Documentation.md §4
 * Feature:  docs/13-feature-documentation.md A6.
 *
 * Rendering model: pdfkit (lightweight, pure-Node, fits the P1 ceiling). The
 * BE handler doc explicitly chooses pdfkit over puppeteer-core+chromium for
 * P1 because the chromium image dwarfs the rest of the deploy budget;
 * trade-off is "less typographic polish". Phase 2 can swap to a queued
 * puppeteer worker once we have the budget.
 *
 * Caching model: each generated PDF lands in S3 at
 * `articles/<id>/v<version>.pdf`. The article's `version` field
 * (optimistic-concurrency token, bumped on every state-changing write)
 * doubles as the cache-buster — any edit to the article produces a fresh
 * key. The service-level cache check is HEAD-then-redirect; only a true
 * cache miss runs the renderer.
 *
 * The body of the article is sanitized HTML; the renderer strips tags down
 * to plain text via `plainText` (already maintained alongside `body`),
 * which avoids the complexity of "render HTML to PDF" inside pdfkit
 * (which has no DOM). Acceptable for a newspaper-style print layout where
 * structure is mostly title → byline → summary → body paragraphs.
 */
import { Readable } from 'node:stream';

import PDFDocument from 'pdfkit';

import type { ArticleModel } from './model';

/**
 * Strip the article's plainText into newspaper-style paragraphs. The
 * `plainTextFromHtml` helper already collapses whitespace; we split on
 * double-newlines first (paragraph boundaries from the source HTML) and
 * fall back to single-newlines for content that lost its <p> structure.
 */
function paragraphs(plainText: string): string[] {
  const trimmed = plainText.trim();
  if (!trimmed) return [];
  const byDouble = trimmed
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (byDouble.length > 1) return byDouble;
  return trimmed
    .split(/\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function formatDate(date: Date | null): string {
  if (!date) return '';
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export interface RenderInput {
  article: ArticleModel;
  authorName: string | null;
}

/**
 * Render an article into a PDF buffer. Synchronous in feel — collects every
 * pdfkit chunk into memory and resolves with the concatenated buffer. P1
 * articles cap at ~500 KB of HTML which translates to <2 MB of PDF; well
 * inside what we can hold in process memory per request.
 *
 * Streaming the PDF directly to the response would save the memory hit but
 * would also block writing to S3 in the same pass — the cache write needs
 * the full buffer. The two-stage shape (render → cache → respond) is
 * deliberate.
 */
export async function renderArticlePdf(input: RenderInput): Promise<Buffer> {
  const { article, authorName } = input;

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: article.title,
        Author: authorName ?? 'Infimit',
        Subject: article.subtitle || article.title,
        Creator: 'Infimit',
        Producer: 'Infimit (pdfkit)',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Title — large, bold-feel via the heaviest standard font available.
    doc
      .font('Helvetica-Bold')
      .fontSize(24)
      .fillColor('#111111')
      .text(article.title, { align: 'left' });

    // Subtitle, if present.
    if (article.subtitle) {
      doc
        .moveDown(0.3)
        .font('Helvetica')
        .fontSize(14)
        .fillColor('#444444')
        .text(article.subtitle, { align: 'left' });
    }

    // Byline + date.
    const bylineParts: string[] = [];
    if (authorName) bylineParts.push(`By ${authorName}`);
    if (article.publishedAt) bylineParts.push(formatDate(article.publishedAt));
    if (bylineParts.length > 0) {
      doc
        .moveDown(0.5)
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#888888')
        .text(bylineParts.join(' · '), { align: 'left' });
    }

    // AI summary block (skipped if empty / degraded — the FE renders a
    // "summary unavailable" badge instead, but in print we just omit).
    if (article.ai?.summary) {
      doc
        .moveDown(1)
        .font('Helvetica-Oblique')
        .fontSize(11)
        .fillColor('#555555')
        .text(article.ai.summary, { align: 'left' });
    }

    // Divider.
    doc
      .moveDown(0.8)
      .strokeColor('#cccccc')
      .lineWidth(0.5)
      .moveTo(doc.x, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke();

    // Body paragraphs.
    doc.moveDown(0.6).font('Helvetica').fontSize(11).fillColor('#222222');
    const paras = paragraphs(article.plainText ?? '');
    if (paras.length === 0) {
      doc.fillColor('#888888').text('(No content)', { align: 'left' });
    } else {
      for (const para of paras) {
        doc.text(para, { align: 'left' });
        doc.moveDown(0.6);
      }
    }

    // Footer attribution.
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#aaaaaa')
      .text('infimit.dev · educational journalism', doc.page.margins.left, doc.page.height - 30, {
        align: 'left',
      });

    doc.end();
  });
}

/** Cache key for an article's rendered PDF. Versioned so any edit invalidates
 * the cache automatically — the next request re-renders and writes the new
 * key. The old key is left in S3 for cleanup by a Phase 2 sweeper. */
export function pdfCacheKey(articleId: string, version: number): string {
  return `articles/${articleId}/v${version}.pdf`;
}

/** Filename emitted via `Content-Disposition`. Restricted to ASCII to avoid
 * cross-browser header encoding quirks. */
export function pdfDownloadFilename(slug: string): string {
  const safe = slug.replace(/[^a-z0-9-]/gi, '-').slice(0, 80) || 'article';
  return `${safe}.pdf`;
}

/** Tiny convenience: a Readable stream wrapping a buffer. Used by tests +
 * the controller's first-render-streaming path. */
export function bufferToReadable(buf: Buffer): Readable {
  return Readable.from(buf);
}
