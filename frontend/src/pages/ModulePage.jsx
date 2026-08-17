import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useProgress } from '../hooks/useProgress.js';
import { FALLBACK_CURRICULUM } from '../fallbackCurriculum.js';

export default function ModulePage() {
  const { moduleId } = useParams();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const { progress } = useProgress();

  useEffect(() => {
    setDetail(null);
    setError(null);
    api
      .get(`/content/modules/${moduleId}`)
      .then((res) => setDetail(res.data))
      .catch(() => {
        // Static-only mode: the API is unreachable, so render the module
        // metadata from the shared fallback instead of a dead-end error page.
        const fallback = FALLBACK_CURRICULUM.find((m) => m.module.id === moduleId);
        if (fallback) {
          setDetail({ module: fallback.module, lessons: fallback.lessons });
        } else {
          setError('Module not found');
        }
      });
  }, [moduleId]);

  if (error) return <div className="call warn"><div className="ct">⚠ Not found</div><p>{error}</p></div>;
  if (!detail) return <div className="page-loading">Loading module…</div>;

  const { module: m } = detail;
  const lessons = Array.isArray(detail.lessons) ? detail.lessons : [];
  const done = lessons.filter((l) => progress[l.id]).length;

  return (
    <div className="page">
      <div className="crumbs">
        <Link to="/">Academy</Link> <span className="sep">/</span> <span>{m.title}</span>
      </div>
      <div className="pagehead" style={{ borderColor: m.color }}>
        <div className="pnum">{String(m.order).padStart(2, '0')}</div>
        <div className="meta-chips">
          <span className="chip" style={{ color: m.color, borderColor: m.color + '66' }}>{m.tech.join(' · ')}</span>
        </div>
        <h1 className="ptitle">{m.title}</h1>
        <p className="lede">{m.subtitle}</p>
        <div className="statusbar">
          <b>{done}/{lessons.length}</b> lessons completed
          <span>·</span> ≈ {Math.round((m.minutes / 60) * 10) / 10}h
          {m.docsUrl && (
            <>
              <span>·</span>
              <a href={m.docsUrl} target="_blank" rel="noreferrer">official docs ↗</a>
            </>
          )}
        </div>
      </div>

      <div className="lessongrid">
        {lessons.map((l) => (
          <Link key={l.id} to={`/lessons/${l.id}`} className={`lessoncard ${progress[l.id] ? 'done' : ''}`}>
            <span className="lc-num">{progress[l.id] ? '✓' : l.order}</span>
            <div className="lc-body">
              <h3>{l.title}</h3>
              <p>{l.summary}</p>
              <div className="lc-meta">
                <span>⏱ {l.minutes} min</span>
                <span className="tags">{l.topics.slice(0, 3).join(' · ')}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {lessons.length === 0 && (
        <div className="call info">
          <div className="ct">ℹ Lessons load when the backend is connected</div>
          <p>
            The module overview renders from the static fallback, but lesson content comes from the
            Spring Boot API. Host the backend via the <code>render.yaml</code> blueprint or run it
            locally (see the README Deployment section), then refresh.
          </p>
        </div>
      )}
    </div>
  );
}
