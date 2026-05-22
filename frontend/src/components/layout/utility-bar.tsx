import { CloudSun, MapPin } from 'lucide-react';

import { Container } from '@/components/ui';

/**
 * UtilityBar — top metadata row (date · location · weather).
 * Hidden below md to keep mobile header lean. Subphase 1 uses static stubs;
 * real data wires in later subphases.
 */
export function UtilityBar(): JSX.Element {
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="hidden border-b border-line bg-surface md:block">
      <Container width="wide" className="!px-4 lg:!px-8">
        <div className="flex items-center justify-center gap-3 py-1.5 text-body-xs text-ink-secondary">
          <span>{today}</span>
          <span className="text-ink-tertiary" aria-hidden="true">
            ·
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            Indore
          </span>
          <span className="text-ink-tertiary" aria-hidden="true">
            ·
          </span>
          <span className="inline-flex items-center gap-1">
            <CloudSun className="h-3 w-3" aria-hidden="true" />
            25.3°C
          </span>
        </div>
      </Container>
    </div>
  );
}
