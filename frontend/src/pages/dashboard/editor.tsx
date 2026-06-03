import { Navigate } from 'react-router-dom';

/**
 * `/dashboard/editor` — landing redirect.
 *
 * Editors don't really have a "home" page distinct from their workflow —
 * `/approvals` IS the landing. Keeping the explicit redirect (vs. mounting
 * `<ApprovalsPage>` here directly) means the URL the user sees matches the
 * surface they're on, which makes nav highlighting + analytics cleaner.
 *
 * Future polish: a real dashboard with counters (pending approvals,
 * pending comments) — punted to Subphase 5 along with the rest of the
 * dashboard chrome work.
 */
export default function EditorDashboardPage(): JSX.Element {
  return <Navigate to="/dashboard/editor/approvals" replace />;
}
