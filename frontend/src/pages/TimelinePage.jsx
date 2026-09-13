import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, cached } from '../api/client';
import { useAuth } from '../context/AuthContext.jsx';
import { useProgress } from '../hooks/useProgress.js';
import { FALLBACK_CURRICULUM } from '../fallbackCurriculum.js';
import { SkeletonCard } from '../components/Skeleton.jsx';
import { RELEASES, resolveTimeline } from '../lib/javaReleases.js';

export default function TimelinePage() {
  const { user } = useAuth();
  const { progress } = useProgress();
  const [curriculum, setCurriculum] = useState(null);
  const railRef = useRef(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  // Same stale-while-revalidate pattern as Home: cached instantly, refreshed quietly.
  useEffect(() => {
    const cachedCurr = cached.get('curriculum');
    if (cachedCurr) setCurriculum(Array.isArray(cachedCurr) ? cachedCurr : FALLBACK_CURRICULUM);
    api.get('/content/curriculum')
      .then((res) => {
        if (Array.isArray(res.data)) { setCurriculum(res.data); cached.set('curriculum', res.data); }
        else if (!cachedCurr) setCurriculum(FALLBACK_CURRICULUM);
      })
      .catch(() => { if (!cachedCurr) setCurriculum(FALLBACK_CURRICULUM); });
  }, [user]);

  const rows = useMemo(() => resolveTimeline(curriculum, progress), [curriculum, progress]);
  const anyMissing = rows.some((r) => !r.exists);

  // Enable/disable the scroll arrows as the rail moves.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const update = () => setCanScroll({
      left: rail.scrollLeft > 4,
      right: rail.scrollLeft < rail.scrollWidth - rail.clientWidth - 4,
    });
    update();
    rail.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { rail.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [curriculum]);

  const nudge = (dir) => {
    const rail = railRef.current;
    if (rail) rail.scrollBy({ left: dir * Math.max(rail.clientWidth * 0.7, 300), behavior: 'smooth' });
  };

  const totalLessons = rows.reduce((n, r) => n + r.lessonCount, 0);
  const totalDone = rows.reduce((n, r) => n + r.completed, 0);

  return (
    <div className="timeline-page">
      <div className="tl-head">
        <div>
          <h1>Java release timeline <span className="tl-range">1.0 → 26</span></h1>
          <p className="lede">
            Thirty years of Java in one strip — every release from 1996 to 2026, the features that
            defined it, and the module that teaches it. LTS releases are marked
            with <span className="tl-lts-badge">LTS</span>.
          </p>
        </div>
        <div className="tl-arrows">
          <button className="tl-arrow" onClick={() => nudge(-1)} disabled={!canScroll.left} aria-label="Scroll timeline left">←</button>
          <button className="tl-arrow" onClick={() => nudge(1)} disabled={!canScroll.right} aria-label="Scroll timeline right">→</button>
        </div>
      </div>

      <div className="tl-meta">
        <span>{RELEASES.length} releases</span>
        <span>·</span>
        <span>{totalDone}/{totalLessons} release lessons completed</span>
        <span>·</span>
        <span>{rows.filter((r) => r.lts).length} LTS releases</span>
      </div>

      {!curriculum && (
        <div className="modgrid">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {anyMissing && curriculum && (
        <div className="tl-note">Some release modules aren't in this curriculum view yet — those cards link to the module list.</div>
      )}

      {curriculum && (
        <div className="tl-rail" ref={railRef} tabIndex={0} aria-label="Java releases, scroll horizontally">
          <div className="tl-track">
            {rows.map((r, i) => {
              const pct = r.lessonCount > 0 ? Math.round((r.completed / r.lessonCount) * 100) : 0;
              const prevYear = i > 0 ? rows[i - 1].year : null;
              return (
                <div className="tl-item" key={r.v}>
                  {prevYear !== r.year && <div className="tl-year">{r.year}</div>}
                  <div className={`tl-node ${r.lts ? 'lts' : ''}`}>
                    <span className="tl-dot" style={{ background: r.color }} />
                    <span className="tl-v">{r.v}</span>
                    {r.lts && <span className="tl-lts-badge">LTS</span>}
                  </div>
                  <Link to={r.exists ? `/modules/${r.moduleId}` : '/modules'} className="tl-card" style={{ '--tl-color': r.color }}>
                    <div className="tl-card-title">{r.title}</div>
                    <ul className="tl-feats">
                      {r.features.map((f) => <li key={f}>{f}</li>)}
                    </ul>
                    {r.exists ? (
                      <div className="tl-card-foot">
                        <span>{r.lessonCount} lessons</span>
                        <span className={`tl-state ${pct === 100 ? 'done' : pct > 0 ? 'progress' : ''}`}>
                          {pct === 100 ? '✓ complete' : pct > 0 ? `${pct}% done` : 'open module →'}
                        </span>
                      </div>
                    ) : (
                      <div className="tl-card-foot"><span>module coming soon</span></div>
                    )}
                    {r.exists && r.lessonCount > 0 && (
                      <div className="tl-bar"><div className="tl-bar-fill" style={{ width: `${pct}%`, background: r.color }} /></div>
                    )}
                  </Link>
                </div>
              );
            })}
            <div className="tl-endcap" aria-hidden="true">→</div>
          </div>
        </div>
      )}

      <div className="tl-legend">
        <span><span className="tl-dot" style={{ background: '#f5a623' }} /> release</span>
        <span><span className="tl-lts-badge">LTS</span> long-term support</span>
        <span><span className="tl-dot done" /> progress bar = your completion</span>
      </div>
    </div>
  );
}
