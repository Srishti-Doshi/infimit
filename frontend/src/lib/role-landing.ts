import type { Role } from '@/types/auth';

/**
 * Default landing path per role, used after login/register and when an authed
 * user lands on a guest-only page. Readers land on their profile (`/dashboard/me`);
 * other roles land on their role dashboard.
 */
export function roleLanding(role: Role): string {
  switch (role) {
    case 'admin':
      return '/dashboard/admin';
    case 'editor':
      return '/dashboard/editor';
    case 'author':
      return '/dashboard/author';
    case 'reader':
    default:
      return '/dashboard/me';
  }
}
