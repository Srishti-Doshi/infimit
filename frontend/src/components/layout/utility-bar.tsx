import { useQuery } from '@tanstack/react-query';
import { CloudSun, MapPin } from 'lucide-react';

import { Container } from '@/components/ui';

// Indore, Madhya Pradesh — the publication's home city. Coordinates feed the
// live-weather lookup; the label is shown verbatim.
const LOCATION = 'Indore';
const LATITUDE = 22.7196;
const LONGITUDE = 75.8577;

/**
 * Current temperature from open-meteo — a free, keyless, CORS-enabled weather
 * API (no backend proxy needed). Returns null on any failure so the caller can
 * simply hide the temperature rather than show a stale/placeholder value.
 */
async function fetchTemperature(): Promise<number | null> {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${LATITUDE}&longitude=${LONGITUDE}&current=temperature_2m`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { current?: { temperature_2m?: number } };
  const temp = data.current?.temperature_2m;
  return typeof temp === 'number' ? temp : null;
}

/**
 * UtilityBar — top metadata row (date · location · live weather).
 * Hidden below md to keep the mobile header lean. The date is the browser's
 * real local date; the temperature is fetched live for {@link LOCATION} and
 * hidden if the lookup is still loading or fails (so nothing static is shown
 * dressed up as live data).
 */
export function UtilityBar(): JSX.Element {
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const { data: temperature } = useQuery({
    queryKey: ['weather', LOCATION],
    queryFn: fetchTemperature,
    staleTime: 10 * 60 * 1000, // 10 min — weather doesn't move fast.
    retry: 1,
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
            {LOCATION}
          </span>
          {typeof temperature === 'number' ? (
            <>
              <span className="text-ink-tertiary" aria-hidden="true">
                ·
              </span>
              <span className="inline-flex items-center gap-1">
                <CloudSun className="h-3 w-3" aria-hidden="true" />
                {temperature.toFixed(1)}°C
              </span>
            </>
          ) : null}
        </div>
      </Container>
    </div>
  );
}
