import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { errorMessage } from '../api/client';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', displayName: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(form.username, form.password, form.displayName || form.username);
      navigate('/');
    } catch (err) {
      setError(errorMessage(err, 'Registration failed'));
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
        <h1>Create your account</h1>
        <p className="authsub">Track lesson progress, save completions, and unlock the AI tutor.</p>

        {error && <div className="call warn"><div className="ct">⚠ Error</div><p>{error}</p></div>}

        <form onSubmit={submit} className="authform">
          <label>Username
            <input value={form.username} onChange={set('username')} minLength={3} autoComplete="username" required />
          </label>
          <label>Display name
            <input value={form.displayName} onChange={set('displayName')} maxLength={120} required />
          </label>
          <label>Password
            <input type="password" value={form.password} onChange={set('password')} minLength={6} autoComplete="new-password" required />
          </label>
          <button className="btn primary full" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        </form>

        <p className="authfoot">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
