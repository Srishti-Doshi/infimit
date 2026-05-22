import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Compose Tailwind class strings safely. Resolves conflicting utilities
 * (e.g. `p-2 p-4` → `p-4`) so overrides at call sites always win over
 * defaults inside variant configs.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
