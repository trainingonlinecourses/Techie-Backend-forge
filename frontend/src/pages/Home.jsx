import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext.jsx';
import { useProgress } from '../hooks/useProgress.js';

// Shown when the API is unreachable (e.g. a static-only deployment) so the
// curriculum still renders. The live backend always replaces this.
const FALLBACK_CURRICULUM = [
  { module: { id: 'java', title: 'Java Foundations', subtitle: 'The language, JVM and tooling every backend engineer needs — from bytecode to virtual threads.', order: 1, color: '#f5a623', tech: ['JDK 21', 'JVM', 'Maven', 'Concurrency'], lessonCount: 12, minutes: 196 }, lessons: [] },
  { module: { id: 'spring-core', title: 'Spring Core & Framework', subtitle: 'IoC, dependency injection, AOP, events and transactions — the engine under every Spring app.', order: 2, color: '#6fce6f', tech: ['IoC', 'DI', 'AOP', 'Events', 'Transactions'], lessonCount: 9, minutes: 156 }, lessons: [] },
  { module: { id: 'spring-boot', title: 'Spring Boot', subtitle: 'Auto-configuration, REST APIs, Spring Data JPA, testing, Actuator and production readiness.', order: 3, color: '#4cc2ff', tech: ['Auto-configuration', 'REST', 'JPA', 'Testing', 'Actuator'], lessonCount: 9, minutes: 156 }, lessons: [] },
  { module: { id: 'spring-security', title: 'Spring Security', subtitle: 'Authentication, JWT, authorization, OAuth2 and hardening APIs the way production teams do.', order: 4, color: '#ff6b6b', tech: ['Filter Chain', 'JWT', 'OAuth2', 'Method Security'], lessonCount: 9, minutes: 150 }, lessons: [] },
  { module: { id: 'spring-ai', title: 'Spring AI', subtitle: 'ChatClient, embeddings, RAG and function calling — production patterns for AI-powered backends.', order: 5, color: '#bb9af7', tech: ['ChatClient', 'Embeddings', 'RAG', 'Function Calling'], lessonCount: 8, minutes: 132 }, lessons: [] },
  { module: { id: 'capstone', title: 'Capstone: Full Backend Project', subtitle: 'A complete, runnable payments API built with everything above — layered architecture, JWT security, tests.', order: 6, color: '#2ac3de', tech: ['Spring Boot', 'JPA', 'Security', 'JUnit'], lessonCount: 5, minutes: 84 }, lessons: [] },
  { module: { id: 'spring-cloud', title: 'Spring Cloud & Microservices', subtitle: 'Service discovery, centralized config, API gateway, Resilience4j and distributed tracing — with a runnable 5-service demo.', order: 7, color: '#7aa2f7', tech: ['Eureka', 'Config Server', 'Gateway', 'Resilience4j', 'Tracing'], lessonCount: 7, minutes: 138 }, lessons: [] },
];

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
      .then((res) => setCurriculum(res.data))
      .catch(() => setCurriculum(FALLBACK_CURRICULUM));
  }, [user]);

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
            <div className="stat"><div className="v">{stats?.lessons ?? '52'}</div><div className="l">LESSONS</div></div>
            <div className="stat"><div className="v">{stats?.modules ?? 6}</div><div className="l">MODULES</div></div>
            <div className="stat"><div className="v">{(stats?.minutes ?? 830) / 60 | 0}<b>h</b></div><div className="l">CURRICULUM</div></div>
            <div className="stat"><div className="v">{stats?.docsLinks ?? 40}+</div><div className="l">DOC LINKS</div></div>
          </div>
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
        Seven modules, ordered the way an organization rolls out Java and Spring: foundation first,
        then the framework, then production practice — finishing with a complete runnable project.
      </p>
      <div className="modgrid">
        {curriculum?.map((m, i) => {
          const total = m.module.lessonCount ?? m.lessons.length;
          const done = m.lessons.filter((l) => progress[l.id]).length;
          return (
            <Link key={m.module.id} to={`/modules/${m.module.id}`} className="modcard" data-num={m.module.order}>
              <div className="g">MODULE {String(m.module.order).padStart(2, '0')}</div>
              <h3>{m.module.title}</h3>
              <p>{m.module.subtitle}</p>
              <div className="techs">
                {m.module.tech.map((t) => <span key={t}>{t}</span>)}
              </div>
              <div className="foot">
                <span>{total} lessons · {Math.round(m.module.minutes / 60 * 10) / 10}h</span>
                <span className={`state ${done === total && total > 0 ? 'done' : 'todo'}`}>
                  {done === total && total > 0 ? '✓ complete' : `${done}/${total} done`}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      <h2 className="sec">How this platform works</h2>
      <div className="board">
        <div className="bcol ok">
          <h4>LEARN</h4>
          <ul>
            <li>59 lessons with explanations + runnable code</li>
            <li>Every topic linked to its official docs</li>
            <li>Marked from the sidebar; progress is saved</li>
          </ul>
        </div>
        <div className="bcol ok">
          <h4>BUILD</h4>
          <ul>
            <li>Capstone: a complete payments API you can run</li>
            <li>Layered architecture, JWT security, tests, Docker</li>
            <li>Source in <code className="inline">projects/payments-api</code></li>
          </ul>
        </div>
        <div className="bcol ok">
          <h4>ASK</h4>
          <ul>
            <li>AI Tutor answers from the curriculum (Spring AI)</li>
            <li>Works with zero keys — auto-detects Ollama, uses a free Hugging Face endpoint by default</li>
            <li>Offline: a local knowledge assistant answers too</li>
          </ul>
        </div>
      </div>

      <h2 className="sec">What's inside the docs index</h2>
      <div className="depthgrid">
        {['Spring Framework Reference', 'Spring Boot Reference', 'Spring Security Reference', 'Spring AI Reference', 'Spring Cloud Reference', 'Spring Data JPA', 'Java 21 / Oracle docs', 'Maven & Gradle', 'OWASP Top 10'].map((d) => (
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
