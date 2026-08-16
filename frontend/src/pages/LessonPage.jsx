import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext.jsx';
import { useProgress } from '../hooks/useProgress.js';
import Markdown from '../components/Markdown.jsx';

export default function LessonPage() {
  const { lessonId } = useParams();
  const { user } = useAuth();
  const { progress, toggle } = useProgress();
  const [lesson, setLesson] = useState(null);
  const [curriculum, setCurriculum] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLesson(null);
    setError(null);
    api.get(`/content/lessons/${lessonId}`).then((res) => setLesson(res.data)).catch((e) => {
      setError(e.response?.data?.message || 'Lesson not found');
    });
    api.get('/content/curriculum').then((res) => setCurriculum(res.data)).catch(() => {});
    window.scrollTo(0, 0);
  }, [lessonId]);

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
    if (!curriculum || !lesson) return { prev: null, next: null };
    const all = curriculum.flatMap((m) => m.lessons);
    const idx = all.findIndex((l) => l.id === lesson.lesson.id);
    return { prev: idx > 0 ? all[idx - 1] : null, next: idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null };
  }, [curriculum, lesson]);

  if (error) return <div className="call warn"><div className="ct">⚠ Not found</div><p>{error}</p></div>;
  if (!lesson) return <div className="page-loading">Loading lesson…</div>;

  const l = lesson.lesson;
  const completed = !!progress[l.id];

  return (
    <div className="page lesson">
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
            <button className={`btn ${completed ? 'donebtn' : 'primary'}`} onClick={() => toggle(l.id, completed)}>
              {completed ? '✓ Completed — mark as unread' : 'Mark lesson complete'}
            </button>
          ) : (
            <Link to="/login" className="btn primary">Sign in to track progress</Link>
          )}
        </div>
      </div>

      <div className="lesson-layout">
        <article className="lesson-body">
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
              <a key={h.id} href={`#${h.id}`} style={{ paddingLeft: h.level === 3 ? 24 : 12 }}>{h.text}</a>
            ))}
          </aside>
        )}
      </div>
    </div>
  );
}

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
}
