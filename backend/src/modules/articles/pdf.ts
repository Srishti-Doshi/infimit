/**
 * Article PDF rendering — Sub-PR 5-e, newspaper restyle in Subphase 5
 * (post-#121 follow-up).
 *
 * Contract: docs/05-api-documentation.md §5.5 (`GET /articles/:id/pdf`).
 * Spec ref: docs/Phase_1/Subphase_5_Reader_Launch/Backend_Handler_Documentation.md §4
 * Feature:  docs/13-feature-documentation.md A6.
 *
 * Rendering model: pdfkit (lightweight, pure-Node, fits the P1 ceiling).
 * The product intent for this artifact is a SHAREABLE NEWSPAPER CLIPPING —
 * readers download it to post on social media as if cut from the print
 * edition. The layout therefore mirrors the site's print conventions:
 *
 *   ┌─────────────────────────────────────┐  ← page frame (hairline)
 *   │            THE INFIMIT              │  ← masthead, serif, centred
 *   │  GLOBAL HIGHER EDUCATION NEWS …     │  ← tagline, brand red
 *   │  ═══════════════════════════════    │  ← double rule
 *   │  Friday, June 12, 2026 · CAMPUS …   │  ← dateline strip + hairlines
 *   │  Headline (Times-Bold, display)     │
 *   │  Subtitle (Times-Italic)            │
 *   │  By Author ──────────────────────   │  ← byline + rule
 *   │  Lede (AI summary, italic)          │
 *   │  Body text in two justified         │
 *   │  newspaper columns …                │
 *   │  theinfimit.com · Page 1            │  ← per-page footer
 *   └─────────────────────────────────────┘
 *
 * Fonts are pdfkit's built-in Times family — the closest standard-14 match
 * to the site's Fraunces display serif. No font embedding in P1 (keeps the
 * renderer dependency-free); Phase 2 can embed Fraunces/Inter if the brand
 * team wants exact parity.
 *
 * Caching model: each generated PDF lands in S3 at
 * `articles/<id>/v<version>-r<RENDERER_VERSION>.pdf`. The article `version`
 * busts the cache on content edits; RENDERER_VERSION busts it on layout
 * changes like this one — without it, every article rendered before the
 * restyle would keep serving the old plain design forever. Old keys are
 * left in S3 for a Phase 2 sweeper.
 *
 * The body is rendered from `plainText` (maintained alongside the sanitized
 * HTML body) — pdfkit has no DOM, and a clipping-style artifact reads fine
 * as flowing paragraphs.
 */
import { Readable } from 'node:stream';

import PDFDocument from 'pdfkit';

import type { ArticleModel } from './model';

/** Bump when the layout changes so cached renders regenerate. */
export const PDF_RENDERER_VERSION = 2;

const BRAND_RED = '#DC2626';
const INK = '#111111';
const INK_SECONDARY = '#444444';
const INK_TERTIARY = '#777777';
const RULE = '#999999';
const FRAME = '#b5ab98';
/** Newsprint cream — the single biggest "this is a newspaper" signal. */
const NEWSPRINT = '#f7f3ea';

const FRAME_INSET = 24; // page frame distance from the paper edge
const MARGIN = 54; // content margin (inside the frame)

/** Human category labels — mirrors the FE's ARTICLE_CATEGORY_LABELS. */
const CATEGORY_LABELS: Record<string, string> = {
  education_policy: 'Education Policy',
  campus_news: 'Campus News',
  research_innovation: 'Research & Innovation',
  student_achievements: 'Student Achievements',
  tech_in_education: 'Tech in Education',
};

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

