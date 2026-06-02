import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';

import NewDraftPage from '@/pages/dashboard/author/drafts/new';
import { renderWithProviders } from '@/test/render';

/**
 * Happy-path test for the new-draft composer. Renders inside its own Routes
 * harness so we can assert the post-create navigation to /drafts/:id by
 * detecting the stub element rendered at that route.
 */
describe('<NewDraftPage>', () => {
  it('creates a draft and navigates to its edit route', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/dashboard/author/drafts/new" element={<NewDraftPage />} />
        <Route
          path="/dashboard/author/drafts/:id"
          element={<div data-testid="edit-stub">Edit page (post-create stub)</div>}
        />
      </Routes>,
      { initialEntries: ['/dashboard/author/drafts/new'] },
    );

    await user.type(screen.getByLabelText('Title'), 'Notes on campus internet access');

    // Category select — pre-defaults to campus_news, leave it.
    // Add one tag.
    const tagInput = screen.getByPlaceholderText(/add a tag/i);
    await user.type(tagInput, 'access{Enter}');
    expect(screen.getByText('access')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /save draft/i }));

    // After success, NewDraftPage navigates to /drafts/:id — the stub appears.
    await waitFor(() => expect(screen.getByTestId('edit-stub')).toBeInTheDocument());
  });

  it('blocks submission and surfaces a title error when title is missing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewDraftPage />, {
      initialEntries: ['/dashboard/author/drafts/new'],
    });

    await user.click(screen.getByRole('button', { name: /save draft/i }));

    expect(await screen.findByText(/title is required/i)).toBeInTheDocument();
  });
});
