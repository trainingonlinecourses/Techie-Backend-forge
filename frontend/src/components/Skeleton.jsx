import React from 'react';

export function SkeletonCard() {
  return (
    <div className="skeleton skeleton-card">
      <div className="skeleton-text" style={{ width: '30%' }} />
      <div className="skeleton-title" />
      <div className="skeleton-text" style={{ width: '80%' }} />
      <div className="skeleton-text" style={{ width: '60%' }} />
    </div>
  );
}

export function SkeletonLesson() {
  return (
    <div className="skeleton-lesson">
      <div className="skeleton-text" style={{ width: '20%', height: 12 }} />
      <div className="skeleton-title" style={{ width: '70%', height: 28 }} />
      <div className="skeleton-text" style={{ width: '50%', height: 14 }} />
      <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        <div className="skeleton" style={{ width: 80, height: 24, borderRadius: 999 }} />
        <div className="skeleton" style={{ width: 60, height: 24, borderRadius: 999 }} />
        <div className="skeleton" style={{ width: 70, height: 24, borderRadius: 999 }} />
      </div>
      <div className="skeleton-text" style={{ width: '100%', height: 14 }} />
      <div className="skeleton-text" style={{ width: '95%', height: 14 }} />
      <div className="skeleton-text" style={{ width: '88%', height: 14 }} />
      <div className="skeleton-text" style={{ width: '92%', height: 14 }} />
      <div className="skeleton-text" style={{ width: '60%', height: 14 }} />
      <div className="skeleton" style={{ width: '100%', height: 180, borderRadius: 12, marginTop: 20 }} />
      <div className="skeleton-text" style={{ width: '100%', height: 14, marginTop: 16 }} />
      <div className="skeleton-text" style={{ width: '85%', height: 14 }} />
      <div className="skeleton-text" style={{ width: '90%', height: 14 }} />
    </div>
  );
}

export function SkeletonSidebar() {
  return (
    <aside className="sidebar">
      <div className="skeleton-text" style={{ width: '40%', height: 10, margin: '12px 10px' }} />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{ padding: '6px 10px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="skeleton" style={{ width: 20, height: 14, borderRadius: 4 }} />
          <div className="skeleton" style={{ flex: 1, height: 14 }} />
          <div className="skeleton" style={{ width: 24, height: 14, borderRadius: 4 }} />
        </div>
      ))}
    </aside>
  );
}

export function SkeletonModulePage() {
  return (
    <div className="skeleton-lesson">
      <div className="skeleton-text" style={{ width: '20%', height: 12 }} />
      <div className="skeleton-title" style={{ width: '60%', height: 32 }} />
      <div className="skeleton-text" style={{ width: '80%', height: 14 }} />
      <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ width: 60, height: 22, borderRadius: 999 }} />
        ))}
      </div>
      <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ width: '100%', height: 72, borderRadius: 12 }} />
        ))}
      </div>
    </div>
  );
}
