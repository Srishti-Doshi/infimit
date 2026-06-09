import { Building2, ShieldCheck, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Card, CardBody, Container } from '@/components/ui';

/**
 * Admin landing. Two entry-point cards for the Subphase 2 admin areas;
 * deeper analytics / approvals tools land in Subphase 4–5.
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
        Identity surfaces for Subphase 2. Articles, comments, ads, and analytics arrive later.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red-500"
          >
            <Card className="h-full transition-shadow hover:shadow-elev-2">
              <CardBody className="flex flex-col gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-surface-rose-tint text-brand-red-600">
                  {card.icon}
                </span>
                <p className="font-display text-display-sm font-semibold text-ink-primary">
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
