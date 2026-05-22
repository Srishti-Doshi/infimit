import { lazy, Suspense } from 'react';
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router-dom';

import { AppLayout } from '@/components/layout';
import { Spinner } from '@/components/ui';

import NotFoundPage from '@/pages/not-found';

// Lazy-loaded route chunks — each becomes its own bundle so the entry chunk
// stays small. Shared `PlaceholderPage` is de-duplicated by Rollup.
const HomePage = lazy(() => import('@/pages/home'));
const CategoryPage = lazy(() => import('@/pages/category'));
const ArticlePage = lazy(() => import('@/pages/article'));
const SearchPage = lazy(() => import('@/pages/search'));
const EpaperPage = lazy(() => import('@/pages/epaper'));

const LoginPage = lazy(() => import('@/pages/auth/login'));
const RegisterPage = lazy(() => import('@/pages/auth/register'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/forgot-password'));

const ReaderDashboardPage = lazy(() => import('@/pages/dashboard/reader'));
const AuthorDashboardPage = lazy(() => import('@/pages/dashboard/author'));
const EditorDashboardPage = lazy(() => import('@/pages/dashboard/editor'));
const AdminDashboardPage = lazy(() => import('@/pages/dashboard/admin'));

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

        { path: 'auth/login', element: <LoginPage /> },
        { path: 'auth/register', element: <RegisterPage /> },
        { path: 'auth/forgot-password', element: <ForgotPasswordPage /> },

        { path: 'dashboard/reader/*', element: <ReaderDashboardPage /> },
        { path: 'dashboard/author/*', element: <AuthorDashboardPage /> },
        { path: 'dashboard/editor/*', element: <EditorDashboardPage /> },
        { path: 'dashboard/admin/*', element: <AdminDashboardPage /> },

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
