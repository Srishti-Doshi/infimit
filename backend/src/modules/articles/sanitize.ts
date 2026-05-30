/**
 * Article body sanitization — XSS defence per docs/10-security.md §10.1.
 *
 * The article body arrives as rich HTML produced by Tiptap on the frontend.
 * Anything outside the allowlist below is stripped. This is the AUTHORITATIVE
 * sanitization pass — the FE will additionally DOMPurify on render (Subphase 5
 * readers) as defense in depth, but never as a substitute for this server-side
 * pass.
 *
 * Allowlist scope:
 *  - Structural: p, br, h1/h2/h3, ul/ol/li, blockquote, code, pre
 *  - Inline:     strong, em, u
 *  - Links:      a (href/rel/target; auto-rewritten to rel="nofollow noopener"
 *                target="_blank" — links never leak referrer or steal window)
 *  - Media:      img (src/alt/width/height; only http(s) schemes)
 *
 * Anything NOT in this list is removed (the text content of the tag is kept
 * by default). Style attributes, event handlers, javascript: URLs, data: URLs,
 * iframes, scripts, forms, inputs — all stripped.
 *
 * `plainText` is the body with EVERY tag removed, used for:
 *  - Character-count validation at the submit transition (>= 300 chars)
 *  - Future AI summarisation + full-text search
 */
import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  'h1',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'pre',
  'a',
  'img',
] as const;

const BODY_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...ALLOWED_TAGS],
  allowedAttributes: {
    a: ['href', 'rel', 'target'],
    img: ['src', 'alt', 'width', 'height'],
  },
  // Block javascript:, data:, vbscript:, file: — only http(s) survives.
  allowedSchemes: ['http', 'https'],
  allowedSchemesByTag: {
    img: ['http', 'https'],
  },
  // Every <a> gets rel="nofollow noopener" + target="_blank" regardless of
  // what the input said. nofollow ⇒ no SEO juice transfer to user-supplied
  // links; noopener ⇒ the new tab can't reach back via window.opener.
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'nofollow noopener', target: '_blank' }),
  },
  // Drop entire <script>/<style>/<iframe> tags including their text content.
  // The default behaviour keeps text of disallowed tags, which would otherwise
  // turn `<script>alert(1)</script>` into `alert(1)` and leak as content.
  disallowedTagsMode: 'discard',
  nonTextTags: ['style', 'script', 'iframe', 'noscript'],
};

const PLAIN_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
};

export function sanitizeArticleBody(html: string): string {
  return sanitizeHtml(html, BODY_OPTIONS);
}

export function plainTextFromHtml(html: string): string {
  // Normalize whitespace — sanitize-html leaves block-element boundaries
  // collapsed to nothing, which would smash `<p>a</p><p>b</p>` into `ab`.
  // Replace block-closing tags with a space pre-sanitize for cleaner counts.
  const withSpaces = html
    .replace(/<\/(p|div|h[1-6]|li|blockquote|pre)>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, ' ');
  return sanitizeHtml(withSpaces, PLAIN_TEXT_OPTIONS).replace(/\s+/g, ' ').trim();
}
