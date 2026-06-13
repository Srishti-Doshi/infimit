/**
 * `/contact` — static Contact page (Sub-PR 5-fe-2). Plain contact details,
 * no form — a contact form needs spam protection + a BE inbox, which is
 * Phase 2 scope. mailto links cover the MVP need.
 */
import { Mail, MapPin, Newspaper } from 'lucide-react';

import { StaticPage } from '@/components/static-page';

const CHANNELS = [
  {
    icon: Mail,
    label: 'Editorial',
    value: 'newsroom@theinfimit.com',
    href: 'mailto:newsroom@theinfimit.com',
    note: 'Story tips, corrections, and press releases.',
  },
  {
    icon: Newspaper,
    label: 'Partnerships',
    value: 'partners@theinfimit.com',
    href: 'mailto:partners@theinfimit.com',
    note: 'Publish through The Infimit as a partner organisation.',
  },
  {
    icon: MapPin,
    label: 'Office',
    value: 'Ohio, United States of America',
    href: null,
    note: 'A digital agency studio — remote-first newsroom.',
  },
];

export default function ContactPage(): JSX.Element {
  return (
    <StaticPage
      eyebrow="Company"
      title="Contact us"
      description="Reach the newsroom, pitch a partnership, or report a problem."
    >
      <ul className="!list-none space-y-6 !pl-0">
        {CHANNELS.map((c) => (
          <li key={c.label} className="flex items-start gap-4">
            <span className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-red-50 text-brand-red-600">
              <c.icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="font-display text-body-base font-semibold text-ink-primary">
                {c.label}
              </p>
              {c.href ? (
                <a
                  href={c.href}
                  className="text-body-base text-brand-red-600 underline-offset-4 hover:underline"
                >
                  {c.value}
                </a>
              ) : (
                <p className="text-body-base text-ink-primary">{c.value}</p>
              )}
              <p className="mt-0.5 text-body-sm text-ink-tertiary">{c.note}</p>
            </div>
          </li>
        ))}
      </ul>
    </StaticPage>
  );
}
