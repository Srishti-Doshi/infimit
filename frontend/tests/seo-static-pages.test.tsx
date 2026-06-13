/**
 * SEO + static pages (Sub-PR 5-fe-2) — covers:
 *   - The four static pages render their headings + key content
 *   - `<Seo>` sets document.title with the "· The Infimit" suffix
 *   - The article page emits a schema.org Article JSON-LD script
 *   - Footer only links to routes that exist
 *
 * Helmet writes to document.head asynchronously inside the same act() pass;
 * `waitFor` covers the flush.
 */
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { Footer } from '@/components/layout/footer';
import { server } from '@/mocks/server';
import AboutPage from '@/pages/about';
import ArticlePage from '@/pages/article';
import ContactPage from '@/pages/contact';
import PrivacyPage from '@/pages/legal/privacy';
import TermsPage from '@/pages/legal/terms';
import { renderWithProviders } from '@/test/render';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

describe('static pages', () => {
  it('renders the About page with title + sections and sets document.title', async () => {
    renderWithProviders(<AboutPage />, { initialEntries: ['/about'] });
    expect(
      screen.getByRole('heading', { level: 1, name: /about the infimit/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /what we publish/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(document.title).toBe('About The Infimit · The Infimit');
    });
  });

  it('renders the Contact page with the editorial mailto link', () => {
    renderWithProviders(<ContactPage />, { initialEntries: ['/contact'] });
    expect(screen.getByRole('heading', { level: 1, name: /contact us/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /newsroom@theinfimit\.com/i })).toHaveAttribute(
      'href',
      'mailto:newsroom@theinfimit.com',
    );
  });

  it('renders the Privacy page with the analytics retention disclosure', () => {
    renderWithProviders(<PrivacyPage />, { initialEntries: ['/legal/privacy'] });
    expect(screen.getByRole('heading', { level: 1, name: /privacy policy/i })).toBeInTheDocument();
    expect(screen.getByText(/deleted automatically after 90 days/i)).toBeInTheDocument();
  });

  it('renders the Terms page with the comments policy section', () => {
    renderWithProviders(<TermsPage />, { initialEntries: ['/legal/terms'] });
    expect(
      screen.getByRole('heading', { level: 1, name: /terms of service/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^comments$/i })).toBeInTheDocument();
  });
});

describe('article page SEO', () => {
  it('emits a schema.org Article JSON-LD script and a suffixed title', async () => {
    server.use(
      http.get(`${BASE}/articles/slug/seo-test-article`, () =>
        HttpResponse.json({
          success: true,
          data: {
            article: {
              id: 'art_seo_1',
              slug: 'seo-test-article',
              title: 'SEO Test Article',
              subtitle: 'A subtitle for the test',
              body: '<p>Body</p>',
              category: 'campus_news',
              status: 'published',
              authorId: 'u1',
              author: { id: 'u1', name: 'Ishita Mishra' },
              coverImageUrl: 'https://cdn.example.com/cover.jpg',
              publishedAt: '2026-06-01T09:00:00.000Z',
              ai: { summary: 'Concise AI summary.', readingTimeMin: 4, degraded: false },
              version: 1,
              createdAt: '2026-05-30T09:00:00.000Z',
              updatedAt: '2026-06-01T09:00:00.000Z',
            },
          },
        }),
      ),
    );

    renderWithProviders(
      <Routes>
        <Route path="/article/:slug" element={<ArticlePage />} />
      </Routes>,
      { initialEntries: ['/article/seo-test-article'] },
    );

    expect(await screen.findByRole('heading', { name: /seo test article/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(document.title).toBe('SEO Test Article · The Infimit');
    });
    await waitFor(() => {
      const script = document.head.querySelector('script[type="application/ld+json"]');
      expect(script).not.toBeNull();
      const jsonLd = JSON.parse(script!.textContent ?? '{}') as Record<string, unknown>;
      expect(jsonLd['@type']).toBe('Article');
      expect(jsonLd.headline).toBe('SEO Test Article');
      expect(jsonLd.description).toBe('Concise AI summary.');
      expect((jsonLd.author as { name: string }).name).toBe('Ishita Mishra');
    });
  });
});

describe('footer link hygiene', () => {
  it('only renders links to real routes (no Subphase 1 phantom hrefs)', () => {
    renderWithProviders(<Footer />);
    const phantom = ['/newsletters', '/podcasts', '/blog', '/legal/cookies', '/legal/disclaimer'];
    const hrefs = Array.from(document.querySelectorAll('footer a[href]')).map((a) =>
      a.getAttribute('href'),
    );
    for (const dead of phantom) {
      expect(hrefs).not.toContain(dead);
    }
    expect(hrefs).toContain('/about');
    expect(hrefs).toContain('/contact');
    expect(hrefs).toContain('/legal/privacy');
    expect(hrefs).toContain('/legal/terms');
  });
});
