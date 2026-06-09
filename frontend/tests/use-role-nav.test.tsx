import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useRoleNav } from '@/lib/use-role-nav';
import { useAuthStore } from '@/store/auth-store';
import type { Role, User } from '@/types/auth';

function makeUser(role: Role): User {
  return {
    id: 'usr_test',
    name: 'Test User',
    email: 'test@infimit.dev',
    role,
  };
}

afterEach(() => {
  useAuthStore.setState({ accessToken: null, user: null, isHydrated: false });
});

describe('useRoleNav', () => {
  it('returns isAuthed:false + empty items when no user is in the store', () => {
    const { result } = renderHook(() => useRoleNav());
    expect(result.current.isAuthed).toBe(false);
    expect(result.current.roleLabel).toBeNull();
    expect(result.current.items).toEqual([]);
  });

  it('returns reader nav when user role is reader', () => {
    useAuthStore.setState({ user: makeUser('reader') });
    const { result } = renderHook(() => useRoleNav());
    expect(result.current.isAuthed).toBe(true);
    expect(result.current.roleLabel).toBe('Reader');
    expect(result.current.items.map((i) => i.label)).toEqual([
      'Home',
      'My library',
      'Notifications',
      'Profile',
    ]);
  });

  it('returns author nav with My drafts and My submissions when user role is author', () => {
    useAuthStore.setState({ user: makeUser('author') });
    const { result } = renderHook(() => useRoleNav());
    expect(result.current.roleLabel).toBe('Author');
    expect(result.current.items.map((i) => i.label)).toEqual([
      'Home',
      'My drafts',
      'My submissions',
      'Notifications',
      'Profile',
    ]);
  });

  it('returns editor nav with Approvals queue + Pending comments + My drafts when user role is editor', () => {
    useAuthStore.setState({ user: makeUser('editor') });
    const { result } = renderHook(() => useRoleNav());
    expect(result.current.roleLabel).toBe('Editor');
    expect(result.current.items.map((i) => i.label)).toEqual([
      'Home',
      'Approvals queue',
      'Pending comments',
      'My drafts',
      'Notifications',
      'Profile',
    ]);
  });

  it('returns admin nav with Admin console + Articles + Authors + Editors + Organisations + E-papers + My drafts when user role is admin', () => {
    useAuthStore.setState({ user: makeUser('admin') });
    const { result } = renderHook(() => useRoleNav());
    expect(result.current.roleLabel).toBe('Admin');
    expect(result.current.items.map((i) => i.label)).toEqual([
      'Home',
      'Admin console',
      'Approvals queue',
      'Articles',
      'Authors',
      'Editors',
      'Organisations',
      'E-papers',
      'My drafts',
      'Notifications',
      'Profile',
    ]);
  });

  it('routes to the correct hrefs per role', () => {
    useAuthStore.setState({ user: makeUser('admin') });
    const { result } = renderHook(() => useRoleNav());
    const hrefByLabel = Object.fromEntries(result.current.items.map((i) => [i.label, i.href]));
    expect(hrefByLabel).toMatchObject({
      Home: '/',
      'Admin console': '/dashboard/admin',
      'Approvals queue': '/dashboard/admin/approvals',
      Articles: '/dashboard/admin/articles',
      Authors: '/dashboard/admin/authors',
      Editors: '/dashboard/admin/editors',
      Organisations: '/dashboard/admin/organisations',
      'E-papers': '/dashboard/admin/epapers',
      'My drafts': '/dashboard/author/drafts',
      Notifications: '/dashboard/notifications',
      Profile: '/dashboard/me',
    });
  });
});
