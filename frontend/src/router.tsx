import { lazy, Suspense } from 'react';
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router-dom';

import { RedirectIfAuthed, RequireAuth, RequireRole } from '@/components/auth-guards';
import { AppLayout, DashboardLayout } from '@/components/layout';
import { Spinner } from '@/components/ui';

import ForbiddenPage from '@/pages/forbidden';
import NotFoundPage from '@/pages/not-found';

// Lazy-loaded route chunks — each becomes its own bundle so the entry chunk
// stays small.
const HomePage = lazy(() => import('@/pages/home'));
const CategoryPage = lazy(() => import('@/pages/category'));
const ArticlePage = lazy(() => import('@/pages/article'));
const SearchPage = lazy(() => import('@/pages/search'));
const EpaperPage = lazy(() => import('@/pages/epaper'));
const EpaperIssuePage = lazy(() => import('@/pages/epaper-issue'));

const LoginPage = lazy(() => import('@/pages/auth/login'));
const RegisterPage = lazy(() => import('@/pages/auth/register'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/forgot-password'));
const ResetPasswordPage = lazy(() => import('@/pages/auth/reset-password'));
const VerifyEmailPage = lazy(() => import('@/pages/auth/verify-email'));

const ProfilePage = lazy(() => import('@/pages/dashboard/me'));
const BookmarksPage = lazy(() => import('@/pages/dashboard/me/bookmarks'));
const NotificationsPage = lazy(() => import('@/pages/dashboard/notifications'));
const ReaderDashboardPage = lazy(() => import('@/pages/dashboard/reader'));
const DraftsPage = lazy(() => import('@/pages/dashboard/author/drafts'));
const NewDraftPage = lazy(() => import('@/pages/dashboard/author/drafts/new'));
const EditDraftPage = lazy(() => import('@/pages/dashboard/author/drafts/edit'));
const SubmissionsPage = lazy(() => import('@/pages/dashboard/author/submissions'));
const EditorDashboardPage = lazy(() => import('@/pages/dashboard/editor'));
const ApprovalsPage = lazy(() => import('@/pages/dashboard/editor/approvals'));
const ApprovalPreviewPage = lazy(() => import('@/pages/dashboard/editor/approvals/preview'));
const PendingCommentsPage = lazy(() => import('@/pages/dashboard/editor/comments/pending'));
const AdminLandingPage = lazy(() => import('@/pages/dashboard/admin'));
const AdminArticlesPage = lazy(() => import('@/pages/dashboard/admin/articles'));
const AdminAuthorsPage = lazy(() => import('@/pages/dashboard/admin/authors'));
const AdminEditorsPage = lazy(() => import('@/pages/dashboard/admin/editors'));
const AdminOrganisationsPage = lazy(() => import('@/pages/dashboard/admin/organisations'));
const AdminApprovalsPage = lazy(() => import('@/pages/dashboard/admin/approvals'));
const AdminEpapersPage = lazy(() => import('@/pages/dashboard/admin/epapers'));
const NewEpaperPage = lazy(() => import('@/pages/dashboard/admin/epapers/new'));

function RouteFallback(): JSX.Element {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-brand-red-500">
      <Spinner size="lg" label="Loading page" />
    </div>
  );
}

/**
 * RootLayout — every route renders inside AppLayout. The `<Suspense>` boundary
 * sits inside `<main>` so the header/footer chrome stays visible while a route
 * chunk loads.
 */
function RootLayout(): JSX.Element {
  return (
    <AppLayout>
      <Suspense fallback={<RouteFallback />}>
        <Outlet />
      </Suspense>
    </AppLayout>
  );
}

const router = createBrowserRouter(
  [
    {
      element: <RootLayout />,
      children: [
        { index: true, element: <HomePage /> },
        { path: 'category/:slug', element: <CategoryPage /> },
        { path: 'article/:slug', element: <ArticlePage /> },
        { path: 'search', element: <SearchPage /> },
        { path: 'epaper', element: <EpaperPage /> },
        { path: 'epaper/:id', element: <EpaperIssuePage /> },

        // Guest-only auth pages: an authed user lands on their role-based
        // dashboard instead. Password recovery + email verification stay
        // accessible to everyone (authed users may also reset).
        {
          element: <RedirectIfAuthed />,
          children: [
            { path: 'auth/login', element: <LoginPage /> },
            { path: 'auth/register', element: <RegisterPage /> },
          ],
        },
        { path: 'auth/forgot-password', element: <ForgotPasswordPage /> },
        { path: 'auth/reset-password', element: <ResetPasswordPage /> },
        { path: 'auth/verify-email', element: <VerifyEmailPage /> },

        // Authenticated routes. Wrapped in `DashboardLayout` so the
        // role-aware persistent sidebar (lg+) mounts once for every
        // dashboard route. Inner `RequireRole` wrappers enforce role
        // hierarchy (admin > editor > author > reader).
        {
          element: <RequireAuth />,
          children: [
            {
              element: <DashboardLayout />,
              children: [
                { path: 'dashboard/me', element: <ProfilePage /> },
                { path: 'dashboard/me/bookmarks', element: <BookmarksPage /> },
                { path: 'dashboard/notifications', element: <NotificationsPage /> },
                { path: 'dashboard/reader/*', element: <ReaderDashboardPage /> },
                {
                  element: <RequireRole roles={['author', 'editor', 'admin']} />,
                  children: [
                    // `/dashboard/author` redirects to the drafts list by sharing
                    // the same element — both URLs are valid entry points.
                    { path: 'dashboard/author', element: <DraftsPage /> },
                    { path: 'dashboard/author/drafts', element: <DraftsPage /> },
                    // New / edit / submissions screens land Day 5+; placeholders
                    // keep "New draft" + row-click navigations from 404-ing in dev.
                    { path: 'dashboard/author/drafts/new', element: <NewDraftPage /> },
                    { path: 'dashboard/author/drafts/:id', element: <EditDraftPage /> },
                    { path: 'dashboard/author/submissions', element: <SubmissionsPage /> },
                  ],
                },
                {
                  element: <RequireRole roles={['editor', 'admin']} />,
                  children: [
                    { path: 'dashboard/editor', element: <EditorDashboardPage /> },
                    { path: 'dashboard/editor/approvals', element: <ApprovalsPage /> },
                    { path: 'dashboard/editor/approvals/:id', element: <ApprovalPreviewPage /> },
                    { path: 'dashboard/editor/comments/pending', element: <PendingCommentsPage /> },
                  ],
                },
                {
                  element: <RequireRole roles={['admin']} />,
                  children: [
                    { path: 'dashboard/admin', element: <AdminLandingPage /> },
                    { path: 'dashboard/admin/articles', element: <AdminArticlesPage /> },
                    { path: 'dashboard/admin/authors', element: <AdminAuthorsPage /> },
                    { path: 'dashboard/admin/editors', element: <AdminEditorsPage /> },
                    { path: 'dashboard/admin/organisations', element: <AdminOrganisationsPage /> },
                    { path: 'dashboard/admin/approvals', element: <AdminApprovalsPage /> },
                    { path: 'dashboard/admin/epapers', element: <AdminEpapersPage /> },
                    { path: 'dashboard/admin/epapers/new', element: <NewEpaperPage /> },
                  ],
                },
              ],
            },
          ],
        },

        { path: 'forbidden', element: <ForbiddenPage /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  {
    // Opt into v7 future behavior now to silence migration warnings and get
    // better defaults. `v7_startTransition` lives on RouterProvider (below).
    future: {
      v7_relativeSplatPath: true,
      v7_fetcherPersist: true,
      v7_normalizeFormMethod: true,
      v7_partialHydration: true,
      v7_skipActionErrorRevalidation: true,
    },
  },
);

export function Router(): JSX.Element {
  return <RouterProvider router={router} future={{ v7_startTransition: true }} />;
}
