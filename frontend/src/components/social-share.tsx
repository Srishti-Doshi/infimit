/**
 * `<SocialShare>` — share row for the article page (Sub-PR 5-fe-1).
 *
 * Four targets: X (Twitter), Facebook, LinkedIn, WhatsApp — plus a
 * copy-link button. Targets are plain `<a target="_blank">` intent URLs
 * (no SDK embeds — they're heavy, tracking-laden, and unnecessary for
 * MVP). Copy-link uses the async clipboard API with a toast confirm.
 *
 * Every interaction emits a `share` analytics event (fire-and-forget).
 * The BE counts shares per article via the trending score (share weight 5).
 *
 * Icon-only circular buttons with `aria-label`s; lucide has X/Facebook/
 * Linkedin brand glyphs which are fine at this size.
 */
import { Facebook, Link2, Linkedin, MessageCircle } from 'lucide-react';

import { toast } from '@/components/ui';
import { trackEvent } from '@/lib/analytics-api';

/**
 * X (formerly Twitter) brand glyph — lucide only ships the legacy bird, so
 * the current logo is inlined here. Path from simple-icons (CC0), 24×24
 * viewBox, `currentColor` fill so it inherits the button's text colour.
 */
function XLogo({ className }: { className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  );
}

interface SocialShareProps {
  articleId: string;
  title: string;
}

interface ShareTarget {
  label: string;
  icon: JSX.Element;
  buildUrl: (pageUrl: string, title: string) => string;
}

const TARGETS: ShareTarget[] = [
  {
    label: 'Share on X',
    icon: <XLogo className="h-3.5 w-3.5" />,
    buildUrl: (u, t) =>
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}`,
  },
  {
    label: 'Share on Facebook',
    icon: <Facebook className="h-4 w-4" aria-hidden="true" />,
    buildUrl: (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}`,
  },
  {
    label: 'Share on LinkedIn',
    icon: <Linkedin className="h-4 w-4" aria-hidden="true" />,
    buildUrl: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}`,
  },
  {
    label: 'Share on WhatsApp',
    icon: <MessageCircle className="h-4 w-4" aria-hidden="true" />,
    buildUrl: (u, t) => `https://wa.me/?text=${encodeURIComponent(`${t} ${u}`)}`,
  },
];

export function SocialShare({ articleId, title }: SocialShareProps): JSX.Element {
  const pageUrl = window.location.href;

  function emitShare(): void {
    void trackEvent({ type: 'share', articleId });
  }

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(pageUrl);
      toast.success('Link copied');
      emitShare();
    } catch {
      toast.error('Could not copy the link');
    }
  }

  return (
    <div className="flex items-center gap-2" aria-label="Share this article">
      <span className="text-body-xs font-semibold uppercase tracking-wide text-ink-tertiary">
        Share
      </span>
      {TARGETS.map((target) => (
        <a
          key={target.label}
          href={target.buildUrl(pageUrl, title)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={target.label}
          title={target.label}
          onClick={emitShare}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-ink-secondary transition-colors hover:border-brand-red-500 hover:text-brand-red-500"
        >
          {target.icon}
        </a>
      ))}
      <button
        type="button"
        onClick={() => void copyLink()}
        aria-label="Copy link"
        title="Copy link"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-ink-secondary transition-colors hover:border-brand-red-500 hover:text-brand-red-500"
      >
        <Link2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
