import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, cached } from '../api/client';
import { useAuth } from '../context/AuthContext.jsx';
import { useProgress } from '../hooks/useProgress.js';
import { FALLBACK_CURRICULUM } from '../fallbackCurriculum.js';
import { SkeletonCard } from '../components/Skeleton.jsx';
import ProgressRing from '../components/ProgressRing.jsx';
import { LEVELS, recommendBand, nextModuleInBand, explainRecommendation, estimateMinutesLeft, formatMinutes, loadPulseState, savePulseState, consumeBandGain, bandCounts, BAND_COLORS } from '../lib/bands.js';
import { trackChipClick, trackRibbonJump, markRecommendedVisit, trackImpression } from '../lib/analytics.js';

// Learning-path levels, in curriculum order — see lib/bands.js for the shared logic.
const LEVEL_LABEL = {
  foundation: '🌱 Foundation — start here',
  intermediate: '🚀 Intermediate — the modern language',
  advanced: '⚡ Advanced — production backend skills',
  expert: '🏗️ Expert — architecture & operations',
};
const LEVEL_SHORT = {
  foundation: '🌱 Foundation',
  intermediate: '🚀 Intermediate',
  advanced: '⚡ Advanced',
  expert: '🏗️ Expert',
};

// Last-picked band persists across visits; an explicit ?band= in the URL overrides it (shareable links).
const BAND_KEY = 'bf:lastBand';
const ALL_BANDS = ['all', ...LEVELS];

const TECH = [
  ['JAVA', 'JDK 21'], ['SPRING FRAMEWORK', 'IoC · DI · AOP'], ['SPRING BOOT', '3.4'],
  ['SPRING SECURITY', 'JWT · OAuth2'], ['SPRING AI', 'RAG · ChatClient'], ['JPA', 'Hibernate'],
  ['MOCKMVC', 'Tests'], ['DOCKER', 'Containers'], ['H2 → POSTGRES', 'Data'], ['ACTUATOR', 'Ops'],
  ['GRADLE / MAVEN', 'Build'], ['VIRTUAL THREADS', 'Java 21'],
];

