import { useAuthBootstrap } from './lib/use-auth-bootstrap';
import { useQueryClearOnLogout } from './lib/use-query-clear-on-logout';
import { Router } from './router';

/**
 * App — entry component. Kicks off one-shot auth hydration (calls `/auth/me`
 * so a refresh-cookie session survives a page reload) and wires the
 * session-end → cache-clear effect, then hands off to the router.
 * `<AppLayout>` (header, footer, drawer) wraps each route from inside
 * `router.tsx`.
 */
function App(): JSX.Element {
  useAuthBootstrap();
  useQueryClearOnLogout();
  return <Router />;
}

export default App;
