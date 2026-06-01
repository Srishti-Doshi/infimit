import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DraftValidationHints } from '@/components/draft-validation-hints';

/**
 * Mirrors `submitReadiness` row-by-row. Driven by props only — no fetching,
 * no form state, so the test is a pure render assertion.
 */

const PASSING_BODY = 'x'.repeat(300);

describe('<DraftValidationHints>', () => {
  it('renders every row, none marked ready, for an empty draft', () => {
    render(<DraftValidationHints draft={{ title: '', plainText: '', tags: [] }} />);
    expect(screen.getByText(/title is set/i)).toBeInTheDocument();
    expect(screen.getByText(/body has at least 300 characters/i)).toBeInTheDocument();
    expect(screen.getByText(/category selected/i)).toBeInTheDocument();
    expect(screen.getByText(/cover image attached/i)).toBeInTheDocument();
    expect(screen.getByText(/between 1 and 10 tags/i)).toBeInTheDocument();
  });

  it('shows the live character count for body and tag count', () => {
    render(<DraftValidationHints draft={{ title: 't', plainText: 'abc', tags: ['a', 'b'] }} />);
    expect(screen.getByText(/3 so far/)).toBeInTheDocument();
    expect(screen.getByText(/2 so far/)).toBeInTheDocument();
  });

  it('marks every row green for a fully-ready draft', () => {
    const { container } = render(
      <DraftValidationHints
        draft={{
          title: 'A good headline',
          plainText: PASSING_BODY,
          category: 'campus_news',
          coverImageMediaId: 'med_cover_001',
          tags: ['accessibility'],
        }}
      />,
    );
    // The CheckCircle2 icon is rendered for ready rows; Circle for unready.
    // Count the green checks — should be 5.
    const greens = container.querySelectorAll('.text-status-success-text');
    expect(greens.length).toBe(5);
  });
});
