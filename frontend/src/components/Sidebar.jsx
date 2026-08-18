import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { FALLBACK_CURRICULUM } from '../fallbackCurriculum.js';

export default function Sidebar({ progress }) {
  const [curriculum, setCurriculum] = useState(null);
  const location = useLocation();

  useEffect(() => {
    api
      .get('/content/curriculum')
      .then((res) => setCurriculum(Array.isArray(res.data) ? res.data : FALLBACK_CURRICULUM))
      .catch(() => setCurriculum(FALLBACK_CURRICULUM));
  }, []);

  if (!curriculum) return <aside className="sidebar">Loading curriculum…</aside>;

  const current = location.pathname.startsWith('/lessons/')
    ? location.pathname.split('/')[2]
    : location.pathname.startsWith('/modules/')
      ? location.pathname.split('/')[2]
      : null;

  return (
    <aside className="sidebar">
      <div className="navgroup">CURRICULUM</div>
      {curriculum.map((m) => {
        const active = current === m.module.id || current?.startsWith(m.module.id);
        const doneCount = m.lessons.filter((l) => progress?.[l.id]).length;
        return (
          <div className="modgroup" key={m.module.id}>
            <Link
              to={`/modules/${m.module.id}`}
              className={`modlink ${active ? 'active' : ''}`}
              style={{ '--modcolor': m.module.color }}
            >
              <span className="modnum">{m.module.order}</span>
              <span className="modttl">{m.module.title}</span>
              <span className="modcount">
                {doneCount}/{m.lessons.length}
              </span>
            </Link>
            <div className="modlessons">
              {m.lessons.map((l) => (
                <Link
                  key={l.id}
                  to={`/lessons/${l.id}`}
                  className={`lessonlink ${location.pathname === `/lessons/${l.id}` ? 'on' : ''} ${progress?.[l.id] ? 'done' : ''}`}
                >
                  <span className="chk">{progress?.[l.id] ? '✓' : l.order}</span>
                  <span className="lt">{l.title}</span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
      <div className="navgroup">RESOURCES</div>
      <Link to="/docs" className="modlink resourcelink">
        <span className="modnum">⚑</span>
        <span className="modttl">Official docs index</span>
      </Link>
      <Link to="/chat" className="modlink resourcelink">
        <span className="modnum">✦</span>
        <span className="modttl">AI Tutor</span>
      </Link>
      <div className="sidefoot">
        <p>486 lessons · 80 modules · full backend projects</p>
        <p className="dim">Java 21 · Spring Boot 3.4 · Spring AI 1.0</p>
      </div>
    </aside>
  );
}