export default function Home() {
  const { user } = useAuth();
  const { progress, ready: progressReady } = useProgress();
  const [stats, setStats] = useState(null);
  const [curriculum, setCurriculum] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // Priority: ?band= in the URL → last picked (persisted) → all bands.
  const urlBand = searchParams.get('band');
  const storedBand = localStorage.getItem(BAND_KEY);
  const band = ALL_BANDS.includes(urlBand) ? urlBand : ALL_BANDS.includes(storedBand) ? storedBand : 'all';

  useEffect(() => {
    // Stale-while-revalidate: show the cached curriculum instantly (instant nav,
    // resilient to cold starts), then refresh quietly in the background.
    const cachedStats = cached.get('stats');
    if (cachedStats) setStats(cachedStats);
    const cachedCurr = cached.get('curriculum');
    if (cachedCurr) setCurriculum(Array.isArray(cachedCurr) ? cachedCurr : FALLBACK_CURRICULUM);

    api.get('/content/stats')
      .then((res) => { setStats(res.data); cached.set('stats', res.data); })
      .catch(() => {});
    api.get('/content/curriculum')
      .then((res) => {
        if (Array.isArray(res.data)) {
          setCurriculum(res.data);
          cached.set('curriculum', res.data);
        } else if (!cachedCurr) {
          setCurriculum(FALLBACK_CURRICULUM);
        }
      })
      .catch(() => { if (!cachedCurr) setCurriculum(FALLBACK_CURRICULUM); });
  }, [user]);

  // A valid ?band= deep link is also "the learner's last selection" — remember it for plain visits.
  useEffect(() => {
    if (urlBand && ALL_BANDS.includes(urlBand) && urlBand !== storedBand) {
      try { localStorage.setItem(BAND_KEY, urlBand); } catch { /* ignore */ }
    }
  }, [urlBand, storedBand]);

  // First visit (no stored choice, no ?band=): land the learner in the first band
  // with unfinished work, and highlight the exact module to start next.
  const recommended = useMemo(
    () => recommendBand(curriculum, progress),
    [curriculum, progress]
  );
  const isFirstVisit = !urlBand && !storedBand;
  const activeBand = band === 'all' && isFirstVisit && recommended ? recommended : band;
  const nextUp = useMemo(
    () => nextModuleInBand(curriculum, activeBand, progress),
    [curriculum, activeBand, progress]
  );
  // The "why" behind the recommendation — rendered as a ribbon above the tabs.
  const recInfo = useMemo(
    () => explainRecommendation(curriculum, progress),
    [curriculum, progress]
  );
  // A/B: an actually-shown ribbon is an impression (deduped per session+band in the tracker).
  const shownBand = curriculum && curriculum.length > 0 ? recInfo?.band : null;
  useEffect(() => {
    if (user && shownBand) trackImpression(shownBand);
  }, [user?.id, shownBand]);
  // Has the learner started anything in the active scope? Decides Start vs Continue wording.
  const scopeStarted = useMemo(() => {
    if (!curriculum) return false;
    const mods = activeBand === 'all'
      ? curriculum
      : curriculum.filter((m) => m.module.level === activeBand);
    return mods.some((m) => m.lessons.some((l) => progress[l.id]));
  }, [curriculum, activeBand, progress]);

  const totalLessons = curriculum?.reduce((n, m) => n + (m.module.lessonCount ?? m.lessons.length), 0) ?? 0;

  // Per-band progress, shown on the filter tabs, the hero card and the navbar pill.
  const levelStats = useMemo(() => bandCounts(curriculum, progress), [curriculum, progress]);

  // The hero card follows the RECOMMENDED band (not the tab being browsed) and
  // deep-links to its Start-here lesson; null when the curriculum is complete.
  const heroNext = useMemo(
    () => (recInfo?.band ? nextModuleInBand(curriculum, recInfo.band, progress) : null),
    [curriculum, recInfo, progress]
  );
  const heroStarted = recInfo?.band ? levelStats[recInfo.band]?.done > 0 : false;
  const heroMinutesLeft = useMemo(
    () => (recInfo?.band ? estimateMinutesLeft(curriculum, recInfo.band, progress) : 0),
    [curriculum, recInfo, progress]
  );

  // Reward pulse on the hero bar: fire once when the recommended band's
  // done-count grows vs the last count observed this session — usually the
  // moment the learner returns home after completing a lesson. Counts are
  // observed only after the progress fetch settles (progressReady), otherwise
  // the async 0→N load would read as a gain on every visit. Session-persisted
  // per band per user so a full page load doesn't suppress or fake a reward.
  const recBand = recInfo?.band ?? null;
  const levelCounts = useMemo(
    () => Object.fromEntries(LEVELS.map((lv) => [lv, levelStats[lv]?.done ?? 0])),
    [levelStats]
  );
  const lastBandRef = useRef(null);
  const lastCountsRef = useRef({});
  const prevUserRef = useRef(null);
  const consumedCountsRef = useRef(null);
  const [pulseBand, setPulseBand] = useState(null);
  useEffect(() => {
    if (!progressReady || !curriculum) return;
    if (consumedCountsRef.current === levelCounts) return; // StrictMode re-run of the same state
    consumedCountsRef.current = levelCounts;
    if (prevUserRef.current !== (user?.id ?? null)) {
      // Account switched — in-memory observations belong to the previous user.
      prevUserRef.current = user?.id ?? null;
      lastCountsRef.current = {};
      lastBandRef.current = null;
    }
    // In-memory (this session) observations are newer than the persisted ones.
    const lastSeen = { ...loadPulseState(user?.id), ...lastCountsRef.current };
    if (lastBandRef.current !== null && lastBandRef.current !== recBand
        && Number.isFinite(levelCounts[recBand])) {
      // The recommendation genuinely moved mid-session (band graduated) — the new
      // band starts from its current count, so switching to it is not a reward.
      lastSeen[recBand] = levelCounts[recBand];
    }
    lastBandRef.current = recBand;
    const { pulseBand: gained, counts } = consumeBandGain(levelCounts, lastSeen);
    lastCountsRef.current = counts;
    savePulseState(user?.id, counts);
    setPulseBand(gained);
  }, [progressReady, curriculum, recBand, levelCounts, user?.id]);

  function openFromChip() {
    if (!nextUp || !user) return;
    trackChipClick(nextUp.lesson.id, activeBand);
    markRecommendedVisit(nextUp.lesson.id);
  }

  function jumpFromRibbon() {
    if (!user || !nextUp) return;
    trackRibbonJump(recInfo.band);
    markRecommendedVisit(nextUp.lesson.id);
  }

  function pickBand(lv) {
    const next = new URLSearchParams(searchParams);
    if (lv === 'all') next.delete('band');
    else next.set('band', lv);
    try { localStorage.setItem(BAND_KEY, lv); } catch { /* storage unavailable — the choice just won't persist */ }
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="home">
      <section className="hero">
        <div className="bgimg" />
        <div className="veil" />
        <div className="inner">
          <div className="kicker">
            <span className="pulse" /> FULL-STACK SPRING ACADEMY · ORGANIZATIONAL VIEW
          </div>
          <h1>
            Master <em>Java → Spring</em> end to end, the way production teams build.
          </h1>
          <p className="lede">
            One professional platform covering Java, Spring Core, Spring Boot, Spring Security and
            Spring AI — clear explanations, production-grade code, the official docs from
            docs.spring.io, progress tracking, and a real AI tutor backed by Spring AI.
          </p>
          <div className="cta">
            <Link to="/modules/java" className="btn primary">Start the curriculum →</Link>
            <Link to="/docs" className="btn ghost">Official docs index</Link>
            {!user && <Link to="/register" className="btn ghost">Create account · track progress</Link>}
          </div>
          <div className="stats">
            <div className="stat"><div className="v">{totalLessons || stats?.lessons || '—'}</div><div className="l">LESSONS</div></div>
            <div className="stat"><div className="v">{curriculum?.length || stats?.modules || '—'}</div><div className="l">MODULES</div></div>
            <div className="stat"><div className="v">{(stats?.minutes ?? 0) / 60 | 0}<b>h</b></div><div className="l">CURRICULUM</div></div>
            <div className="stat"><div className="v">{stats?.docsLinks ?? '—'}+</div><div className="l">DOC LINKS</div></div>
          </div>
          <div className="hero-tech-tags">
            {['Java 21', 'Spring Boot 3.4', 'Spring Security', 'Spring AI', 'Docker', 'Kubernetes', 'PostgreSQL', 'Redis'].map((t) => (
              <span key={t} className="hero-tag">{t}</span>
            ))}
          </div>

          {user && heroNext && recInfo?.band && (() => {
            const bandDone = levelStats[recInfo.band]?.done ?? 0;
            const bandTotal = levelStats[recInfo.band]?.total ?? 0;
            const bandPct = bandTotal > 0 ? Math.round((bandDone / bandTotal) * 100) : 0;
            const bandColor = BAND_COLORS[recInfo.band];
            return (
              <div className="continuecard">
                <div className="cc-info">
                  <span className="cc-label">
                    {heroStarted ? 'CONTINUE LEARNING' : 'START LEARNING'} · {LEVEL_SHORT[recInfo.band].toUpperCase()}
                  </span>
                  <Link to={`/lessons/${heroNext.lesson.id}`} className="cc-title">{heroNext.lesson.title}</Link>
                  <span className="cc-mod">
                    MODULE {String(heroNext.module.order).padStart(2, '0')} · {heroNext.module.title}
                    {' · '}{bandDone}/{bandTotal} in this band
                    {' · '}≈{formatMinutes(heroMinutesLeft)} left
                  </span>
                  <div
                    className={`cc-progress${pulseBand && pulseBand === recInfo.band ? ' cc-pulse' : ''}`}
                    onAnimationEnd={(e) => { if (e.target === e.currentTarget) setPulseBand(null); }}
                    role="progressbar" aria-valuenow={bandPct} aria-valuemin={0} aria-valuemax={100}
                    aria-label={`${bandDone} of ${bandTotal} ${recInfo.band} lessons completed`}
                  >
                    {[25, 50, 75, 100].map((pct) => (
                      <span key={pct} className="cc-progress-tick" style={{ left: `calc(${pct}% - 1px)` }} aria-hidden="true" />
                    ))}
                    <div className="cc-progress-fill" style={{ width: `${bandPct}%`, background: bandColor }} />
                  </div>
                </div>
                <div className="cc-actions">
                  <Link to={`/lessons/${heroNext.lesson.id}`} className="btn primary">{heroStarted ? 'Continue →' : 'Start here →'}</Link>
                  <button
                    className="btn ghost"
                    onClick={() => document.getElementById('band-tabs-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  >
                    Pick a band
                  </button>
                </div>
              </div>
            );
          })()}
          {user && !heroNext && totalLessons > 0 && (
            <div className="continuecard done">
              <div className="cc-info">
                <span className="cc-label">🏁 ALL DONE</span>
                <span className="cc-title">You completed all {totalLessons} lessons — outstanding!</span>
                <span className="cc-mod">Revisit any module from the sidebar or ask the AI tutor.</span>
              </div>
              <Link to="/chat" className="btn primary">Ask the AI tutor →</Link>
            </div>
          )}
        </div>
      </section>

      <div className="marquee">
        <div className="mq-track">
          {[...TECH, ...TECH].map(([a, b], i) => (
            <span key={i}><b>{a}</b> — {b}</span>
          ))}
        </div>
      </div>

      <h2 className="sec">The curriculum</h2>
      <p className="lede">
        {curriculum?.length || '…'} modules, sorted the way Java itself grew — and the way you should learn it:
        foundations first, then the modern language (Java 8 → 26), then the framework, then production practice —
        finishing with a complete runnable project.{' '}
        <Link to="/timeline" className="tl-inline-link">Prefer the release story? Walk the 1.0 → 26 timeline →</Link>
      </p>
      {curriculum && curriculum.length > 0 && recInfo.band && (
        <div className={`rec-ribbon ${recInfo.kind}`}>
          <span className="rec-ribbon-badge">Recommended for you</span>
          <span className="rec-ribbon-reason">{recInfo.reason}</span>
          {activeBand !== recInfo.band && (
            <button className="rec-ribbon-go" onClick={() => { jumpFromRibbon(); pickBand(recInfo.band); }}>
              Show the {LEVEL_SHORT[recInfo.band].replace(/^[^ ]+ /, '')} band →
            </button>
          )}
        </div>
      )}
      {curriculum && curriculum.length > 0 && (
        <div className="band-tabs-row" id="band-tabs-anchor">
          <div className="band-tabs" role="tablist" aria-label="Filter curriculum by level">
            <button
              role="tab"
              aria-selected={activeBand === 'all'}
              className={`band-tab ${activeBand === 'all' ? 'active' : ''}`}
              onClick={() => pickBand('all')}
            >
              All bands
              <span className="band-tab-count">{totalLessons}</span>
            </button>
            {LEVELS.map((lv) => (
              <button
                key={lv}
                role="tab"
                aria-selected={activeBand === lv}
                className={`band-tab ${lv} ${activeBand === lv ? 'active' : ''}`}
                onClick={() => pickBand(lv)}
              >
                {LEVEL_SHORT[lv]}
                {recommended === lv && <span className="band-tab-rec" title="Your next band to progress in — based on your completed lessons">Start here</span>}
                <span className="band-tab-count">{levelStats[lv].done}/{levelStats[lv].total}</span>
              </button>
            ))}
          </div>
          {nextUp && (
            <Link
              to={`/lessons/${nextUp.lesson.id}`}
              className="continue-chip"
              onClick={openFromChip}
              title={`Next up in ${activeBand === 'all' ? 'the curriculum' : LEVEL_LABEL[activeBand]}: ${nextUp.lesson.title} (${nextUp.module.title})`}
            >
              <span className="continue-chip-label">{scopeStarted ? '▶ Continue where you left off' : '▶ Start here'}</span>
              <span className="continue-chip-lesson">{nextUp.lesson.title}</span>
            </Link>
          )}
        </div>
      )}
      {!curriculum && (
        <div className="modgrid">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}
      {LEVELS.filter((lv) => activeBand === 'all' || activeBand === lv).map((lv) => {
        const mods = (curriculum || []).filter((m) => m.module.level === lv);
        if (!curriculum || mods.length === 0) return null;
        const lvTotal = mods.reduce((n, m) => n + (m.module.lessonCount ?? m.lessons.length), 0);
        const lvDone = mods.reduce((n, m) => n + m.lessons.filter((l) => progress[l.id]).length, 0);
        const ringColor = { foundation: '#6fce6f', intermediate: '#4cc2ff', advanced: '#bb9af7', expert: '#ff9e64' }[lv];
        return (
          <div key={lv} className="level-section">
            <h3 className="level-h">
              <span className={`level-pill ${lv}`}>{LEVEL_LABEL[lv]}</span>
              <span className="level-ring">
                <ProgressRing value={lvTotal > 0 ? lvDone / lvTotal : 0} size={44} stroke={5} color={ringColor}>
                  <span className="level-ring-pct">{lvTotal > 0 ? Math.round((lvDone / lvTotal) * 100) : 0}%</span>
                </ProgressRing>
                <span className="level-ring-count">{lvDone}/{lvTotal} lessons</span>
              </span>
            </h3>
            <div className="modgrid">
            {mods.map((m, i) => {
              const total = m.module.lessonCount ?? m.lessons.length;
              const done = m.lessons.filter((l) => progress[l.id]).length;
              const pct = total > 0 ? Math.round(done / total * 100) : 0;
              const isNextUp = nextUp?.module.id === m.module.id;
              return (
                <Link key={m.module.id} to={`/modules/${m.module.id}`} className={`modcard ${isNextUp ? 'next-up' : ''}`} data-num={m.module.order} style={{ animationDelay: `${Math.min(i * 0.03, 0.3)}s` }}>
                  {isNextUp && <span className="next-up-chip">▶ Start here</span>}
                  <div className="modcard-top">
                    <div className="g">MODULE {String(m.module.order).padStart(2, '0')}</div>
                    <div className="modcard-head">
                      {m.module.version && <span className="ver-chip">{m.module.version}</span>}
                      <div className="modcard-icon" style={{ background: m.module.color + '18', color: m.module.color }}>
                        {lv === 'foundation' ? '☕' : lv === 'intermediate' ? '🚀' : lv === 'advanced' ? '⚡' : '🏗️'}
                      </div>
                    </div>
                  </div>
                  <h3>{m.module.title}</h3>
                  <p>{m.module.subtitle}</p>
                  <div className="techs">
                    {m.module.tech.slice(0, 4).map((t) => <span key={t}>{t}</span>)}
                    {m.module.tech.length > 4 && <span className="tech-more">+{m.module.tech.length - 4}</span>}
                  </div>
                  <div className="foot">
                    <span>{total} lessons · {Math.round(m.module.minutes / 60 * 10) / 10}h</span>
                    <span className={`state ${done === total && total > 0 ? 'done' : pct > 0 ? 'progress' : 'todo'}`}>
                      {done === total && total > 0 ? '✓ complete' : pct > 0 ? `${pct}% done` : `${done}/${total}`}
                    </span>
                  </div>
                  <div className="mbar">
                    <div className="mbar-fill" style={{ width: `${pct}%`, background: m.module.color }} />
                  </div>
                </Link>
              );
            })}
            </div>
          </div>
        );
      })}

      <h2 className="sec">How this platform works</h2>
      <div className="board">
          <div className="bcol ok" style={{ animation: 'fadeInUp 0.5s ease-out 0.1s both' }}>
            <div className="bcol-icon">📚</div>
            <h4>LEARN</h4>
            <ul>
              <li>{totalLessons || '…'} lessons with explanations + runnable code</li>
              <li>Every topic linked to its official docs</li>
              <li>Marked from the sidebar; progress is saved</li>
            </ul>
          </div>
          <div className="bcol ok" style={{ animation: 'fadeInUp 0.5s ease-out 0.2s both' }}>
            <div className="bcol-icon">🔨</div>
            <h4>BUILD</h4>
            <ul>
              <li>Capstone: a complete payments API you can run</li>
              <li>Layered architecture, JWT security, tests, Docker</li>
              <li>Source in <code className="inline">projects/payments-api</code></li>
            </ul>
          </div>
          <div className="bcol ok" style={{ animation: 'fadeInUp 0.5s ease-out 0.3s both' }}>
            <div className="bcol-icon">📝</div>
            <h4>QUIZ</h4>
            <ul>
              <li>Interactive quizzes at the end of each lesson</li>
              <li>Timed tests with pass/fail scoring</li>
              <li>Review your answers with detailed explanations</li>
            </ul>
          </div>
          <div className="bcol ok" style={{ animation: 'fadeInUp 0.5s ease-out 0.4s both' }}>
            <div className="bcol-icon">🤖</div>
            <h4>ASK</h4>
            <ul>
              <li>AI Tutor answers from the curriculum (Spring AI)</li>
              <li>Interactive Java code simulator — run code in browser</li>
              <li>Works with zero keys — free endpoint by default</li>
            </ul>
          </div>
          <div className="bcol ok" style={{ animation: 'fadeInUp 0.5s ease-out 0.5s both' }}>
            <div className="bcol-icon">🏆</div>
            <h4>EARN</h4>
            <ul>
              <li>Certificate of completion after 80% progress</li>
              <li>Downloadable PDF with unique verification code</li>
              <li>Public verification link for employers</li>
            </ul>
          </div>
          <div className="bcol ok" style={{ animation: 'fadeInUp 0.5s ease-out 0.6s both' }}>
            <div className="bcol-icon">📊</div>
            <h4>TRACK</h4>
            <ul>
              <li>Per-user progress dashboard with stats</li>
              <li>Quiz scores and completion tracking</li>
              <li>Continue learning from any device</li>
            </ul>
          </div>
      </div>

      <h2 className="sec">What's inside the docs index</h2>
      <div className="depthgrid">
        {['Spring Framework Reference', 'Spring Boot Reference', 'Spring Security Reference', 'Spring AI Reference', 'Spring Cloud Reference', 'Spring Kafka Reference', 'Spring WebFlux Reference', 'Spring Batch Reference', 'Spring Data JPA / Mongo / Redis', 'GraphQL / REST Docs / WebSocket', 'Spring Authorization Server', 'Java 21 / Oracle docs', 'Maven & Gradle', 'OWASP Top 10'].map((d) => (
          <div key={d}><i>⚑</i>{d}</div>
        ))}
      </div>
      <div className="cta" style={{ marginTop: 18 }}>
        <Link to="/docs" className="btn primary">Browse the docs index →</Link>
        <Link to="/chat" className="btn ghost">Chat with the AI Tutor</Link>
      </div>
    </div>
  );
}
