import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { RedirectIfAuthed, RequireAuth, RequireRole } from '@/components/auth-guards';
import { useAuthStore } from '@/store/auth-store';
import { renderWithProviders } from '@/test/render';
import type { Role } from '@/types/auth';

/** Seed the auth store with (or without) a session, with hydration complete. */
function setUser(role: Role | null): void {
  if (role === null) {
    useAuthStore.setState({ user: null, accessToken: null, isHydrated: true });
  } else {
    useAuthStore.setState({
      user: { id: 'u1', name: 'Tester', email: 't@test.dev', role },
      accessToken: 'tok',
      isHydrated: true,
    });
  }
}

afterEach(() => {
  useAuthStore.setState({ user: null, accessToken: null, isHydrated: false });
});

describe('<RequireAuth>', () => {
  it('renders the protected content when a user is signed in', () => {
    setUser('reader');
    renderWithProviders(
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path="/protected" element={<div>Protected content</div>} />
        </Route>
      </Routes>,
      { initialEntries: ['/protected'] },
    );
    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });

  it('redirects to /auth/login when there is no user', () => {
    setUser(null);
    renderWithProviders(
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path="/protected" element={<div>Protected content</div>} />
        </Route>
        <Route path="/auth/login" element={<div>Login mock</div>} />
      </Routes>,
      { initialEntries: ['/protected'] },
    );
    expect(screen.getByText('Login mock')).toBeInTheDocument();
  });

  it('shows a spinner while boot hydration is in flight', () => {
    useAuthStore.setState({ user: null, accessToken: null, isHydrated: false });
    renderWithProviders(
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path="/protected" element={<div>Protected content</div>} />
        </Route>
      </Routes>,
      { initialEntries: ['/protected'] },
    );
    // Spinner's sr-only label
    expect(screen.getByText('Loading')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });
});

describe('<RequireRole>', () => {
  it('renders the route when the user role is allowed', () => {
    setUser('admin');
    renderWithProviders(
      <Routes>
        <Route element={<RequireAuth />}>
          <Route element={<RequireRole roles={['admin']} />}>
            <Route path="/admin" element={<div>Admin area</div>} />
          </Route>
        </Route>
      </Routes>,
      { initialEntries: ['/admin'] },
    );
    expect(screen.getByText('Admin area')).toBeInTheDocument();
  });

  it('redirects to /forbidden when the role does not match', () => {
    setUser('reader');
    renderWithProviders(
      <Routes>
        <Route element={<RequireAuth />}>
          <Route element={<RequireRole roles={['admin']} />}>
            <Route path="/admin" element={<div>Admin area</div>} />
          </Route>
        </Route>
        <Route path="/forbidden" element={<div>Forbidden page</div>} />
      </Routes>,
      { initialEntries: ['/admin'] },
    );
    expect(screen.getByText('Forbidden page')).toBeInTheDocument();
  });
});

describe('<RedirectIfAuthed>', () => {
  it('sends an authed user to their role landing', () => {
    setUser('admin');
    renderWithProviders(
      <Routes>
        <Route element={<RedirectIfAuthed />}>
          <Route path="/auth/login" element={<div>Login modal</div>} />
        </Route>
        <Route path="/dashboard/admin" element={<div>Admin dashboard</div>} />
      </Routes>,
      { initialEntries: ['/auth/login'] },
    );
    expect(screen.getByText('Admin dashboard')).toBeInTheDocument();
  });

  it('lets guests see the page when hydration is complete with no user', () => {
    setUser(null);
    renderWithProviders(
      <Routes>
        <Route element={<RedirectIfAuthed />}>
          <Route path="/auth/login" element={<div>Login modal</div>} />
        </Route>
      </Routes>,
      { initialEntries: ['/auth/login'] },
    );
    expect(screen.getByText('Login modal')).toBeInTheDocument();
  });
});
