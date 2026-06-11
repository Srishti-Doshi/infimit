import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import NewEpaperPage from '@/pages/dashboard/admin/epapers/new';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/store/auth-store';

function signInAsAdmin(): void {
  useAuthStore.setState({
    user: {
      id: 'usr_demo_001',
      name: 'Demo Admin',
      email: 'admin@infimit.test',
      role: 'admin',
      avatarUrl: null,
    },
    accessToken: 'mock-access-token',
    isHydrated: true,
  });
}

afterEach(() => {
  useAuthStore.setState({ user: null, accessToken: null, isHydrated: true });
});

function renderForm(): ReturnType<typeof renderWithProviders> {
  // Wrapping in <Routes> mounts the form under its intended path so any
  // <Link to="/dashboard/admin/epapers"> back-nav resolves correctly.
  return renderWithProviders(
    <Routes>
      <Route path="/dashboard/admin/epapers/new" element={<NewEpaperPage />} />
    </Routes>,
    { initialEntries: ['/dashboard/admin/epapers/new'] },
  );
}

/**
 * The full happy-path (upload PDF + cover + submit + navigate to archive)
 * involves driving the three-step S3 upload twice — that's covered at the
 * <MediaUploader> level in media-uploader.test.tsx. Here we focus on the
 * cheaper-to-test surface that's specific to this page: title + date
 * field rendering, and the submit-disabled gating.
 */
describe('<NewEpaperPage>', () => {
  it('renders the title + issue-date + page-count fields and a PDF + cover uploader', () => {
    signInAsAdmin();
    renderForm();

    expect(screen.getByRole('heading', { name: /new e-paper issue/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^title$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^issue date$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/page count/i)).toBeInTheDocument();
    // MediaUploader labels — use the helperText to disambiguate since the
    // "Cover image" / "PDF file" strings appear in multiple slots
    // (visible label + aria attributes inside the uploader).
    expect(screen.getByText(/pdf up to 50 mb/i)).toBeInTheDocument();
    expect(screen.getByText(/portrait 3:4.*1200×1600/i)).toBeInTheDocument();
  });

  it('keeps Publish disabled until title + date + both media docs are present', async () => {
    signInAsAdmin();
    const user = userEvent.setup();
    renderForm();

    const submit = screen.getByRole('button', { name: /publish issue/i });
    expect(submit).toBeDisabled();

    // Type a title only — submit still disabled (no date + no media).
    await user.type(screen.getByLabelText(/^title$/i), 'Morning Edition — 4 June 2026');
    expect(submit).toBeDisabled();

    // Fill in the date — submit still disabled (no media uploaded).
    const dateInput = screen.getByLabelText(/^issue date$/i);
    await user.type(dateInput, '2026-06-04');
    expect(submit).toBeDisabled();
  });

  it('Cancel link goes back to the archive', () => {
    signInAsAdmin();
    renderForm();
    expect(screen.getByRole('link', { name: /cancel/i })).toHaveAttribute(
      'href',
      '/dashboard/admin/epapers',
    );
  });
});
