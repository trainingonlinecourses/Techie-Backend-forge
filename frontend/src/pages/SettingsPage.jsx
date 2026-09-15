import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Account settings: change password (requires the current one) and manage the
 * security question that powers forgot-password recovery. Recovery is opt-in:
 * an account without a question simply shows the "not set up" state with a
 * clear call to action.
 */
export default function SettingsPage() {
  const { user, loading } = useAuth();

  const [armed, setArmed] = useState(null); // null = loading
  const [currentQuestion, setCurrentQuestion] = useState('');

  // change-password form
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwMsg, setPwMsg] = useState(null); // { ok, text }

  // recovery form
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [recMsg, setRecMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.get('/auth/recovery-question')
      .then((res) => {
        setArmed(!!res.data.armed);
        setCurrentQuestion(res.data.question || '');
        setQuestion(res.data.question || '');
      })
      .catch(() => setArmed(false));
  }, [user]);

  async function changePassword(e) {
    e.preventDefault();
    if (newPw !== confirmPw) {
      setPwMsg({ ok: false, text: 'The two new passwords do not match.' });
      return;
    }
    setBusy(true);
    setPwMsg(null);
    try {
      await api.post('/auth/change-password', {
        currentPassword: currentPw,
        newPassword: newPw,
      });
      setPwMsg({ ok: true, text: 'Password changed.' });
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err) {
      setPwMsg({ ok: false, text: errorMessage(err, 'Could not change the password.') });
    } finally {
      setBusy(false);
    }
  }

  async function saveQuestion(e) {
    e.preventDefault();
    setBusy(true);
    setRecMsg(null);
    try {
      await api.put('/auth/recovery-question', { question, answer });
      setArmed(true);
      setCurrentQuestion(question);
      setRecMsg({ ok: true, text: 'Recovery question saved — your account can now be recovered.' });
      setAnswer('');
    } catch (err) {
      setRecMsg({ ok: false, text: errorMessage(err, 'Could not save the question.') });
    } finally {
      setBusy(false);
    }
  }

  async function clearQuestion() {
    if (!window.confirm('Remove your recovery question? You will not be able to reset a forgotten password without it.')) return;
    setBusy(true);
    setRecMsg(null);
    try {
      await api.delete('/auth/recovery-question');
      setArmed(false);
      setCurrentQuestion('');
      setQuestion('');
      setRecMsg({ ok: false, text: 'Recovery question removed.' });
    } catch (err) {
      setRecMsg({ ok: false, text: errorMessage(err, 'Could not remove the question.') });
    } finally {
      setBusy(false);
    }
  }

  if (!loading && !user) {
    return (
      <div className="page">
        <div className="call warn">
          <div className="ct">🔒 Sign in required</div>
          <p>Sign in to manage your account settings.</p>
          <p><Link to="/login">Sign in</Link> · <Link to="/">Back to the academy</Link></p>
        </div>
      </div>
    );
  }

  return (
    <div className="page settings">
      <h1 className="pagetitle">⚙ Account settings</h1>
      <p className="pagesub">
        Signed in as <b>{user?.displayName}</b> (@{user?.username})
      </p>

      {/* --- Change password --- */}
      <section className="settings-card">
        <h2>Change password</h2>
        <p className="settings-sub">You'll need your current password — a stolen session alone can't take over the account.</p>
        {pwMsg && (
          <div className={`call ${pwMsg.ok ? 'info' : 'warn'}`}>
            <div className="ct">{pwMsg.ok ? '✓ Done' : '⚠ Error'}</div>
            <p>{pwMsg.text}</p>
          </div>
        )}
        <form onSubmit={changePassword} className="authform">
          <label>Current password
            <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)}
                   autoComplete="current-password" required />
          </label>
          <label>New password
            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)}
                   minLength={6} autoComplete="new-password" required />
          </label>
          <label>Confirm new password
            <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
                   minLength={6} autoComplete="new-password" required />
          </label>
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
        </form>
      </section>

      {/* --- Recovery question --- */}
      <section className="settings-card">
        <h2>Security question <span className={`recbadge ${armed ? 'on' : 'off'}`}>{armed ? '✓ set up' : 'not set up'}</span></h2>
        <p className="settings-sub">
          This is the only way to recover a forgotten password — there's no email on the account.
          {armed && <> Current question: <b>{currentQuestion}</b></>}
        </p>
        {recMsg && (
          <div className={`call ${recMsg.ok ? 'info' : 'warn'}`}>
            <div className="ct">{recMsg.ok ? '✓ Saved' : '⚠ Error'}</div>
            <p>{recMsg.text}</p>
          </div>
        )}
        {armed === false && (
          <div className="call warn">
            <div className="ct">⚠ Recommended</div>
            <p>Set this up now — if you forget your password later, this question is the only way back in.
              {' '}<Link to="/forgot-password">The reset page</Link> only works for accounts with a question.</p>
          </div>
        )}
        <form onSubmit={saveQuestion} className="authform">
          <label>Security question
            <input value={question} onChange={(e) => setQuestion(e.target.value)}
                   minLength={5} maxLength={200}
                   placeholder="e.g. What was my first pet's name?" required />
          </label>
          <label>Answer
            <input value={answer} onChange={(e) => setAnswer(e.target.value)}
                   maxLength={200}
                   placeholder={armed ? 'Enter a new answer to replace the old one' : "Your answer — typed loosely (case and punctuation don't matter)"}
                   required />
          </label>
          <div className="settings-actions">
            <button className="btn primary" disabled={busy}>
              {armed ? 'Update question' : 'Set up recovery'}
            </button>
            {armed && (
              <button type="button" className="btn ghost" onClick={clearQuestion} disabled={busy}>
                Remove question
              </button>
            )}
          </div>
          <p className="authfoot">
            The answer is stored as a one-way hash — even the database doesn't know it.
            Reset page: <code className="inline">/forgot-password</code> (also linked from the sign-in page).
          </p>
        </form>
      </section>
    </div>
  );
}
