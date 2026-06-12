import {
  Bell,
  Bookmark,
  Building2,
  ClipboardCheck,
  FileText,
  Home,
  LayoutDashboard,
  MessageSquare,
  Newspaper,
  Send,
  ShieldCheck,
  User as UserIcon,
  Users,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';

import { useAuthStore } from '@/store/auth-store';
import type { Role } from '@/types/auth';

/**
 * A single navigation entry. Both the persistent `DashboardSidebar` and the
 * hamburger drawer `Sidebar` render `NavItem`s — they share the structure,
 * the icon, and the active-route behavior; only the surrounding chrome differs.
 */
export interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Set on routes like `/` that must match exactly, not as a prefix. */
  end?: boolean;
}

/**
 * Hook return shape. Signed-out users get `isAuthed: false` + an empty list —
 * consumers decide what to render in that case (the hamburger drawer falls
 * back to its reader-only nav; the dashboard sidebar wouldn't mount at all
 * for an unauthed user because `RequireAuth` would have already redirected).
 */
export interface RoleNavConfig {
  isAuthed: boolean;
  /** Human-readable role badge text for the dashboard sidebar header. */
  roleLabel: string | null;
  items: NavItem[];
}

const ROLE_LABELS: Record<Role, string> = {
  reader: 'Reader',
  author: 'Author',
  editor: 'Editor',
  admin: 'Admin',
};

const READER_NAV: NavItem[] = [
  { label: 'Home', href: '/', icon: Home, end: true },
  { label: 'Bookmarks', href: '/dashboard/me/bookmarks', icon: Bookmark },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { label: 'Profile', href: '/dashboard/me', icon: UserIcon },
];

const AUTHOR_NAV: NavItem[] = [
  { label: 'Home', href: '/', icon: Home, end: true },
  { label: 'My drafts', href: '/dashboard/author/drafts', icon: FileText },
  { label: 'My submissions', href: '/dashboard/author/submissions', icon: Send },
  // The author's live pieces + reader stats (5-fe-3, closes #78).
  { label: 'Published', href: '/dashboard/author/published', icon: Newspaper },
  // Every role is also a reader — bookmarks are universal (5-fd).
  { label: 'Bookmarks', href: '/dashboard/me/bookmarks', icon: Bookmark },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { label: 'Profile', href: '/dashboard/me', icon: UserIcon },
];

const EDITOR_NAV: NavItem[] = [
  { label: 'Home', href: '/', icon: Home, end: true },
  { label: 'Approvals queue', href: '/dashboard/editor/approvals', icon: ClipboardCheck },
  { label: 'Pending comments', href: '/dashboard/editor/comments/pending', icon: MessageSquare },
  // Editors can author drafts too (per PR #40 COI fix). "My drafts" gives
  // them a way back to drafts they create via the Write article CTA (#53).
  { label: 'My drafts', href: '/dashboard/author/drafts', icon: FileText },
  // Editors author pieces too — same live-pieces view as authors (#78).
  { label: 'Published', href: '/dashboard/author/published', icon: Newspaper },
  // Every role is also a reader — bookmarks are universal (5-fd).
  { label: 'Bookmarks', href: '/dashboard/me/bookmarks', icon: Bookmark },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { label: 'Profile', href: '/dashboard/me', icon: UserIcon },
];

const ADMIN_NAV: NavItem[] = [
  { label: 'Home', href: '/', icon: Home, end: true },
  { label: 'Admin console', href: '/dashboard/admin', icon: LayoutDashboard, end: true },
  { label: 'Approvals queue', href: '/dashboard/admin/approvals', icon: ClipboardCheck },
  // Admin role inherits editor capabilities via RBAC hierarchy, so the
  // comment moderation queue belongs in the admin sidebar too — mirroring
  // the order it has in EDITOR_NAV. Pins #99.
  { label: 'Pending comments', href: '/dashboard/editor/comments/pending', icon: MessageSquare },
  { label: 'Articles', href: '/dashboard/admin/articles', icon: FileText },
  { label: 'Authors', href: '/dashboard/admin/authors', icon: ShieldCheck },
  { label: 'Editors', href: '/dashboard/admin/editors', icon: Users },
  { label: 'Organisations', href: '/dashboard/admin/organisations', icon: Building2 },
  { label: 'E-papers', href: '/dashboard/admin/epapers', icon: Newspaper },
  // Admins can author drafts too. Same rationale as EDITOR_NAV's My drafts.
  { label: 'My drafts', href: '/dashboard/author/drafts', icon: FileText },
  // Every role is also a reader — bookmarks are universal (5-fd).
  { label: 'Bookmarks', href: '/dashboard/me/bookmarks', icon: Bookmark },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { label: 'Profile', href: '/dashboard/me', icon: UserIcon },
];

const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  reader: READER_NAV,
  author: AUTHOR_NAV,
  editor: EDITOR_NAV,
  admin: ADMIN_NAV,
};

/**
 * useRoleNav — single source of truth for role-aware navigation.
 *
 * Both surfaces consume this: the persistent `DashboardSidebar` on `/dashboard/*`
 * routes (desktop), and the hamburger drawer `Sidebar` (all routes; mobile-first
 * + a fallback desktop access via the header hamburger).
 *
 * Returns `isAuthed: false` + empty items when no user is in the auth store —
 * the hamburger drawer's reader-only fallback (categories, sign-in CTAs) is
 * out of scope here because those entries aren't role-specific.
 */
export function useRoleNav(): RoleNavConfig {
  const user = useAuthStore((s) => s.user);
  if (!user) {
    return { isAuthed: false, roleLabel: null, items: [] };
  }
  return {
    isAuthed: true,
    roleLabel: ROLE_LABELS[user.role],
    items: NAV_BY_ROLE[user.role],
  };
}