/** Long-form dateline, e.g. "Friday, June 12, 2026". UTC to stay stable. */
function formatDateline(date: Date | null): string {
  if (!date) return '';
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return `${days[date.getUTCDay()]}, ${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

export interface RenderInput {
  article: ArticleModel;
  authorName: string | null;
  /** Raw cover image bytes (JPEG/PNG), fetched by the service. Anything
   * else — missing cover, fetch failure, unsupported format (WebP) — comes
   * through as null/undefined and the clipping renders without an image. */
  coverImage?: Buffer | null;
}

/** pdfkit embeds JPEG + PNG only. WebP covers (allowed by the upload
 * validator) are skipped rather than converted — pulling in sharp for one
 * render path isn't worth the native-dep weight in P1. */
function isEmbeddableImage(buf: Buffer): boolean {
  if (buf.length < 8) return false;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isPng =
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d;
  return isJpeg || isPng;
}

/**
 * Render an article into a PDF buffer. Collects every pdfkit chunk into
 * memory and resolves with the concatenated buffer — the cache write to S3
 * needs the full buffer anyway, so streaming straight to the response would
 * not save the allocation (see the service's render → cache → respond
 * pipeline).
 *
 * Multi-page handling: content renders with `bufferPages: true`; after the
 * body flows (pdfkit moves to new pages automatically), a final pass draws
 * the page frame and footer onto every page. Decorations can't be drawn
 * up-front because the page count isn't known until the body has flowed.
 */
export async function renderArticlePdf(input: RenderInput): Promise<Buffer> {
  const { article, authorName, coverImage } = input;

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: MARGIN + 14, left: MARGIN, right: MARGIN },
      bufferPages: true,
      info: {
        Title: article.title,
        Author: authorName ?? 'The Infimit',
        Subject: article.subtitle || article.title,
        Creator: 'The Infimit',
        Producer: 'The Infimit (pdfkit)',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const contentWidth = doc.page.width - MARGIN * 2;
    const rightEdge = doc.page.width - MARGIN;

    // Newsprint background — must be painted BEFORE any text on each page.
    // First page here; pdfkit's `pageAdded` covers every page the body
    // flow creates. CRITICAL: `.fill(NEWSPRINT)` mutates pdfkit's tracked
    // fill colour, and when this fires mid-text-flow (auto page-break in
    // the column run) the continuing text inherits it — cream-on-cream,
    // invisible. Restore the previous fill colour after painting.
    function paintNewsprint(): void {
      const prevFill = (doc as unknown as { _fillColor?: [unknown, number] })._fillColor;
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(NEWSPRINT);
      if (prevFill) {
        doc.fillColor(prevFill[0] as string, prevFill[1]);
      } else {
        doc.fillColor(INK);
      }
    }
    paintNewsprint();
    doc.on('pageAdded', paintNewsprint);

    // ── Masthead ─────────────────────────────────────────────────────────
    doc.font('Times-Bold').fontSize(38).fillColor(INK).text('THE INFIMIT', MARGIN, MARGIN, {
      width: contentWidth,
      align: 'center',
      characterSpacing: 2,
    });
    doc
      .moveDown(0.15)
      .font('Helvetica')
      .fontSize(8)
      .fillColor(BRAND_RED)
      .text('GLOBAL HIGHER EDUCATION NEWS AT YOUR FINGERTIPS', {
        width: contentWidth,
        align: 'center',
        characterSpacing: 1.5,
      });

    // Double rule under the masthead — the classic newspaper head.
    let y = doc.y + 10;
    doc.strokeColor(INK).lineWidth(1.4).moveTo(MARGIN, y).lineTo(rightEdge, y).stroke();
    y += 3;
    doc.strokeColor(INK).lineWidth(0.5).moveTo(MARGIN, y).lineTo(rightEdge, y).stroke();

    // ── Dateline strip ───────────────────────────────────────────────────
    const dateline = formatDateline(article.publishedAt);
    const categoryLabel = CATEGORY_LABELS[article.category] ?? article.category;
    y += 8;
    doc.font('Helvetica').fontSize(8.5).fillColor(INK_SECONDARY);
    if (dateline) {
      doc.text(dateline, MARGIN, y, { lineBreak: false });
    }
    doc.fillColor(BRAND_RED).font('Helvetica-Bold').text(categoryLabel.toUpperCase(), MARGIN, y, {
      width: contentWidth,
      align: 'right',
      characterSpacing: 1,
    });
    y = doc.y + 6;
    doc.strokeColor(RULE).lineWidth(0.5).moveTo(MARGIN, y).lineTo(rightEdge, y).stroke();

    // ── Headline block ───────────────────────────────────────────────────
    doc
      .font('Times-Bold')
      .fontSize(26)
      .fillColor(INK)
      .text(article.title, MARGIN, y + 16, { width: contentWidth, align: 'left' });

    if (article.subtitle) {
      doc
        .moveDown(0.3)
        .font('Times-Italic')
        .fontSize(13)
        .fillColor(INK_SECONDARY)
        .text(article.subtitle, { width: contentWidth, align: 'left' });
    }

    // Byline + hairline rule.
    const bylineParts: string[] = [];
    if (authorName) bylineParts.push(`By ${authorName}`);
    if (article.publishedAt) bylineParts.push(formatDateline(article.publishedAt));
    if (bylineParts.length > 0) {
      doc
        .moveDown(0.6)
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(INK_TERTIARY)
        .text(bylineParts.join('  ·  '), { width: contentWidth });
    }
    y = doc.y + 8;
    doc.strokeColor(RULE).lineWidth(0.5).moveTo(MARGIN, y).lineTo(rightEdge, y).stroke();
    doc.y = y + 14;
    doc.x = MARGIN;

    // ── Cover image — full measure, centred, aspect-preserving ──────────
    // `openImage` is pdfkit's internal probe but has been stable for years
    // and is the only way to learn the scaled height up-front (doc.image
    // doesn't advance doc.y). A broken/unsupported buffer skips silently —
    // the clipping is complete without its photo.
    if (coverImage && isEmbeddableImage(coverImage)) {
      try {
        const probe = (
          doc as unknown as { openImage: (b: Buffer) => { width: number; height: number } }
        ).openImage(coverImage);
        const maxH = 270;
        const scale = Math.min(contentWidth / probe.width, maxH / probe.height);
        const w = probe.width * scale;
        const h = probe.height * scale;
        doc.image(coverImage, MARGIN + (contentWidth - w) / 2, doc.y, { width: w, height: h });
        doc.y += h + 16;
      } catch {
        // Unsupported or corrupt image — render without it.
      }
    }

    // ── Lede — the AI summary set italic across the full measure ────────
    if (article.ai?.summary) {
      doc
        .font('Times-Italic')
        .fontSize(11.5)
        .fillColor(INK_SECONDARY)
        .text(article.ai.summary, { width: contentWidth, align: 'left', lineGap: 1 });
      doc.moveDown(0.8);
    }

    // ── Body — two justified newspaper columns ──────────────────────────
    const bodyStartY = doc.y;
    const paras = paragraphs(article.plainText ?? '');
    doc.font('Times-Roman').fontSize(10.5).fillColor(INK);
    if (paras.length === 0) {
      doc.fillColor(INK_TERTIARY).text('(No content)', { width: contentWidth });
    } else {
      // One text call so pdfkit flows the columns across pages on its own.
      doc.text(paras.join('\n\n'), {
        width: contentWidth,
        align: 'justify',
        columns: 2,
        columnGap: 18,
        lineGap: 1.5,
        paragraphGap: 6,
      });
    }
    // Where the body text actually ended — the column rule on the last page
    // stops here instead of running through empty paper.
    const bodyEndY = doc.y;

    // ── Decorations pass: frame + column rule + footer on every page ─────
    // pdfkit auto-appends a page whenever text lands inside the bottom
    // margin — which is exactly where a footer lives. Zeroing the bottom
    // margin during this pass disables that behaviour (the phantom-pages
    // bug from the first smoke render).
    const columnRuleX = MARGIN + contentWidth / 2;
    const contentBottom = doc.page.height - MARGIN;
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;

      // Page frame.
      doc
        .strokeColor(FRAME)
        .lineWidth(0.75)
        .rect(
          FRAME_INSET,
          FRAME_INSET,
          doc.page.width - FRAME_INSET * 2,
          doc.page.height - FRAME_INSET * 2,
        )
        .stroke();

      // Vertical hairline between the two columns — the classic newspaper
      // separator. Starts below the header block on page 1, at the top
      // margin on subsequent pages; stops where the text ends on the last.
      const isFirst = i === range.start;
      const isLast = i === range.start + range.count - 1;
      const ruleTop = isFirst ? bodyStartY : MARGIN;
      const ruleBottom = isLast ? Math.min(bodyEndY, contentBottom) : contentBottom;
      if (ruleBottom - ruleTop > 20) {
        doc
          .strokeColor(RULE)
          .lineWidth(0.4)
          .moveTo(columnRuleX, ruleTop)
          .lineTo(columnRuleX, ruleBottom)
          .stroke();
      }

      // Footer: hairline + attribution left, page number right. Both writes
      // are absolute-positioned and non-breaking.
      const footerY = doc.page.height - MARGIN + 6;
      doc
        .strokeColor(RULE)
        .lineWidth(0.5)
        .moveTo(MARGIN, footerY - 6)
        .lineTo(rightEdge, footerY - 6)
        .stroke();
      doc.font('Helvetica').fontSize(7.5).fillColor(INK_TERTIARY);
      doc.text('theinfimit.com · higher education journalism', MARGIN, footerY, {
        lineBreak: false,
      });
      const pageLabel = `Page ${i - range.start + 1} of ${range.count}`;
      doc.text(pageLabel, rightEdge - doc.widthOfString(pageLabel), footerY, {
        lineBreak: false,
      });
    }

    doc.end();
  });
}

/** Cache key for an article's rendered PDF. The article `version` busts on
 * content edits; `PDF_RENDERER_VERSION` busts on layout changes (without it
 * the newspaper restyle would never reach articles cached under the old
 * design). Old keys stay in S3 for a Phase 2 sweeper. */
export function pdfCacheKey(articleId: string, version: number): string {
  return `articles/${articleId}/v${version}-r${PDF_RENDERER_VERSION}.pdf`;
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
