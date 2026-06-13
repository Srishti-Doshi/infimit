import { Facebook, Instagram, Linkedin, Twitter } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Container } from '@/components/ui';

import { Logo } from './logo';

// Every href below must resolve to a real route — dead footer links are a
// crawl/SEO liability and a reader dead-end. Phantom Subphase 1 entries
// (Newsletters, Podcasts, Blog, Cookie Policy, …) were trimmed in 5-fe-2;
// restore each one only when its page actually ships.
const COLUMNS = [
  {
    title: 'Service',
    links: [
      { label: 'E-Paper', href: '/epaper' },
      { label: 'Search', href: '/search' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/legal/privacy' },
      { label: 'Terms of Service', href: '/legal/terms' },
    ],
  },
];

const SOCIAL = [
  { label: 'Facebook', href: '#', icon: Facebook },
  { label: 'Twitter / X', href: '#', icon: Twitter },
  { label: 'Instagram', href: '#', icon: Instagram },
  { label: 'LinkedIn', href: '#', icon: Linkedin },
];

/**
 * Footer — 4-column responsive footer with brand block, link columns,
 * social links, and a copyright meta row. Collapses gracefully:
 *   sm: 1-col stacked / md: 2-col grid / lg+: 4-col + brand block.
 */
export function Footer(): JSX.Element {
  return (
    <footer className="mt-16 border-t border-line bg-surface" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">
        Footer
      </h2>
      <Container width="wide" className="py-12 lg:py-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
          <div>
            <Logo variant="compact" />
            <p className="mt-4 max-w-xs text-body-sm text-ink-secondary">
              Higher education news and events network. A digital agency studio based in Ohio,
              United States of America.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <FooterColumn key={col.title} title={col.title} links={col.links} />
          ))}

          <div>
            <h3 className="font-display text-body-sm font-semibold uppercase tracking-wider text-ink-primary">
              Follow Us
            </h3>
            <ul className="mt-4 flex flex-wrap gap-3">
              {SOCIAL.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.href}
                    aria-label={s.label}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface text-ink-primary ring-1 ring-line transition-colors hover:bg-brand-red-500 hover:text-ink-inverse hover:ring-brand-red-500"
                  >
                    <s.icon className="h-4 w-4" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-line pt-6 text-body-xs text-ink-tertiary sm:flex-row">
          <p>© 2026 The Infimit. All Rights Reserved.</p>
          <p>RNI NO: MPBIL/2012/47015 · ISSN NO: 2582-2071</p>
        </div>
      </Container>
    </footer>
  );
}

interface FooterColumnProps {
  title: string;
  links: ReadonlyArray<{ label: string; href: string }>;
}

function FooterColumn({ title, links }: FooterColumnProps): JSX.Element {
  return (
    <div>
      <h3 className="font-display text-body-sm font-semibold uppercase tracking-wider text-ink-primary">
        {title}
      </h3>
      <ul className="mt-4 space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              to={link.href}
              className="text-body-sm text-ink-secondary transition-colors hover:text-brand-red-500"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
