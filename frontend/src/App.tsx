import { useAuthBootstrap } from './lib/use-auth-bootstrap';
import { Router } from './router';

/**
 * App — entry component. Kicks off one-shot auth hydration (calls `/auth/me`
 * so a refresh-cookie session survives a page reload), then hands off to the
 * router. `<AppLayout>` (header, footer, drawer) wraps each route from
 * inside `router.tsx`.
 */
function App(): JSX.Element {
  useAuthBootstrap();
  return <Router />;
}

export default App;
