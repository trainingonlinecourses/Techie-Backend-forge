import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext.jsx';
import { useProgress } from '../hooks/useProgress.js';

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
    api.get('/content/curriculum').then((res) => setCurriculum(res.data)).catch(() => {});
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
                <span>{m.lessons.length} lessons · {Math.round(m.module.minutes / 60 * 10) / 10}h</span>
                <span className={`state ${done === m.lessons.length && m.lessons.length > 0 ? 'done' : 'todo'}`}>
                  {done === m.lessons.length && m.lessons.length > 0 ? '✓ complete' : `${done}/${m.lessons.length} done`}
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
