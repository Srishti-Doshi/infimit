import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button, EmptyState, Skeleton } from '@/components/ui';

describe('<Skeleton>', () => {
  it('renders aria-hidden so it stays out of the accessibility tree', () => {
    const { container } = render(<Skeleton className="h-4 w-32" />);
    const bar = container.firstElementChild;
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('<EmptyState>', () => {
  it('renders title, description, and an action', () => {
    render(
      <EmptyState
        title="No editors yet"
        description="Invite an editor to start triaging submissions."
        action={<Button>Create editor</Button>}
      />,
    );
    expect(screen.getByText(/no editors yet/i)).toBeInTheDocument();
    expect(screen.getByText(/invite an editor/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create editor/i })).toBeInTheDocument();
  });

  it('renders without optional fields', () => {
    render(<EmptyState title="Empty" />);
    expect(screen.getByText('Empty')).toBeInTheDocument();
  });
});
