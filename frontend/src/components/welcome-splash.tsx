import { useEffect, useState } from 'react';

import { Button, Modal } from '@/components/ui';
import { usePreferencesStore } from '@/store';

/**
 * WelcomeSplash — shown once per visitor on first home-page load.
 *
 * Persistence is gated by `usePreferencesStore.hasSeenWelcomeSplash`
 * (localStorage-backed via Zustand's `persist` middleware). Visual treatment
 * matches the "Welcome to INFIMIT" frame from the Figma design — dark editorial
 * panel with red accent ring + display-serif wordmark.
 *
 * Dev escape hatch: append `?reset=welcome` to any URL to clear the flag and
 * re-trigger the splash. The query string is left intact so refreshing keeps
 * the override active until manually removed.
 */
export function WelcomeSplash(): JSX.Element {
  const hasSeen = usePreferencesStore((s) => s.hasSeenWelcomeSplash);
  const markSeen = usePreferencesStore((s) => s.markWelcomeSplashSeen);
  const resetSeen = usePreferencesStore((s) => s.resetWelcomeSplash);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset') === 'welcome' && hasSeen) {
      resetSeen();
      return;
    }
    if (!hasSeen) {
      const t = setTimeout(() => setOpen(true), 350);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [hasSeen, resetSeen]);

  function handleGetStarted(): void {
    markSeen();
    setOpen(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) handleGetStarted();
      }}
      size="md"
      hideCloseButton
      panelClassName="bg-ink-primary ring-2 ring-brand-red-500"
      ariaLabel="Welcome to The Infimit"
    >
      <div className="px-8 py-12 text-center sm:px-12 sm:py-14">
        <p className="font-display text-body-sm font-medium uppercase tracking-[0.2em] text-ink-inverse/70">
          Welcome to
        </p>
        <h2 className="mt-3 font-display text-display-xl font-bold uppercase tracking-tight text-brand-red-500 sm:text-display-2xl">
          Infimit
        </h2>
        <div className="mx-auto mt-5 h-0.5 w-12 bg-brand-red-500" aria-hidden="true" />
        <p className="mx-auto mt-6 max-w-xs text-body-base text-ink-inverse/80">
          Higher Education News &amp; Events Network
        </p>
        <Button
          variant="primary"
          size="lg"
          onClick={handleGetStarted}
          className="mt-9 rounded-full"
        >
          Get Started
        </Button>
      </div>
    </Modal>
  );
}
