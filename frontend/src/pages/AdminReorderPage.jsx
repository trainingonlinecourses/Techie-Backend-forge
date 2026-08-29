import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext.jsx';

export default function AdminReorderPage() {
  const { user } = useAuth();
  const [curriculum, setCurriculum] = useState([]);
  const [selectedModule, setSelectedModule] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);

  useEffect(() => {
    api.get('/content/curriculum')
      .then(res => setCurriculum(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedModule) { setLessons([]); return; }
    api.get(`/content/modules/${selectedModule}`)
      .then(res => {
        const ls = res.data.lessons || [];
        setLessons([...ls].sort((a, b) => a.order - b.order));
      })
      .catch(() => {});
  }, [selectedModule]);

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="page">
        <div className="call warn">
          <div className="ct">⛔ Access Denied</div>
          <p>Only admin users can reorder lessons.</p>
          <p>Default admin: <code>admin / admin123</code></p>
        </div>
      </div>
    );
  }

  // --- Drag handlers (HTML5 native, no library needed) ---
  function onDragStart(e, idx) {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', idx);
    e.currentTarget.classList.add('dragging');
  }

  function onDragOver(e, idx) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (idx === dragIdx) return;

    const updated = [...lessons];
    const [moved] = updated.splice(dragIdx, 1);
    updated.splice(idx, 0, moved);
    setLessons(updated);
    setDragIdx(idx);
  }

  function onDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    setDragIdx(null);
  }

  function onDragEnter(e) {
    e.currentTarget.classList.add('drag-over');
  }

  function onDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
  }

  function onDrop(e, idx) {
    e.currentTarget.classList.remove('drag-over');
    setDragIdx(null);
  }

  // --- Touch support for mobile ---
  let touchStartY = 0;
  let touchIdx = null;

  function onTouchStart(e, idx) {
    touchIdx = idx;
    touchStartY = e.touches[0].clientY;
  }

  function onTouchMove(e) {
    if (touchIdx === null) return;
    const touch = e.touches[0];
    const elements = document.elementsFromPoint(touch.clientX, touch.clientY);
    const target = elements.find(el => el.dataset.lessonIdx !== undefined);
    if (target) {
      const targetIdx = parseInt(target.dataset.lessonIdx);
      if (targetIdx !== touchIdx) {
        const updated = [...lessons];
        const [moved] = updated.splice(touchIdx, 1);
        updated.splice(targetIdx, 0, moved);
        setLessons(updated);
        touchIdx = targetIdx;
      }
    }
  }

  function onTouchEnd() {
    touchIdx = null;
  }

  // --- Save ---
  async function saveOrder() {
    setSaving(true);
    setMessage(null);
    try {
      await api.put(`/admin/content/modules/${selectedModule}/reorder`, {
        lessonIds: lessons.map(l => l.id)
      });
      setMessage({ type: 'success', text: `✅ ${lessons.length} lessons reordered!` });
    } catch (err) {
      setMessage({ type: 'error', text: '❌ ' + (err.response?.data?.message || err.message) });
    }
    setSaving(false);
  }

  // --- Move helpers ---
  function moveLesson(fromIdx, direction) {
    const toIdx = fromIdx + direction;
    if (toIdx < 0 || toIdx >= lessons.length) return;
    const updated = [...lessons];
    [updated[fromIdx], updated[toIdx]] = [updated[toIdx], updated[fromIdx]];
    setLessons(updated);
  }

  return (
    <div className="page">
      <div className="crumbs">
        <Link to="/">Academy</Link> <span className="sep">/</span> <span>Admin</span> <span className="sep">/</span> <span>Reorder Lessons</span>
      </div>

      <div className="pagehead" style={{ borderColor: '#ff6b6b' }}>
        <h1 className="ptitle">🔀 Reorder Lessons</h1>
        <p className="lede">Drag and drop lessons to change their order within a module. Changes are saved to the database.</p>
      </div>

      {/* Module selector */}
      <div className="reorder-controls">
        <label>Select Module:</label>
        <select
          value={selectedModule || ''}
          onChange={e => { setSelectedModule(e.target.value); setMessage(null); }}
          className="reorder-select"
        >
          <option value="">— Choose a module —</option>
          {curriculum.map(m => (
            <option key={m.module.id} value={m.module.id}>
              {m.module.order}. {m.module.title} ({m.lessons.length} lessons)
            </option>
          ))}
        </select>
      </div>

      {/* Message */}
      {message && (
        <div className={`call ${message.type === 'success' ? 'info' : 'warn'}`}>
          {message.text}
        </div>
      )}

      {/* Lesson list */}
      {lessons.length > 0 && (
        <>
          <div className="reorder-info">
            <span>{lessons.length} lessons — drag to reorder, or use ↑↓ buttons</span>
            <button
              className="btn btn-primary"
              onClick={saveOrder}
              disabled={saving}
            >
              {saving ? 'Saving...' : '💾 Save Order'}
            </button>
          </div>

          <div className="reorder-list">
            {lessons.map((lesson, idx) => (
              <div
                key={lesson.id}
                className={`reorder-item ${dragIdx === idx ? 'dragging' : ''}`}
                draggable
                onDragStart={e => onDragStart(e, idx)}
                onDragOver={e => onDragOver(e, idx)}
                onDragEnd={onDragEnd}
                onDragEnter={onDragEnter}
                onDragLeave={onDragLeave}
                onDrop={e => onDrop(e, idx)}
                onTouchStart={e => onTouchStart(e, idx)}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                data-lesson-idx={idx}
              >
                <span className="reorder-handle" title="Drag to reorder">⠿</span>
                <span className="reorder-num">{idx + 1}</span>
                <div className="reorder-body">
                  <Link to={`/lessons/${lesson.id}`} className="reorder-title">{lesson.title}</Link>
                  <span className="reorder-meta">
                    ⏱ {lesson.minutes} min · {lesson.id}
                  </span>
                </div>
                <div className="reorder-arrows">
                  <button
                    className="arrow-btn"
                    onClick={() => moveLesson(idx, -1)}
                    disabled={idx === 0}
                    title="Move up"
                  >↑</button>
                  <button
                    className="arrow-btn"
                    onClick={() => moveLesson(idx, 1)}
                    disabled={idx === lessons.length - 1}
                    title="Move down"
                  >↓</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {selectedModule && lessons.length === 0 && !message && (
        <div className="call info">Loading lessons...</div>
      )}
    </div>
  );
}
