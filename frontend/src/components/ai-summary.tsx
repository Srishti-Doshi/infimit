import { cn } from '@/lib/cn';

/**
 * `<AiSummary>` — renders an AI-generated summary string.
 *
 * The summarizer returns bullet-pointed lines (a `•` per line, newline
 * separated). Rendered in a plain `<p>`, HTML collapses those newlines into a
 * single run-on line — so we detect the bullet shape and render a semantic
 * `<ul>` instead, stripping the leading marker. Anything that doesn't look
 * like a bullet list (prose, a single line) falls back to a `<p>` with
 * `whitespace-pre-wrap`, so a future non-bullet model degrades gracefully.
 *
 * Shared by the public reader card (`pages/article.tsx`) and the editor
 * block (`components/editor/ai-summary-block.tsx`) so both render identically.
 */

// Leading list markers the summarizer (or a human-edited summary) might use.
const BULLET_RE = /^\s*[•·▪‣◦–—\-*]\s+/;

interface AiSummaryProps {
  text: string;
  /** Extra classes merged onto the rendered element (e.g. margins). */
  className?: string;
}

export function AiSummary({ text, className }: AiSummaryProps): JSX.Element {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  // Treat it as a list when it's multi-line and the majority of lines carry a
  // bullet marker — tolerant of a stray non-bulleted line.
  const bulletCount = lines.filter((line) => BULLET_RE.test(line)).length;
  const isBulleted = lines.length >= 2 && bulletCount >= Math.ceil(lines.length / 2);

  if (isBulleted) {
    return (
      <ul className={cn('list-disc space-y-1 pl-5 text-body-base text-ink-primary', className)}>
        {lines.map((line, index) => (
          <li key={`${index}:${line}`}>{line.replace(BULLET_RE, '')}</li>
        ))}
      </ul>
    );
  }

  return (
    <p className={cn('whitespace-pre-wrap text-body-base text-ink-primary', className)}>{text}</p>
  );
}
