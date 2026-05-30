/**
 * Article body sanitizer — XSS allowlist locks.
 *
 * These tests are the contract for what an attacker-controlled article body
 * is allowed to render. Loosen them deliberately, never accidentally.
 */
import { plainTextFromHtml, sanitizeArticleBody } from '../../../src/modules/articles/sanitize';

describe('sanitizeArticleBody', () => {
  it('keeps allowlisted structural + inline tags as-is', () => {
    const input =
      '<h1>Title</h1><p>An <strong>important</strong> <em>word</em>.</p><ul><li>one</li></ul>';
    const out = sanitizeArticleBody(input);
    expect(out).toContain('<h1>Title</h1>');
    expect(out).toContain('<strong>important</strong>');
    expect(out).toContain('<em>word</em>');
    expect(out).toContain('<ul><li>one</li></ul>');
  });

  it('discards <script> entirely including its text content', () => {
    const input = '<p>Hi</p><script>alert(1)</script>';
    const out = sanitizeArticleBody(input);
    expect(out).not.toContain('script');
    expect(out).not.toContain('alert(1)');
    expect(out).toContain('<p>Hi</p>');
  });

  it('drops on* event handlers', () => {
    const input = '<p onclick="alert(1)">click</p>';
    const out = sanitizeArticleBody(input);
    expect(out).not.toContain('onclick');
    expect(out).toContain('<p>click</p>');
  });

  it('drops javascript: and data: schemes in href', () => {
    const inputs = [
      '<a href="javascript:alert(1)">x</a>',
      '<a href="data:text/html,<script>1</script>">x</a>',
      '<a href="vbscript:msgbox(1)">x</a>',
    ];
    for (const i of inputs) {
      const out = sanitizeArticleBody(i);
      expect(out).not.toMatch(/href=/);
      expect(out).not.toMatch(/javascript:/i);
      expect(out).not.toMatch(/data:/i);
      expect(out).not.toMatch(/vbscript:/i);
    }
  });

  it('drops data: scheme on img src; keeps http(s)', () => {
    const bad = sanitizeArticleBody('<img src="data:image/png;base64,abc">');
    expect(bad).not.toContain('data:');

    const ok = sanitizeArticleBody('<img src="https://cdn.example/x.jpg" alt="x">');
    expect(ok).toContain('src="https://cdn.example/x.jpg"');
    expect(ok).toContain('alt="x"');
  });

  it('rewrites every <a> with rel="nofollow noopener" and target="_blank"', () => {
    const input = '<a href="https://example.com">link</a>';
    const out = sanitizeArticleBody(input);
    expect(out).toContain('rel="nofollow noopener"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('href="https://example.com"');
  });

  it('strips iframes including their content', () => {
    const input = '<p>Before</p><iframe src="https://evil"></iframe><p>After</p>';
    const out = sanitizeArticleBody(input);
    expect(out).not.toContain('iframe');
    expect(out).not.toContain('evil');
    expect(out).toContain('<p>Before</p>');
    expect(out).toContain('<p>After</p>');
  });

  it('strips style attributes', () => {
    const input = '<p style="color:red">x</p>';
    const out = sanitizeArticleBody(input);
    expect(out).not.toContain('style');
  });
});

describe('plainTextFromHtml', () => {
  it('returns just the text content with no tags', () => {
    const html = '<h1>Title</h1><p>Body <strong>here</strong>.</p>';
    // Block boundaries become single spaces; inline tags collapse tight to
    // surrounding punctuation (so the trailing period stays attached).
    expect(plainTextFromHtml(html)).toBe('Title Body here.');
  });

  it('joins block elements with a space (no run-together words)', () => {
    const html = '<p>One</p><p>Two</p><p>Three</p>';
    const text = plainTextFromHtml(html);
    expect(text).toBe('One Two Three');
    // Critical: must not collapse to "OneTwoThree" — that would break the
    // 300-char minimum check at submit-time on long article bodies.
    expect(text).not.toMatch(/OneTwo|TwoThree/);
  });

  it('collapses repeated whitespace and trims', () => {
    const html = '<p>  hello   world  </p>';
    expect(plainTextFromHtml(html)).toBe('hello world');
  });

  it('treats <br> as a word boundary', () => {
    expect(plainTextFromHtml('a<br>b<br/>c')).toBe('a b c');
  });

  it('strips script content from plain text too', () => {
    const html = '<p>safe</p><script>alert("evil")</script>';
    const text = plainTextFromHtml(html);
    expect(text).toContain('safe');
    expect(text).not.toContain('alert');
    expect(text).not.toContain('evil');
  });
});
