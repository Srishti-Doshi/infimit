import { Router } from './router';

/**
 * App — entry component. From Subphase 1 onward it's just the router;
 * `<AppLayout>` (with header, footer, and drawer) wraps each route from
 * inside `router.tsx`.
 */
function App(): JSX.Element {
  return <Router />;
}

export default App;
