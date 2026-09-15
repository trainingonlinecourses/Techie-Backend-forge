import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Admin dashboard for the recommendation A/B experiment. Reads the aggregate
 * payload from GET /api/analytics/dashboard (admin-only, server-enforced) and
 * visualizes: headline totals, per-variant conversion, the chip-vs-control
 * split, surface breakdown and a daily activity trend. Pure CSS charts —
 * no chart library, matching the project's zero-dependency approach.
 */

const SURFACE_LABELS = {
  IMPRESSION: 'Recommendation shown',
  CONTINUE_CHIP: 'Chip click',
  RIBBON_JUMP: 'Ribbon jump',
  MANUAL_NAVIGATION: 'Manual navigation',
  LESSON_COMPLETED: 'Lesson completed',
};

export default function AdminAnalyticsPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || user.role !== 'ADMIN') return;
    api.get('/analytics/dashboard')
      .then((res) => setData(res.data))
      .catch((err) => setError(err?.response?.status === 403
        ? 'Your account is not an admin.'
        : 'Could not load analytics.'))
      .finally(() => setLoading(false));
  }, [user]);

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="page">
        <div className="call warn">
          <div className="ct">⛔ Access Denied</div>
          <p>Only admin users can view the A/B analytics dashboard.</p>
          <p><Link to="/">← Back to the academy</Link></p>
        </div>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="page">
        <h1 className="pagetitle">Recommendation A/B Analytics</h1>
        <div className="skel-grid">
          <div className="skeleton card" style={{ height: 120 }} />
          <div className="skeleton card" style={{ height: 120 }} />
          <div className="skeleton card" style={{ height: 120 }} />
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="page">
        <div className="call warn">
          <div className="ct">⚠ Error</div>
          <p>{error || 'No data.'}</p>
        </div>
      </div>
    );
  }

  const { variants, metrics, totals, trend } = data;
  const chip = metrics?.chip || {};
  const control = metrics?.control || {};
  const maxTrend = Math.max(1, ...(trend || []).map((t) => t.events));
  const splitTotal = (chip.impressions || 0) + (control.impressions || 0);
  const chipPct = splitTotal ? Math.round(((chip.impressions || 0) / splitTotal) * 100) : 50;
  const lift =
    chip.completionRate != null && control.completionRate != null && control.completionRate > 0
      ? Math.round(((chip.completionRate - control.completionRate) / control.completionRate) * 100)
      : null;

  return (
    <div className="page abdash">
      <h1 className="pagetitle">🧪 Recommendation A/B Analytics</h1>
      <p className="pagesub">
        How learners reach lessons — recommendation surfaces vs manual browsing —
        split deterministically by user id (even → <b>chip</b>, odd → <b>control</b>).
      </p>

      {/* Headline totals */}
      <div className="ab-cards">
        <Card label="Events stored" value={totals.events} hint="all surfaces, both variants" />
        <Card label="Learners reached" value={totals.users} hint="distinct users with ≥1 event" />
        <Card label="Impressions" value={totals.impressions} hint="recommendation surfaces shown" />
        <Card label="Chip clicks" value={totals.chipClicks} hint="Start-here / Continue clicks" />
        <Card label="Completions" value={totals.completions} hint="server-recorded outcome" />
      </div>

      {/* Conversion comparison — funnel: impression users → completers */}
      <section className="ab-section">
        <h2>Conversion — chip vs control</h2>
        <div className="ab-compare">
          <VariantColumn
            name="chip"
            title="🟡 Chip variant"
            m={chip}
            note="recommendation surfaces active"
          />
          <VariantColumn
            name="control"
            title="⚪ Control"
            m={control}
            note="same UI, clicks carry no recommendation context"
          />
        </div>
        {lift !== null && (
          <p className={`ab-lift ${lift >= 0 ? 'pos' : 'neg'}`}>
            {lift >= 0 ? '▲' : '▼'} Chip variant converts {Math.abs(lift)}%{' '}
            {lift >= 0 ? 'better' : 'worse'} than control on completion rate
            {totals.impressions < 30 && <span className="ab-small"> — low sample, treat as directional</span>}
          </p>
        )}
      </section>

      {/* Variant split */}
      <section className="ab-section">
        <h2>Impression split</h2>
        <div className="ab-split">
          <div className="ab-split-chip" style={{ width: `${chipPct}%` }}>chip {chipPct}%</div>
          <div className="ab-split-ctl" style={{ width: `${100 - chipPct}%` }}>control {100 - chipPct}%</div>
        </div>
        <p className="ab-small">Deterministic assignment — expected near 50/50. Big skews signal a bug in variantFor().</p>
      </section>

      {/* Surface breakdown */}
      <section className="ab-section">
        <h2>Events by surface</h2>
        <div className="ab-surfaces">
          {Object.entries(SURFACE_LABELS).map(([key, label]) => {
            const c = variants?.chip?.[key] || 0;
            const k = variants?.control?.[key] || 0;
            const total = Object.values(variants?.chip || {}).reduce((a, b) => a + b, 0)
              + Object.values(variants?.control || {}).reduce((a, b) => a + b, 0);
            const pct = total ? Math.round(((c + k) / total) * 100) : 0;
            return (
              <div className="ab-surfrow" key={key}>
                <span className="ab-surflabel">{label}</span>
                <div className="ab-surfbar">
                  <div style={{ width: `${pct}%` }} />
                </div>
                <span className="ab-surfnums">{c} / {k} <em>({pct}%)</em></span>
              </div>
            );
          })}
        </div>
        <p className="ab-small">Numbers are chip / control counts.</p>
      </section>

      {/* Daily trend */}
      {trend?.length > 0 && (
        <section className="ab-section">
          <h2>Daily activity</h2>
          <div className="ab-trend">
            {trend.slice(-14).map((t) => (
              <div className="ab-trendcol" key={t.day} title={`${t.day}: ${t.events} events`}>
                <div className="ab-trendbar" style={{ height: `${Math.max(4, (t.events / maxTrend) * 100)}%` }} />
                <span className="ab-trendday">{t.day.slice(5)}</span>
              </div>
            ))}
          </div>
          <p className="ab-small">Last {Math.min(14, trend.length)} days with events · hover for exact counts.</p>
        </section>
      )}
    </div>
  );
}

function Card({ label, value, hint }) {
  return (
    <div className="ab-card">
      <div className="ab-cardval">{value ?? 0}</div>
      <div className="ab-cardlabel">{label}</div>
      <div className="ab-cardhint">{hint}</div>
    </div>
  );
}

function VariantColumn({ title, m, note }) {
  return (
    <div className="ab-variant">
      <h3>{title}</h3>
      <p className="ab-variantnote">{note}</p>
      <Metric label="Impressions" value={m.impressions ?? 0} />
      <Metric label="Chip clicks" value={m.chipClicks ?? 0} />
      <Metric label="Completions" value={m.completions ?? 0} />
      <Metric label="Users who saw a recommendation" value={m.usersWithImpression ?? 0} />
      <div className="ab-rates">
        <div>
          <div className="ab-rateval">{m.clickRate ?? 0}%</div>
          <div className="ab-ratelabel">click-through rate</div>
        </div>
        <div>
          <div className="ab-rateval">{m.completionRate ?? 0}%</div>
          <div className="ab-ratelabel">of those users completed a lesson</div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="ab-metric">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
