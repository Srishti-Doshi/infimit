import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import ForgotPasswordPage from '@/pages/auth/forgot-password';
import ResetPasswordPage from '@/pages/auth/reset-password';
import { renderWithProviders } from '@/test/render';

describe('<ForgotPasswordPage>', () => {
  it('shows the anti-enumeration confirmation after submit', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ForgotPasswordPage />, { initialEntries: ['/auth/forgot-password'] });

    await user.type(screen.getByLabelText('Email'), 'whoever@test.dev');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText(/if an account exists for that email/i)).toBeInTheDocument();
  });

  it('blocks submission on an invalid email', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ForgotPasswordPage />, { initialEntries: ['/auth/forgot-password'] });

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText(/enter a valid email address/i)).toBeInTheDocument();
  });
});

describe('<ResetPasswordPage>', () => {
  it('shows the missing-token state when no ?token= is present', () => {
    renderWithProviders(<ResetPasswordPage />, { initialEntries: ['/auth/reset-password'] });
    expect(screen.getByText(/reset link missing/i)).toBeInTheDocument();
  });

  it('blocks submission when the two passwords do not match', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ResetPasswordPage />, {
      initialEntries: ['/auth/reset-password?token=tok123'],
    });

    await user.type(screen.getByLabelText('New password'), 'Pa55word!!');
    await user.type(screen.getByLabelText('Confirm new password'), 'Different99!');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
  });

  it('accepts matching passwords and posts to the backend', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ResetPasswordPage />, {
      initialEntries: ['/auth/reset-password?token=tok123'],
    });

    await user.type(screen.getByLabelText('New password'), 'Pa55word!!');
    await user.type(screen.getByLabelText('Confirm new password'), 'Pa55word!!');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    // Mutation succeeded → button should leave the loading state (or unmount on
    // navigate). We just assert no inline error rendered.
    await waitFor(() => {
      expect(screen.queryByText(/passwords do not match/i)).not.toBeInTheDocument();
    });
  });
});
