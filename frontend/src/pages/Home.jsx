import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext.jsx';
import { useProgress } from '../hooks/useProgress.js';
import { FALLBACK_CURRICULUM } from '../fallbackCurriculum.js';
import { SkeletonCard } from '../components/Skeleton.jsx';

const TECH = [
  ['JAVA', 'JDK 21'], ['SPRING FRAMEWORK', 'IoC · DI · AOP'], ['SPRING BOOT', '3.4'],
  ['SPRING SECURITY', 'JWT · OAuth2'], ['SPRING AI', 'RAG · ChatClient'], ['JPA', 'Hibernate'],
  ['MOCKMVC', 'Tests'], ['DOCKER', 'Containers'], ['H2 → POSTGRES', 'Data'], ['ACTUATOR', 'Ops'],
  ['GRADLE / MAVEN', 'Build'], ['VIRTUAL THREADS', 'Java 21'],
];

export default function Home() {
  const { user } = useAuth();
  const { progress } = useProgress();
  const [stats, setStats] = useState(null);
  const [curriculum, setCurriculum] = useState(null);

  useEffect(() => {
    api.get('/content/stats').then((res) => setStats(res.data)).catch(() => {});
    api.get('/content/curriculum')
      .then((res) => setCurriculum(Array.isArray(res.data) ? res.data : FALLBACK_CURRICULUM))
      .catch(() => setCurriculum(FALLBACK_CURRICULUM));
  }, [user]);

  // The next incomplete lesson, in curriculum order — powers the "Continue learning" card.
  const nextLesson = useMemo(() => {
    if (!Array.isArray(curriculum)) return null;
    for (const m of curriculum) {
      const next = m.lessons.find((l) => !progress[l.id]);
      if (next) return { module: m.module, lesson: next };
    }
    return null;
  }, [curriculum, progress]);

  const totalLessons = curriculum?.reduce((n, m) => n + (m.module.lessonCount ?? m.lessons.length), 0) ?? 0;

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

          {user && nextLesson && (
            <div className="continuecard">
              <div className="cc-info">
                <span className="cc-label">CONTINUE LEARNING</span>
                <Link to={`/lessons/${nextLesson.lesson.id}`} className="cc-title">{nextLesson.lesson.title}</Link>
                <span className="cc-mod">
                  MODULE {String(nextLesson.module.order).padStart(2, '0')} · {nextLesson.module.title}
                </span>
              </div>
              <Link to={`/lessons/${nextLesson.lesson.id}`} className="btn primary">Continue →</Link>
            </div>
          )}
          {user && !nextLesson && totalLessons > 0 && (
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
        {curriculum?.length || '…'} modules, ordered the way an organization rolls out Java and Spring: foundation first,
        then the framework, then production practice — finishing with a complete runnable project.
      </p>
      <div className="modgrid">
        {!curriculum ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : curriculum.map((m, i) => {
          const total = m.module.lessonCount ?? m.lessons.length;
          const done = m.lessons.filter((l) => progress[l.id]).length;
          const pct = total > 0 ? Math.round(done / total * 100) : 0;
          return (
            <Link key={m.module.id} to={`/modules/${m.module.id}`} className="modcard" data-num={m.module.order} style={{ animationDelay: `${Math.min(i * 0.03, 0.3)}s` }}>
              <div className="modcard-top">
                <div className="g">MODULE {String(m.module.order).padStart(2, '0')}</div>
                <div className="modcard-icon" style={{ background: m.module.color + '18', color: m.module.color }}>
                  {m.module.order <= 10 ? '☕' : m.module.order <= 30 ? '🚀' : m.module.order <= 60 ? '⚡' : '🏗️'}
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
