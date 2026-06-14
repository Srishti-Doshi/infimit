import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AiSummary } from '@/components/ai-summary';

/**
 * `<AiSummary>` renders the AI summary string. The summarizer returns
 * bullet-pointed lines (• per line); these must become a real list rather
 * than a run-on paragraph, while prose summaries fall back to a paragraph.
 */
describe('<AiSummary>', () => {
  it('renders a bullet-formatted summary as a <ul> with markers stripped', () => {
    const text = '• First point about the reform.\n• Second point with detail.\n• Third point.';
    const { container } = render(<AiSummary text={text} />);

    const items = container.querySelectorAll('ul > li');
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent).toBe('First point about the reform.');
    // The bullet glyphs are stripped from the rendered text.
    expect(container.querySelector('ul')?.textContent).not.toContain('•');
  });

  it('also recognises dash-prefixed bullet lines', () => {
    const { container } = render(<AiSummary text={'- one\n- two'} />);
    expect(container.querySelectorAll('ul > li')).toHaveLength(2);
  });

  it('renders a prose summary as a <p> with preserved whitespace (no list)', () => {
    const text = 'Adoption is uneven across institutions, with elite colleges moving fastest.';
    const { container } = render(<AiSummary text={text} />);

    expect(container.querySelector('ul')).toBeNull();
    const p = container.querySelector('p');
    expect(p?.className).toContain('whitespace-pre-wrap');
    expect(screen.getByText(/adoption is uneven across institutions/i)).toBeInTheDocument();
  });

  it('merges a consumer className onto the rendered element', () => {
    const { container } = render(<AiSummary text={'• a\n• b'} className="mt-2" />);
    expect(container.querySelector('ul')?.className).toContain('mt-2');
  });
});
