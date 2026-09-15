import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { errorMessage } from '../api/client';

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Where the learner came from (e.g. a protected page that bounced them here).
  // After sign-in we return there instead of always dropping them at '/'.
  const from = location.state?.from || '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Already signed in? Then this page has nothing to do — sending the learner
  // back to the app (instead of showing a second login form) is what makes
  // browser Back/Forward through /login harmless.
  if (!loading && user) {
    return <Navigate to={from} replace />;
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Login failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="authwrap">
      <div className="authcard">
        <div className="logo">
          <div className="mark">&gt;_</div>
          <div>
            <div className="name">BACKEND<b>FORGE</b></div>
          </div>
        </div>
        <h1>Welcome back</h1>
        <p className="authsub">Sign in to track progress and chat with the AI tutor.</p>

        {error && <div className="call warn"><div className="ct">⚠ Error</div><p>{error}</p></div>}

        {/* Empty, controlled fields: the previously-prefilled 'admin' username made
            every back/forward revisit fail with "Invalid username or password". */}
        <form onSubmit={submit} className="authform">
          <label>Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
          </label>
          <label>Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          <button className="btn primary full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>

        <p className="authfoot">
          New here? <Link to="/register">Create an account</Link> · <Link to="/forgot-password">Forgot password?</Link>
        </p>
        <div className="demo">
          <b>Demo accounts</b>
          <span><code className="inline">learner / learner123</code> — standard user</span>
          <span><code className="inline">admin / admin123</code> — full access</span>
        </div>
      </div>
    </div>
  );
}
