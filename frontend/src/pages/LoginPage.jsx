import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { errorMessage } from '../api/client';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      navigate('/');
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

        <form onSubmit={submit} className="authform">
          <label>Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </label>
          <label>Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
          <button className="btn primary full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>

        <p className="authfoot">
          New here? <Link to="/register">Create an account</Link>
        </p>
        <div className="demo">
          <b>Demo accounts</b>
          <span><code className="inline">admin / admin123</code> — full access</span>
          <span><code className="inline">learner / learner123</code> — standard user</span>
        </div>
      </div>
    </div>
  );
}
