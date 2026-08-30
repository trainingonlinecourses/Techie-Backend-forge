import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useProgress } from '../hooks/useProgress.js';
import { FALLBACK_CURRICULUM } from '../fallbackCurriculum.js';
import { SkeletonModulePage } from '../components/Skeleton.jsx';

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

  if (error) return (
    <div className="page">
      <div className="empty-state">
        <div className="icon">⚠️</div>
        <h3>Module not found</h3>
        <p>{error}</p>
        <Link to="/" className="btn ghost" style={{ marginTop: 16 }}>← Back to Academy</Link>
      </div>
    </div>
  );
  if (!detail) return (
    <div className="page">
      <SkeletonModulePage />
    </div>
  );

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
          {done > 0 && done < lessons.length && (
            <>
              <span>·</span>
              <span style={{ color: 'var(--blue)' }}>{Math.round(done / lessons.length * 100)}% complete</span>
            </>
          )}
          {m.docsUrl && (
            <>
              <span>·</span>
              <a href={m.docsUrl} target="_blank" rel="noreferrer">official docs ↗</a>
            </>
          )}
        </div>
      </div>

      <div className="lessongrid">
        {[...lessons].sort((a, b) => a.order - b.order).map((l) => (
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
        <div className="empty-state">
          <div className="icon">📭</div>
          <h3>No lessons loaded yet</h3>
          <p>Lessons load when the Spring Boot backend is connected. Deploy via Render or run locally.</p>
        </div>
      )}
    </div>
  );
}
