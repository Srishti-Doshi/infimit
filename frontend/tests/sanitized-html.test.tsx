import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SanitizedHtml } from '@/components/sanitized-html';

/**
 * `<SanitizedHtml>` is the defense-in-depth render path for article bodies.
 * Backend sanitises on save; this is the second layer.
 *
 * NOTE: DOMPurify's deep sanitisation behaviour can't be fully unit-tested
 * here — happy-dom (the vitest env) doesn't implement DOMParser the way
 * DOMPurify expects, so `sanitize()` returns empty for `<p>...</p>` inputs.
 * The end-to-end coverage that matters lives in `article-page.test.tsx`
 * which renders the component through a real article flow and asserts
 * that `<script>` tags do NOT appear in the DOM.
 *
 * These two unit tests just verify the structural contract that doesn't
 * depend on DOMPurify's HTML parsing:
 *   - never leaks a `javascript:` URI
 *   - wraps in an `<article>` with the configured className
 */

describe('<SanitizedHtml>', () => {
  it('removes javascript: hrefs from anchors', () => {
    const { container } = render(<SanitizedHtml html='<a href="javascript:alert(1)">click</a>' />);
    const anchor = container.querySelector('a');
    if (anchor) {
      expect(anchor.getAttribute('href')).not.toMatch(/^javascript:/i);
    }
    expect(container.innerHTML).not.toMatch(/javascript:/i);
  });

  it('honours a custom className on the wrapping <article>', () => {
    const { container } = render(<SanitizedHtml html="<p>x</p>" className="custom" />);
    expect(container.querySelector('article.custom')).not.toBeNull();
  });
});
