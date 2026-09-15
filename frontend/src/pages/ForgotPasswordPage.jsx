import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * Forgot-password flow (security-question based — this deployment has no mail
 * provider). Three steps:
 *   1. username → fetch the armed question (or a "no question" hint)
 *   2. answer the question → single-use reset token (held in memory only)
 *   3. new password → signed straight in with a fresh session token
 *
 * Anti-abuse is server-side: 5 wrong answers freeze recovery for that account
 * for 15 minutes, and responses are shaped identically for known/unknown
 * usernames so this page can't be used to enumerate accounts.
 */
export default function ForgotPasswordPage() {
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState('');
  const [question, setQuestion] = useState(null);
  const [answer, setAnswer] = useState('');
  const [token, setToken] = useState(null); // never persisted — memory only
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const answerRef = useRef(null);

  // Step 1: look up the armed question.
  async function lookup(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/auth/recover/question?username=${encodeURIComponent(username.trim())}`);
      const data = await res.json();
      if (data.armed && data.question) {
        setQuestion(data.question);
        setStep(2);
      } else {
        setError(
          'No recovery question is set up for that account. If this is your account, ' +
          'sign in once and add one under Settings — or ask an admin for help.'
        );
      }
    } catch {
      setError('Could not reach the server. If the site just woke up, wait a moment and try again.');
    } finally {
      setBusy(false);
    }
  }

  // Step 2: knowledge check → reset token.
  async function verify(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/recover/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), answer }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.resetToken) {
        setToken(data.resetToken);
        setStep(3);
      } else {
        setError(data.message || 'Could not verify the answer.');
      }
    } catch {
      setError('Could not reach the server. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  // Step 3: swap the password.
  async function reset(e) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/recover/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetToken: token, newPassword }),
      });
      if (res.ok) {
        const data = await res.json();
        // Signed straight in — persist the fresh session like a normal login.
        localStorage.setItem('backendforge_token', data.token);
        window.location.href = '/';
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message || 'Reset failed — the request may have expired. Start again.');
      setStep(1); // fail closed: token is dead, restart the flow
    } catch {
      setError('Could not reach the server. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setStep(1);
    setQuestion(null);
    setAnswer('');
    setToken(null);
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setNotice(null);
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
        <h1>Reset your password</h1>
        <p className="authsub">Prove it's you with your security question, then pick a new password.</p>

        {/* Progress steps */}
        <div className="recsteps" aria-label={`Step ${step} of 3`}>
          {['Account', 'Answer', 'New password'].map((label, i) => (
            <span key={label} className={`recstep ${step > i + 1 ? 'done' : step === i + 1 ? 'active' : ''}`}>
              <b>{i + 1}</b> {label}
            </span>
          ))}
        </div>

        {error && <div className="call warn"><div className="ct">⚠ Error</div><p>{error}</p></div>}
        {notice && <div className="call info"><div className="ct">ℹ Info</div><p>{notice}</p></div>}

        {step === 1 && (
          <form onSubmit={lookup} className="authform">
            <label>Username
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </label>
            <button className="btn primary full" disabled={busy}>
              {busy ? 'Looking…' : 'Find my question'}
            </button>
            <p className="authfoot">
              Remembered it after all? <Link to="/login">Sign in</Link>
            </p>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={verify} className="authform">
            <div className="recquestion">
              <span className="recq-label">Security question</span>
              <strong>{question}</strong>
            </div>
            <label>Your answer
              <input
                ref={answerRef}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                autoComplete="off"
                autoFocus
                required
              />
            </label>
            <button className="btn primary full" disabled={busy}>
              {busy ? 'Checking…' : 'Verify answer'}
            </button>
            <p className="authfoot">
              Five wrong answers lock recovery for this account for 15 minutes.
            </p>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={reset} className="authform">
            <label>New password
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                autoComplete="new-password"
                autoFocus
                required
              />
            </label>
            <label>Confirm new password
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={6}
                autoComplete="new-password"
                required
              />
            </label>
            <button className="btn primary full" disabled={busy}>
              {busy ? 'Saving…' : 'Set new password'}
            </button>
            <p className="authfoot">
              <button type="button" className="linklike" onClick={restart}>Start over</button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
