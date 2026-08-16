import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext.jsx';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [stats, setStats] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    api
      .get('/content/stats')
      .then((res) => setStats(res.data))
      .catch(() => {});
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

  return (
    <header>
      <Link to="/" className="logo">
        <div className="mark">&gt;_</div>
        <div>
          <div className="name">
            BACKEND<b>FORGE</b>
          </div>
          <span className="tag">SPRING ACADEMY · END TO END</span>
        </div>
      </Link>

      <form className="searchwrap" onSubmit={submitSearch}>
        <span className="ic">⌕</span>
        <input
          id="nav-search"
          type="text"
          placeholder="search 66 lessons — jwt, outbox, RAG, Resilience4j…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <kbd>/</kbd>
      </form>

      {stats && (
        <Link to="/" className="progresspill" title={`${stats.completedLessons}/${stats.totalLessons} lessons completed`}>
          <svg className="ring" viewBox="0 0 30 30">
            <circle className="bgc" cx="15" cy="15" r="12" />
            <circle className="fgc" cx="15" cy="15" r="12" style={{ strokeDashoffset: ring }} />
          </svg>
          <span className="txt">
            <b>{stats.completedLessons}</b>/{stats.totalLessons} done
          </span>
        </Link>
      )}

      <nav className="navlinks">
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
              <Link to="/chat" onClick={() => setMenuOpen(false)}>AI Tutor</Link>
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
