import type { ReactNode } from 'react';

import { Toaster } from '@/components/ui';
import { WelcomeSplash } from '@/components/welcome-splash';

import { Footer } from './footer';
import { Header } from './header';
import { Sidebar } from './sidebar';
import { SkipToContent } from './skip-to-content';

interface AppLayoutProps {
  children: ReactNode;
}

/**
 * AppLayout — the top-level shell that wraps every route.
 *
 * - Header + Sidebar consume `useUIStore` directly (no prop drilling).
 * - `<Toaster>` mounts once here so any module can `toast()` from anywhere.
 * - `<WelcomeSplash>` self-gates by localStorage; mounting it here ensures it
 *   triggers on the very first paint, regardless of which route loaded first.
 */
export function AppLayout({ children }: AppLayoutProps): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <SkipToContent />
      <Header />
      <Sidebar />
      <main id="content" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <Footer />
      <Toaster />
      <WelcomeSplash />
    </div>
  );
}
