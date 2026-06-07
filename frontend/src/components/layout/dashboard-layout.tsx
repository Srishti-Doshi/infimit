import { Outlet } from 'react-router-dom';

import { DashboardSidebar } from './dashboard-sidebar';

/**
 * DashboardLayout — wraps all `/dashboard/*` routes with the persistent
 * left-rail `DashboardSidebar` (lg+) alongside the outlet'd page content.
 *
 * On mobile the sidebar is hidden; users navigate via the existing
 * hamburger drawer `Sidebar` (which is refactored separately to read the
 * same role-aware nav config from `useRoleNav`).
 *
 * `min-w-0` on the content column prevents long children (wide tables,
 * code blocks, etc.) from blowing out the flex layout when their
 * min-content width exceeds the available column width.
 */
export function DashboardLayout(): JSX.Element {
  return (
    <div className="flex w-full">
      <DashboardSidebar />
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
