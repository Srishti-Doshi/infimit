import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge needs to know about our custom font-size tokens
 * (`text-body-*`, `text-display-*` defined in `tailwind.config.ts`).
 * Without this, it sees `text-body-base` and `text-ink-inverse` both
 * starting with `text-…`, assumes they conflict, and drops the color —
 * which made the dark-button text invisible until we noticed.
 *
 * Keep this list in sync with `theme.extend.fontSize` in tailwind.config.ts.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'body-xs',
            'body-sm',
            'body-base',
            'body-lg',
            'body-xl',
            'display-sm',
            'display-md',
            'display-lg',
            'display-xl',
            'display-2xl',
          ],
        },
      ],
    },
  },
});

/**
 * Compose Tailwind class strings safely. Resolves conflicting utilities
 * (e.g. `p-2 p-4` → `p-4`) so overrides at call sites always win over
 * defaults inside variant configs.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
