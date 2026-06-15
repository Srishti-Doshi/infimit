import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  Newspaper,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { Card, CardBody, Container } from '@/components/ui';

/**
 * Admin landing. A featured "Articles analytics" card sits above the
 * management entry-points (editors / authors / articles / organisations) —
 * deliberately styled to stand out as the admin's bird's-eye insight surface.
 */
export default function AdminLandingPage(): JSX.Element {
  const cards = [
    {
      to: '/dashboard/admin/editors',
      icon: <UsersRound className="h-6 w-6" aria-hidden="true" />,
      title: 'Editors',
      description: 'Invite editors and remove ones who have moved on.',
    },
    {
      to: '/dashboard/admin/authors',
      icon: <ShieldCheck className="h-6 w-6" aria-hidden="true" />,
      title: 'Authors',
      description: 'Create new authors and change any user’s role.',
    },
    {
      to: '/dashboard/admin/articles',
      icon: <Newspaper className="h-6 w-6" aria-hidden="true" />,
      title: 'Articles',
      description: 'Review every published article and publish or unpublish across the site.',
    },
    {
      to: '/dashboard/admin/organisations',
      icon: <Building2 className="h-6 w-6" aria-hidden="true" />,
      title: 'Organisations',
      description: 'Manage partner organisations that publish through Infimit.',
    },
  ];

  return (
    <Container width="default" className="py-12">
      <h1 className="font-display text-display-md font-semibold text-ink-primary">Admin console</h1>
      <p className="mt-2 text-body-base text-ink-secondary">
        Manage editors, authors, and partner organisations. Articles, comments, e-papers, and
        approvals are in the sidebar.
      </p>

      {/* Featured insight surface — styled to stand out from the plain
          management cards below. */}
      <Link
        to="/dashboard/admin/analytics"
        className="mt-8 block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red-500"
      >
        <Card className="group overflow-hidden border-transparent bg-gradient-to-br from-brand-red-500 to-brand-red-700 text-ink-inverse shadow-elev-2 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elev-3 hover:brightness-[1.04]">
          <CardBody className="flex flex-wrap items-center gap-5">
            <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/20 text-ink-inverse ring-1 ring-white/30">
              <BarChart3 className="h-7 w-7" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-display-sm font-semibold text-ink-inverse">
                  Articles analytics
                </h2>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-body-xs font-semibold uppercase tracking-wide text-ink-inverse ring-1 ring-white/25">
                  Insights
                </span>
              </div>
              <p className="mt-1 text-body-base text-ink-inverse/90">
                Every published article across the platform — views, saves, and comments, plus who
                wrote each one. Your bird&rsquo;s-eye view of what&rsquo;s performing.
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-body-sm font-semibold text-ink-inverse">
              View
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-1"
                aria-hidden="true"
              />
            </span>
          </CardBody>
        </Card>
      </Link>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red-500"
          >
            <Card className="h-full transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-brand-red-200 group-hover:shadow-elev-2">
              <CardBody className="flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-surface-rose-tint text-brand-red-600 ring-1 ring-brand-red-100 transition-colors group-hover:bg-brand-red-500 group-hover:text-ink-inverse group-hover:ring-brand-red-500">
                    {card.icon}
                  </span>
                  <ArrowUpRight
                    className="h-5 w-5 text-ink-tertiary opacity-0 transition-all group-hover:translate-x-0.5 group-hover:text-brand-red-500 group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </div>
                <p className="font-display text-display-sm font-semibold text-ink-primary transition-colors group-hover:text-brand-red-600">
                  {card.title}
                </p>
                <p className="text-body-sm text-ink-secondary">{card.description}</p>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </Container>
  );
}
