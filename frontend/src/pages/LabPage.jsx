import React, { useState, useEffect, useRef } from 'react';
import { api, errorMessage } from '../api/client';

const LAB_TIMEOUT_MINUTES = 30;
const POLL_INTERVAL_MS = 15000; // poll session status every 15s
const WARNING_AT_MINUTES = 5;

export default function LabPage() {
  const [topic, setTopic] = useState('');
  const [topics, setTopics] = useState([]);
  const [session, setSession] = useState(null);
  const [code, setCode] = useState('');
  const [output, setOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [minutesLeft, setMinutesLeft] = useState(null);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const pollRef = useRef(null);
  const sessionIdRef = useRef(null);

  // Load available topics from the curriculum (public, no auth needed).
  useEffect(() => {
    api.get('/content/curriculum').then((res) => {
      const all = res.data.flatMap((m) => m.lessons || []);
      setTopics(all);
    }).catch(() => {});
  }, []);

  // Auto-fill topic from URL params (e.g. /lab?topic=arrays-deep).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const topicParam = params.get('topic');
    if (topicParam) setTopic(topicParam);
  }, []);

  // Countdown timer — poll session status to get accurate minutes remaining.
  useEffect(() => {
    if (!session) return;

    sessionIdRef.current = session.sessionId;
    const sessionExpires = new Date(session.expiresAt);
    const updateTimer = () => {
      const now = Date.now();
      const diffMs = sessionExpires.getTime() - now;
      const mins = Math.max(0, Math.round(diffMs / 60000));
      setMinutesLeft(mins);
      if (diffMs <= 0) {
        setExpired(true);
        setSession(null);
        setCode('');
        setOutput('');
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }
    };
    updateTimer();

    // Poll server for accurate remaining time (in case of extension).
    pollRef.current = setInterval(() => {
      api.get(`/labs/status?sessionId=${sessionIdRef.current}`).then((res) => {
        const data = res.data;
        if (data && data.active === false) {
          setExpired(true);
          setSession(null);
          setCode('');
          setOutput('');
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          return;
        }
        if (data) {
          setSession(data);
          setCode(data.starterCode || code);
          setMinutesLeft(data.minutesRemaining);
          if (data.lastOutput) setOutput(data.lastOutput);
        }
      }).catch(() => {});
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [session]);

  function startLab() {
    if (!topic.trim()) { setError('Pick a topic first'); return; }
    setError(null);
    setIsRunning(true);
    api.get(`/labs/start?topic=${encodeURIComponent(topic.trim())}`)
      .then((res) => {
        const data = res.data;
        setSession(data);
        setCode(data.starterCode || '');
        setOutput('');
        setExpired(false);
        setMinutesLeft(data.ttlMinutes);
        // Navigate to /lab?sessionId=... for reload persistence.
        const url = new URL(window.location.href);
        url.searchParams.set('sessionId', data.sessionId);
        url.searchParams.set('topic', topic.trim());
        window.history.replaceState({}, '', url.toString());
        setIsRunning(false);
      })
      .catch((e) => {
        setError(errorMessage(e, 'Could not start lab'));
        setIsRunning(false);
      });
  }

  async function runCode() {
    if (!code.trim()) return;
    setIsRunning(true);
    setOutput('');
    try {
      // Use the existing Java simulator from the CodeEditor component.
      const sim = await import('../components/JavaSimulator');
      const result = sim.simulateJava(code);
      const out = result.errors && result.errors.length > 0
        ? 'Compilation errors:\n' + result.errors.join('\n')
        : (result.output || '(no output — add System.out.println() to see results)');
      setOutput(out);

      // Persist output server-side if we have a session.
      if (sessionIdRef.current) {
        api.post('/labs/output', { output: out }, {
          params: { sessionId: sessionIdRef.current }
        }).catch(() => {});
      }
    } catch (e) {
      setOutput('Error: ' + e.message);
    } finally {
      setIsRunning(false);
    }
  }

  async function extendSession() {
    if (!sessionIdRef.current) return;
    try {
      await api.post('/labs/extend', null, {
        params: { sessionId: sessionIdRef.current }
      });
      // The status poll will pick up the new expiry automatically.
    } catch (e) {
      setError(errorMessage(e, 'Could not extend session'));
    }
  }

  const topicSuggestions = topics
    .filter((t) => !topic || t.id.toLowerCase().includes(topic.toLowerCase()))
    .slice(0, 8);

  return (
    <div className="page labpage">
      <div className="readbar" style={{ width: 0 }} />
      <div className="crumbs">
        <a href="/">Academy</a> <span>/</span> <span>Practice Lab</span>
      </div>

      <div className="pagehead">
        <h1 className="ptitle">Practice Lab</h1>
        <p className="lede">
          Pick a topic and edit real code from the lesson in your browser.
          Your session lasts <strong>{LAB_TIMEOUT_MINUTES} minutes</strong> and
          the server spins down automatically when time runs out.
        </p>
      </div>

      {session && !expired ? (
        // --- Active lab session ---
        <div className="lab-layout">
          <aside className="lab-sidebar">
            <div className="lab-info-card">
              <div className="lab-topic">{session.lessonTitle}</div>
              {session.moduleId && (
                <div className="lab-module">Module: {session.moduleId}</div>
              )}
              <div className="lab-timer">
                {minutesLeft === null ? (
                  <span>Checking time…</span>
                ) : minutesLeft <= WARNING_AT_MINUTES && minutesLeft > 0 ? (
                  <span className="lab-timer-warn">
                    ⏰ {minutesLeft}m remaining —{' '}
                    <button className="btn ghost small" onClick={extendSession}>
                      +15 min
                    </button>
                  </span>
                ) : minutesLeft > 0 ? (
                  <span>⏱ {minutesLeft} minutes remaining</span>
                ) : (
                  <span className="lab-timer-expired">Session expired</span>
                )}
              </div>
              <div className="lab-session-id">
                Session: <code>{sessionIdRef.current}</code>
              </div>
              <button className="btn ghost full" onClick={() => {
                setSession(null);
                setCode('');
                setOutput('');
                setMinutesLeft(null);
                setExpired(false);
                sessionIdRef.current = null;
              }}>
                End session
              </button>
            </div>

            <div className="lab-topic-picker">
              <h3 className="lab-pick-title">Change topic</h3>
              <input
                className="lab-topic-input"
                placeholder="Search lessons…"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                list="topic-suggestions"
              />
              <datalist id="topic-suggestions">
                {topicSuggestions.map((t) => (
                  <option key={t.id} value={t.id} />
                ))}
              </datalist>
              <button className="btn primary full" onClick={startLab} disabled={isRunning}>
                {isRunning ? 'Starting…' : 'Start new lab'}
              </button>
            </div>
          </aside>

          <main className="lab-workspace">
            <div className="code-editor code-editor-full">
              <div className="code-editor-header">
                <div className="code-editor-tabs">
                  <span className="tab active">Java</span>
                </div>
                <div className="code-editor-actions">
                  <button className="btn-run" onClick={runCode} disabled={isRunning}>
                    {isRunning ? '⏳ Running…' : '▶ Run'}
                  </button>
                </div>
              </div>
              <textarea
                className="code-textarea code-textarea-full"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                spellCheck={false}
                placeholder="// Edit the code below and click Run"
                aria-label="Lab code editor"
              />
            </div>

            {output && (
              <div className="lab-output">
                <div className="lab-output-header">
                  <span>Console Output</span>
                  <button className="btn-icon" onClick={() => setOutput('')}>×</button>
                </div>
                <pre className="output-content">{output}</pre>
              </div>
            )}

            {!output && !isRunning && (
              <div className="lab-hint">
                💡 Edit the code and click <strong>Run</strong> (or press Ctrl+Enter).
                Your output is saved to this session for 30 minutes.
              </div>
            )}
          </main>
        </div>
      ) : expired ? (
        // --- Session expired ---
        <div className="call ok" style={{ marginTop: 40 }}>
          <div className="ct">⏰ Session expired</div>
          <p>Your {LAB_TIMEOUT_MINUTES}-minute lab session has ended. The server spun down
            automatically to free resources.</p>
          <button className="btn primary" onClick={() => {
            setExpired(false);
            setSession(null);
            setCode('');
            setOutput('');
          }}>
            Start a new lab
          </button>
        </div>
      ) : (
        // --- No active session — pick a topic ---
        <div className="lab-start">
          <div className="lab-topic-picker-large">
            <h2 className="lab-start-title">Choose a topic to practice</h2>
            <input
              className="lab-topic-input-large"
              placeholder="e.g. arrays-deep, spring-boot-rest, jwt-auth…"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              list="topic-suggestions-large"
            />
            <datalist id="topic-suggestions-large">
              {topicSuggestions.map((t) => (
                <option key={t.id} value={t.id} />
              ))}
            </datalist>

            {showSuggestions && topicSuggestions.length > 0 && (
              <div className="lab-suggestions">
                {topicSuggestions.map((t) => (
                  <button
                    key={t.id}
                    className="lab-suggestion-btn"
                    onClick={() => { setTopic(t.id); setShowSuggestions(false); }}
                  >
                    <span className="lab-suggestion-id">{t.id}</span>
                    <span className="lab-suggestion-title">{t.title}</span>
                    <span className="lab-suggestion-module">{t.moduleTitle}</span>
                  </button>
                ))}
              </div>
            )}

            <button
              className="btn primary full"
              onClick={startLab}
              disabled={isRunning || !topic.trim()}
            >
              {isRunning ? 'Starting lab…' : topic.trim() ? `Start lab: ${topic}` : 'Pick a topic first'}
            </button>
          </div>

          {error && (
            <div className="call warn">
              <div className="ct">⚠ {error}</div>
            </div>
          )}

          <div className="lab-info">
            <h3>How the lab works</h3>
            <ul>
              <li>Pick a topic (a lesson slug from the curriculum).</li>
              <li>The server loads that lesson's <strong>real code</strong> as your starter —
                not a generic Hello World.</li>
              <li>Edit the code in your browser and click <strong>Run</strong> to see output.</li>
              <li>Your session lasts <strong>{LAB_TIMEOUT_MINUTES} minutes</strong>.
                A countdown timer shows time remaining.</li>
              <li>When time runs out, the server <strong>spins down automatically</strong>.</li>
              <li>If you need more time, click <strong>+15 min</strong> (up to 3 extensions).</li>
              <li>Your output is saved to the session — reload the page and it's still there.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
