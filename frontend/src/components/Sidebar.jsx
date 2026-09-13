import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { FALLBACK_CURRICULUM } from '../fallbackCurriculum.js';

// Expanded modules persist across visits; the active module (the one you're
// browsing) is always expanded on top of that, following the route.
const OPEN_KEY = 'bf:openModules';

function loadOpenModules() {
  try {
    const arr = JSON.parse(localStorage.getItem(OPEN_KEY) || '[]');
    return Array.isArray(arr) ? new Set(arr.filter((x) => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function saveOpenModules(set) {
  try { localStorage.setItem(OPEN_KEY, JSON.stringify([...set])); } catch { /* non-fatal */ }
}

export default function Sidebar({ progress }) {
  const [curriculum, setCurriculum] = useState(null);
  const [openModules, setOpenModules] = useState(loadOpenModules);
  const location = useLocation();

  useEffect(() => {
    api
      .get('/content/curriculum')
      .then((res) => setCurriculum(Array.isArray(res.data) ? res.data : FALLBACK_CURRICULUM))
      .catch(() => setCurriculum(FALLBACK_CURRICULUM));
  }, []);

  if (!curriculum) return <aside className="sidebar">Loading curriculum…</aside>;

  // Current module: directly from /modules/:id, or looked up from the lesson id
  // (which module contains it) so the active module opens on every lesson page.
  const pathId = location.pathname.split('/')[2] || null;
  const current =
    location.pathname.startsWith('/modules/')
      ? pathId
      : location.pathname.startsWith('/lessons/')
        ? curriculum.find((m) => m.lessons.some((l) => l.id === pathId))?.module.id || null
        : null;

  const isOpen = (id) => openModules.has(id) || id === current;
  const allOpen = curriculum.every((m) => openModules.has(m.module.id));

  function toggleModule(id) {
    setOpenModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveOpenModules(next);
      return next;
    });
  }

  function toggleAll() {
    setOpenModules((prev) => {
      const next = allOpen ? new Set() : new Set(curriculum.map((m) => m.module.id));
      saveOpenModules(next);
      return next;
    });
  }

  return (
    <aside className="sidebar">
      <div className="navgroup sidebar-curriculum-head">
        <span>CURRICULUM</span>
        <button
          className="sidebar-toggle-all"
          onClick={toggleAll}
          title={allOpen ? 'Collapse all modules' : 'Expand all modules'}
        >
          {allOpen ? 'collapse −' : 'expand +'}
        </button>
      </div>
      {curriculum.map((m) => {
        const active = current === m.module.id || current?.startsWith(m.module.id);
        const doneCount = m.lessons.filter((l) => progress?.[l.id]).length;
        const open = isOpen(m.module.id);
        return (
          <div className="modgroup" key={m.module.id}>
            <div className="modrow">
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
              {!active && (
                <button
                  className={`modchev ${open ? 'open' : ''}`}
                  onClick={() => toggleModule(m.module.id)}
                  aria-expanded={open}
                  aria-label={`${open ? 'Collapse' : 'Expand'} ${m.module.title}`}
                  title={open ? 'Collapse lessons' : 'Show lessons'}
                >
                  ▸
                </button>
              )}
            </div>
            {open && (
              <div className="modlessons">
                {[...m.lessons].sort((a, b) => a.order - b.order).map((l) => (
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
            )}
          </div>
        );
      })}
      <div className="navgroup">RESOURCES</div>
      <Link to="/progress" className="modlink resourcelink">
        <span className="modnum">📊</span>
        <span className="modttl">My Progress</span>
      </Link>
      <Link to="/certificates" className="modlink resourcelink">
        <span className="modnum">🏆</span>
        <span className="modttl">Certificates</span>
      </Link>
      <Link to="/docs" className="modlink resourcelink">
        <span className="modnum">⚑</span>
        <span className="modttl">Official docs index</span>
      </Link>
      <Link to="/chat" className="modlink resourcelink">
        <span className="modnum">✦</span>
        <span className="modttl">AI Tutor</span>
      </Link>
      <div className="sidefoot">
        <p>{curriculum.reduce((n, m) => n + m.lessons.length, 0)} lessons · {curriculum.length} modules · full backend projects</p>
        <p className="dim">Java 21 · Spring Boot 3.4 · Spring AI 1.0</p>
      </div>
    </aside>
  );
}
