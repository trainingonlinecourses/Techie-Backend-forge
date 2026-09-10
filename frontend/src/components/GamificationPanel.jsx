import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import ProgressRing from './ProgressRing.jsx';

const LEVEL_COLORS = {
  foundation: '#6fce6f',
  intermediate: '#4cc2ff',
  advanced: '#bb9af7',
  expert: '#ff9e64',
};
const LEVEL_LABEL = {
  foundation: 'Foundation',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
};

/** XP + streak + badges + per-level rings, driven by /api/progress/gamification. */
export default function GamificationPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get('/progress/gamification')
      .then((res) => setData(res.data))
      .catch(() => setError(true));
  }, []);

  if (error) return null;
  if (!data) {
    return <div className="dashboard-loading">Loading achievements…</div>;
  }

  const earned = data.badges.filter((b) => b.earned).length;

  return (
    <div className="gamification">
      {/* XP + streak headline */}
      <div className="xp-head">
        <div className="xp-level">
          <span className="xp-level-icon">🏅</span>
          <div>
            <div className="xp-level-name">Level: {data.xpLevel}</div>
            <div className="xp-amount">{data.xp} XP</div>
          </div>
        </div>
        <div className="streak-box">
          <span className="streak-flame">🔥</span>
          <div>
            <div className="streak-days">{data.streakDays} day{data.streakDays === 1 ? '' : 's'}</div>
            <div className="streak-sub">current streak · best {data.bestStreak}</div>
          </div>
        </div>
      </div>

      {/* Per-level progress rings */}
      <div className="rings-row">
        {data.levels.map((lv) => (
          <div key={lv.level} className="ring-cell">
            <ProgressRing value={lv.total > 0 ? lv.completed / lv.total : 0}
              color={LEVEL_COLORS[lv.level]}>
              <span className="ring-pct">{lv.total > 0 ? Math.round((lv.completed / lv.total) * 100) : 0}%</span>
            </ProgressRing>
            <span className="ring-name">{LEVEL_LABEL[lv.level]}</span>
            <span className="ring-count">{lv.completed}/{lv.total}</span>
          </div>
        ))}
      </div>

      {/* Badges */}
      <div className="badges-head">
        <h3>🏅 Achievements</h3>
        <span className="badges-count">{earned}/{data.badges.length} earned</span>
      </div>
      <div className="badges-grid">
        {data.badges.map((b) => (
          <div key={b.id} className={`badge-card ${b.earned ? 'earned' : 'locked'}`}
               title={b.description}>
            <span className="badge-icon">{b.earned ? b.icon : '🔒'}</span>
            <span className="badge-name">{b.name}</span>
            {!b.earned && (
              <div className="badge-bar">
                <div className="badge-fill" style={{ width: `${b.progressPct}%` }} />
              </div>
            )}
            <span className="badge-desc">{b.earned ? b.description : `${b.progressPct}%`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
