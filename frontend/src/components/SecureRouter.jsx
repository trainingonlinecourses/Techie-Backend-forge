import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Route guard for signed-in-only pages. The two details that fix the
 * "back/forward then login broke" report:
 *
 * 1. While auth is hydrating from localStorage we WAIT instead of bouncing to
 *    /login — previously a signed-in user hitting Back onto a protected page
 *    could be redirected before their token was restored.
 * 2. The attempted location is stashed in router state ({ from }), so after
 *    signing in the learner returns to the exact page they were on — not the
 *    home page.
 */
export default function SecureRouter({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="page-loading">Loading…</div>;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return children;
}
