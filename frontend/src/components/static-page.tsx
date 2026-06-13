/**
 * `<StaticPage>` — shared scaffold for the prose pages (About, Contact,
 * Privacy, Terms — Sub-PR 5-fe-2). Renders the newspaper-style header
 * (red eyebrow → display title → optional intro) above a narrow prose
 * column, plus the per-route `<Seo>` tags.
 *
 * Children are plain JSX prose — headings use `<h2>` styled via the
 * `[&_h2]` selectors here so the content pages stay markup-only.
 */
import type { ReactNode } from 'react';

import { Seo } from '@/components/seo';
import { Container } from '@/components/ui';

interface StaticPageProps {
  eyebrow: string;
  title: string;
  /** Meta description; also rendered as the visible intro when provided. */
  description: string;
  children: ReactNode;
}

export function StaticPage({
  eyebrow,
  title,
  description,
  children,
}: StaticPageProps): JSX.Element {
  return (
    <Container width="default" className="py-10">
      <Seo title={title} description={description} />
      <header className="border-b-2 border-brand-red-500 pb-5">
        <p className="text-body-xs font-semibold uppercase tracking-widest text-brand-red-500">
          {eyebrow}
        </p>
        <h1 className="mt-1 font-display text-display-md font-bold text-ink-primary">{title}</h1>
        <p className="mt-3 text-body-base text-ink-secondary">{description}</p>
      </header>
      <div className="mt-8 space-y-4 text-body-base leading-relaxed text-ink-primary [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-body-xl [&_h2]:font-semibold [&_h2]:text-ink-primary [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6">
        {children}
      </div>
    </Container>
  );
}
