import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext.jsx';
import { useProgress } from '../hooks/useProgress.js';
import Markdown from '../components/Markdown.jsx';

export default function LessonPage() {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { progress, toggle } = useProgress();
  const [lesson, setLesson] = useState(null);
  const [curriculum, setCurriculum] = useState(null);
  const [error, setError] = useState(null);
  const [scrollPct, setScrollPct] = useState(0);
  const [showTop, setShowTop] = useState(false);
  const [activeToc, setActiveToc] = useState(null);
  const [toast, setToast] = useState(null);
  const articleRef = useRef(null);

  useEffect(() => {
    setLesson(null);
    setError(null);
    api.get(`/content/lessons/${lessonId}`).then((res) => setLesson(res.data)).catch((e) => {
      const staticMode = !e.response?.data?.message;
      setError(
        staticMode
          ? 'Lesson content is only available when the Spring Boot backend is connected. Host it via the render.yaml blueprint or run it locally (see the README Deployment section), then refresh.'
          : (e.response?.data?.message || 'Lesson not found')
      );
    });
    api.get('/content/curriculum').then((res) => setCurriculum(res.data)).catch(() => {});
    window.scrollTo(0, 0);
  }, [lessonId]);

  // Reading progress bar + scroll-spy TOC + back-to-top visibility.
  useEffect(() => {
    function onScroll() {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      setScrollPct(max > 0 ? Math.min(100, (el.scrollTop / max) * 100) : 0);
      setShowTop(el.scrollTop > 600);
      const headings = articleRef.current?.querySelectorAll('h2, h3');
      if (headings) {
        let current = null;
        for (const h of headings) {
          if (h.getBoundingClientRect().top <= 96) current = h.id || slug(h.textContent);
        }
        setActiveToc(current);
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [lesson]);

  const toc = useMemo(() => {
    if (!lesson) return [];
    const lines = lesson.body.split('\n');
    const out = [];
    for (const line of lines) {
      const m = /^(#{2,3})\s+(.*)/.exec(line);
      if (m) {
        out.push({ level: m[1].length, text: m[2].replace(/[`*]/g, ''), id: slug(m[2]) });
      }
    }
    return out;
  }, [lesson]);

  const nav = useMemo(() => {
    if (!Array.isArray(curriculum) || !lesson) return { prev: null, next: null };
    const all = curriculum.flatMap((m) => m.lessons);
    const idx = all.findIndex((l) => l.id === lesson.lesson.id);
    return { prev: idx > 0 ? all[idx - 1] : null, next: idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null };
  }, [curriculum, lesson]);

  function flash(msg) {
    setToast(msg);
    window.clearTimeout(flash._t);
    flash._t = window.setTimeout(() => setToast(null), 2000);
  }

  async function onToggle() {
    await toggle(l?.id, completed);
    flash(completed ? 'Marked as unread' : '✓ Lesson marked complete');
  }

  async function markAndContinue() {
    if (!completed && user) {
      await toggle(l.id, false);
      flash('✓ Lesson marked complete');
    }
    if (nav.next) navigate(`/lessons/${nav.next.id}`);
  }

  if (error) return <div className="call warn"><div className="ct">⚠ Lesson unavailable</div><p>{error}</p></div>;
  if (!lesson) return <div className="page-loading">Loading lesson…</div>;

  const l = lesson.lesson;
  const completed = !!progress[l.id];

  return (
    <div className="page lesson">
      <div className="readbar" style={{ width: `${scrollPct}%` }} />
      <div className="crumbs">
        <Link to="/">Academy</Link> <span className="sep">/</span>
        <Link to={`/modules/${l.moduleId}`}>{l.moduleTitle}</Link> <span className="sep">/</span>
        <span>{l.title}</span>
      </div>

      <div className="pagehead">
        {l.capstone && <div className="capbadge">CAPSTONE PROJECT</div>}
        <div className="meta-chips">
          <span className="chip amber">LESSON {l.order}</span>
          <span className="chip blue">⏱ {l.minutes} min</span>
          {l.topics.slice(0, 5).map((t) => (
            <span key={t} className="chip">{t}</span>
          ))}
        </div>
        <h1 className="ptitle">{l.title}</h1>
        <p className="lede">{l.summary}</p>
        <div className="head-actions">
          {user ? (
            <>
              <button className={`btn ${completed ? 'donebtn' : 'primary'}`} onClick={onToggle}>
                {completed ? '✓ Completed — mark as unread' : 'Mark lesson complete'}
              </button>
              {nav.next && (
                <button className="btn ghost" onClick={markAndContinue}>
                  {completed ? 'Next lesson →' : 'Mark complete & continue →'}
                </button>
              )}
            </>
          ) : (
            <Link to="/login" className="btn primary">Sign in to track progress</Link>
          )}
        </div>
      </div>

      <div className="lesson-layout">
        <article className="lesson-body" ref={articleRef}>
          <Markdown>{lesson.body}</Markdown>

          <div className="docsbox">
            <div className="db-title">⚑ OFFICIAL DOCUMENTATION</div>
            <p>Read the authoritative reference for this lesson:</p>
            <ul>
              {lesson.docs.map((d) => (
                <li key={d}>
                  <a href={d} target="_blank" rel="noreferrer">
                    {d.replace(/^https?:\/\//, '').replace(/\/$/, '')} ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {user && (
            <div className="lesson-complete-cta">
              {nav.next ? (
                <button className="btn primary" onClick={markAndContinue}>
                  {completed ? `Continue to next lesson →` : `Mark complete & continue →`}
                </button>
              ) : (
                <div className="call ok">
                  <div className="ct">🏁 You finished the curriculum!</div>
                  <p>That was the last lesson. Review any module from the sidebar or ask the AI tutor about anything you missed.</p>
                </div>
              )}
            </div>
          )}

          <div className="pn">
            {nav.prev ? (
              <Link to={`/lessons/${nav.prev.id}`} className="prev">
                <span className="dir">← PREVIOUS</span>
                <span className="nm">{nav.prev.title}</span>
              </Link>
            ) : <span />}
            {nav.next ? (
              <Link to={`/lessons/${nav.next.id}`} className="next">
                <span className="dir">NEXT →</span>
                <span className="nm">{nav.next.title}</span>
              </Link>
            ) : null}
          </div>
        </article>

        {toc.length > 0 && (
          <aside className="toc">
            <div className="toc-title">ON THIS PAGE</div>
            {toc.map((h) => (
              <a
                key={h.id}
                href={`#${h.id}`}
                className={activeToc === h.id ? 'active' : ''}
                style={{ paddingLeft: h.level === 3 ? 24 : 12 }}
              >
                {h.text}
              </a>
            ))}
          </aside>
        )}
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}
      {showTop && (
        <button className="totop" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Back to top">↑</button>
      )}
    </div>
  );
}

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
}
