import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, cached } from '../api/client';
import { useAuth } from '../context/AuthContext.jsx';
import { useProgress } from '../hooks/useProgress.js';
import { recommendBand, bandCounts, BAND_COLORS, BAND_LABEL } from '../lib/bands.js';
import { FALLBACK_CURRICULUM } from '../fallbackCurriculum.js';

export default function Navbar({ onMenu, drawerOpen }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [stats, setStats] = useState(null);
  // The compact band bar mirrors the home page's recommendation: which band
  // should the learner be in, and how far through it they are.
  const { progress, ready: progressReady } = useProgress();
  const [curriculum, setCurriculum] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('bf-theme') || 'dark');
  const menuRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('bf-theme', theme);
  }, [theme]);

  useEffect(() => {
    api
      .get('/content/stats')
      .then((res) => setStats(res.data))
      .catch(() => {});
    const cachedCurr = cached.get('curriculum');
    if (cachedCurr && Array.isArray(cachedCurr)) setCurriculum(cachedCurr);
    api
      .get('/content/curriculum')
      .then((res) => {
        if (Array.isArray(res.data)) {
          setCurriculum(res.data);
          cached.set('curriculum', res.data);
        } else if (!cachedCurr) {
          setCurriculum(FALLBACK_CURRICULUM);
        }
      })
      .catch(() => { if (!cachedCurr) setCurriculum(FALLBACK_CURRICULUM); });
  }, [user]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        document.getElementById('nav-search')?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    function onClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function submitSearch(e) {
    e.preventDefault();
    navigate(`/search?q=${encodeURIComponent(query)}`);
  }

  const pct = stats && stats.totalLessons > 0 ? Math.round((stats.completedLessons / stats.totalLessons) * 100) : 0;
  const ring = 75.4 - (75.4 * pct) / 100;

  // Recommended band + its counts, shared with the hero card via lib/bands.js.
  const recBand = useMemo(() => recommendBand(curriculum, progress), [curriculum, progress]);
  const levelStats = useMemo(() => bandCounts(curriculum, progress), [curriculum, progress]);
  const bandBar = user && progressReady && recBand && levelStats[recBand]
    ? { band: recBand, ...levelStats[recBand] }
    : null;
  const bandPct = bandBar && bandBar.total > 0 ? Math.round((bandBar.done / bandBar.total) * 100) : 0;

  return (
    <header>
      <button className="hambtn" onClick={onMenu} aria-label="Toggle curriculum menu" aria-expanded={!!drawerOpen}>
        {drawerOpen ? '✕' : '☰'}
      </button>

      <Link to="/" className="logo">
        <div className="mark">&gt;_</div>
        <div>
          <div className="name">
            BACKEND<b>FORGE</b>
          </div>
          <span className="tag">SPRING ACADEMY · END TO END</span>
        </div>
      </Link>

      <button
        className="themebtn"
        onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        title="Toggle light / dark theme"
        aria-label="Toggle color theme"
      >
        {theme === 'dark' ? '☀' : '🌙'}
      </button>

      <form className="searchwrap" onSubmit={submitSearch}>
        <span className="ic">⌕</span>
        <input
          id="nav-search"
          type="text"
          placeholder="search lessons — jwt, JWT, outbox, saga, k8s, RAG…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <kbd>/</kbd>
      </form>

      {stats && (
        <Link
          to="/"
          className="progresspill"
          title={`${stats.completedLessons}/${stats.totalLessons} lessons completed${bandBar ? ` · ${BAND_LABEL[bandBar.band]} ${bandBar.done}/${bandBar.total} (${bandPct}%)` : ''}`}
        >
          <svg className="ring" viewBox="0 0 30 30">
            <circle className="bgc" cx="15" cy="15" r="12" />
            <circle className="fgc" cx="15" cy="15" r="12" style={{ strokeDashoffset: ring }} />
          </svg>
          <span className="txt">
            <b>{stats.completedLessons}</b>/{stats.totalLessons} done
          </span>
          {bandBar && (
            <span
              className="bandbar"
              role="progressbar"
              aria-valuenow={bandPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${BAND_LABEL[bandBar.band]}: ${bandBar.done} of ${bandBar.total} lessons completed`}
              title={`${BAND_LABEL[bandBar.band]} — ${bandBar.done}/${bandBar.total} (${bandPct}%)`}
            >
              <span
                className="bandbar-fill"
                style={{ width: `${bandPct}%`, background: BAND_COLORS[bandBar.band] }}
              />
            </span>
          )}
        </Link>
      )}

      <nav className="navlinks">
        <Link to="/timeline">Timeline</Link>
        <Link to="/docs">Docs</Link>
        <Link to="/chat" className="chatlink">
          <span className="pulse" /> AI Tutor
        </Link>
      </nav>

      {user ? (
        <div className="userchip" ref={menuRef}>
          <button className="userbtn" onClick={() => setMenuOpen((v) => !v)}>
            <span className="avatar">{user.displayName.charAt(0).toUpperCase()}</span>
            <span className="uname">{user.displayName}</span>
            <span className="caret">▾</span>
          </button>
          {menuOpen && (
            <div className="usermenu">
              <div className="um-head">
                <b>{user.displayName}</b>
                <span>@{user.username} · {user.role}</span>
              </div>
              <Link to="/" onClick={() => setMenuOpen(false)}>Dashboard</Link>
              <Link to="/progress" onClick={() => setMenuOpen(false)}>📊 My Progress</Link>
              <Link to="/settings" onClick={() => setMenuOpen(false)}>⚙ Account settings</Link>
              <Link to="/certificates" onClick={() => setMenuOpen(false)}>🏆 Certificates</Link>
              <Link to="/chat" onClick={() => setMenuOpen(false)}>✦ AI Tutor</Link>
              {user.role === 'ADMIN' && (
                <>
                  <Link to="/admin/reorder" onClick={() => setMenuOpen(false)}>🔀 Reorder Lessons</Link>
                  <Link to="/admin/analytics" onClick={() => setMenuOpen(false)}>🧪 A/B Analytics</Link>
                </>
              )}
              <button
                onClick={() => {
                  logout();
                  setMenuOpen(false);
                  navigate('/');
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="authbtns">
          <Link to="/login" className="btn ghost small">Sign in</Link>
          <Link to="/register" className="btn primary small">Get started</Link>
        </div>
      )}
    </header>
  );
}
