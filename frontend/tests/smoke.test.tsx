import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppLayout } from '@/components/layout';
import NotFoundPage from '@/pages/not-found';
import { renderWithProviders } from '@/test/render';
import { Button } from '@/components/ui';
import { apiClient } from '@/lib/api-client';
import { isApiSuccess, type ApiResponse } from '@/types/api';

describe('Subphase 1 smoke', () => {
  // ── Primitive ──────────────────────────────────────────────────────────
  describe('<Button>', () => {
    it('renders with text and fires onClick', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      renderWithProviders(<Button onClick={handleClick}>Send Request</Button>);

      const button = screen.getByRole('button', { name: /send request/i });
      expect(button).toBeInTheDocument();
      await user.click(button);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('disables interaction while loading', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      renderWithProviders(
        <Button loading onClick={handleClick}>
          Submitting
        </Button>,
      );

      const button = screen.getByRole('button', { name: /submitting/i });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');

      await user.click(button);
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  // ── Layout shell ───────────────────────────────────────────────────────
  describe('<AppLayout>', () => {
    it('renders header (wordmark + auth links) and footer', () => {
      renderWithProviders(
        <AppLayout>
          <p>Test route content</p>
        </AppLayout>,
      );

      // Wordmark appears twice — in the header and in the footer. Both should
      // link home.
      const homeLinks = screen.getAllByRole('link', { name: /the infimit — home/i });
      expect(homeLinks.length).toBe(2);
      homeLinks.forEach((link) => expect(link).toHaveAttribute('href', '/'));

      // Auth chrome (visible at md+ — happy-dom defaults to a width that exposes it)
      expect(screen.getAllByRole('link', { name: /login/i })[0]).toBeInTheDocument();
      expect(screen.getAllByRole('link', { name: /sign up/i })[0]).toBeInTheDocument();

      // Children land in <main>
      expect(screen.getByText(/test route content/i)).toBeInTheDocument();

      // Footer
      const footer = screen.getByRole('contentinfo');
      expect(within(footer).getByText(/© 2026 The Infimit/i)).toBeInTheDocument();
    });

    it('exposes the SkipToContent link as the first focusable element', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <AppLayout>
          <p>Body</p>
        </AppLayout>,
      );

      await user.tab();
      const skipLink = screen.getByRole('link', { name: /skip to content/i });
      expect(skipLink).toHaveFocus();
    });
  });

  // ── 404 page ───────────────────────────────────────────────────────────
  describe('<NotFoundPage>', () => {
    it('renders the polished 404 with both nav actions', () => {
      renderWithProviders(<NotFoundPage />);

      expect(screen.getByText('404')).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: /couldn['’]t find that page/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/');
      expect(screen.getByRole('link', { name: /browse news/i })).toHaveAttribute('href', '/search');
    });
  });

  // ── MSW pipe ───────────────────────────────────────────────────────────
  describe('MSW + apiClient', () => {
    interface ArticleSummary {
      id: string;
      slug: string;
      title: string;
    }

    it('returns the success envelope for a known endpoint', async () => {
      const { data } = await apiClient.get<ApiResponse<ArticleSummary[]>>('/articles');
      expect(isApiSuccess(data)).toBe(true);
      if (isApiSuccess(data)) {
        expect(data.data.length).toBeGreaterThan(0);
        expect(data.data[0]).toMatchObject({
          id: expect.any(String),
          slug: expect.any(String),
          title: expect.any(String),
        });
      }
    });

    it('rejects with the contract-shaped error for an unauthenticated endpoint', async () => {
      await expect(apiClient.get('/auth/me')).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        message: expect.any(String),
      });
    });
  });
});
