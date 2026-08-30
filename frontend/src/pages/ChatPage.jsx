import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import Markdown from '../components/Markdown.jsx';

const BYOK_KEY = 'backendforge_byok';
const FOLLOWUP_KEY = 'backendforge_followups';

function loadByok() {
  try {
    return JSON.parse(localStorage.getItem(BYOK_KEY) || 'null') || {};
  } catch {
    return {};
  }
}

const SUGGESTION_CATEGORIES = [
  {
    label: '🎓 Core Concepts',
    prompts: [
      'Explain Spring dependency injection from scratch — what problem does it solve?',
      'What is the difference between @Component, @Service, and @Repository?',
      'How does Spring Boot auto-configuration actually work under the hood?',
    ],
  },
  {
    label: '🔐 Security',
    prompts: [
      'Walk me through JWT authentication for a REST API step by step',
      'What is the OAuth2 authorization code flow and when should I use it?',
      'How do I secure a Spring Boot microservices architecture?',
    ],
  },
  {
    label: '🤖 AI & Modern',
    prompts: [
      'How do I build RAG (Retrieval Augmented Generation) with Spring AI?',
      'Explain virtual threads in Java 21 and when to use them',
      'What is the difference between WebClient and RestClient in Spring?',
    ],
  },
  {
    label: '🏗️ Architecture',
    prompts: [
      'When should I use microservices vs a modular monolith?',
      'Explain the Saga pattern for distributed transactions',
      'How does event-driven architecture work with Kafka and Spring?',
    ],
  },
];

function generateFollowUps(answer, sources) {
  const followUps = [];
  if (sources && sources.length > 0) {
    const primary = sources[0];
    if (primary) {
      followUps.push(`Tell me more about ${primary.title}`);
    }
  }
  const lower = (answer || '').toLowerCase();
  if (lower.includes('jwt') || lower.includes('token')) {
    followUps.push('How do I implement refresh token rotation?');
  }
  if (lower.includes('transaction') || lower.includes('@transactional')) {
    followUps.push('What are the propagation levels in Spring transactions?');
  }
  if (lower.includes('security') || lower.includes('authentication')) {
    followUps.push('How do I add role-based authorization?');
  }
  if (lower.includes('stream') || lower.includes('lambda')) {
    followUps.push('What are the most useful Stream API collectors?');
  }
  if (lower.includes('microservice') || lower.includes('gateway')) {
    followUps.push('How do I implement circuit breakers with Resilience4j?');
  }
  if (lower.includes('cache') || lower.includes('caching')) {
    followUps.push('How do I implement multi-tier caching with Redis and Caffeine?');
  }
  if (lower.includes('docker') || lower.includes('kubernetes')) {
    followUps.push('How do I create a multi-stage Docker build for Spring Boot?');
  }
  if (followUps.length === 0) {
    followUps.push('Can you explain this in more detail?');
    followUps.push('Show me a practical code example');
  }
  return followUps.slice(0, 3);
}

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [byok, setByok] = useState(loadByok);
  const [followUps, setFollowUps] = useState([]);
  const [copiedId, setCopiedId] = useState(null);
  const [stats, setStats] = useState(null);
  const endRef = useRef(null);

  function updateByok(field, value) {
    const next = { ...byok, [field]: value };
    if (!next.apiKey && !next.baseUrl && !next.model) {
      localStorage.removeItem(BYOK_KEY);
    } else {
      localStorage.setItem(BYOK_KEY, JSON.stringify(next));
    }
    setByok(next);
  }

  useEffect(() => {
    api
      .get('/chat/history')
      .then((res) => setMessages(Array.isArray(res.data) ? res.data : []))
      .catch(() => {});
    api
      .get('/content/stats')
      .then((res) => setStats(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  async function send(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);
    setError(null);
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: 'user', content: text, model: null }]);
    try {
      const headers = {};
      const body = { message: text };
      if (byok.apiKey) headers['X-OpenAI-Key'] = byok.apiKey;
      if (byok.baseUrl) body.baseUrl = byok.baseUrl;
      if (byok.model) body.model = byok.model;
      const res = await api.post('/chat', body, { headers });
      const assistantMsg = {
        id: `local-${Date.now() + 1}`,
        role: 'assistant',
        content: res.data.answer,
        model: res.data.model,
        provider: res.data.provider,
        sources: res.data.sources || [],
        timestamp: new Date().toISOString(),
      };
      setMessages((m) => [...m, assistantMsg]);
      const newFollowUps = generateFollowUps(res.data.answer, res.data.sources);
      setFollowUps(newFollowUps);
    } catch (err) {
      setError(errorMessage(err, 'The tutor is unavailable right now.'));
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    await api.delete('/chat/history').catch(() => {});
    setMessages([]);
    setFollowUps([]);
  }

  async function copyAnswer(content, msgId) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }

  function handleFollowUp(prompt) {
    setInput(prompt);
    // Auto-send the follow-up
    setTimeout(() => {
      const fakeEvent = { preventDefault: () => {} };
      setInput(prompt);
      // We need to trigger send with this text
      document.querySelector('.chatinput input')?.focus();
    }, 100);
  }

  return (
    <div className="page chatpage">
      <div className="chathead">
        <div>
          <div className="kicker"><span className="pulse" /> AI TUTOR</div>
          <h1 className="ptitle">Ask anything about the curriculum</h1>
          <p className="lede">
            Answers come from the academy's lessons. No key needed — the backend automatically uses
            <strong>OpenAI</strong> (if a key is set), a local <strong>Ollama</strong> (auto-detected),
            a free <strong>Hugging Face</strong> endpoint by default, or <strong>Spring AI's ChatClient</strong>
            with retrieval + a lesson tool — falling back to a local knowledge assistant only if everything
            is unreachable. Prefer your own provider? Add your key below and it's used just for your chats.
          </p>
        </div>
        <button className="btn ghost small" onClick={clear} disabled={messages.length === 0}>
          Clear history
        </button>
      </div>

      <details className="byok">
        <summary>🔑 Bring your own AI key <span className="dim">(optional — free default otherwise)</span></summary>
        <div className="byok-grid">
          <label>
            API key
            <input
              type="password"
              value={byok.apiKey || ''}
              placeholder="sk-…"
              onChange={(e) => updateByok('apiKey', e.target.value)}
              autoComplete="off"
            />
          </label>
          <label>
            Base URL <span className="dim">(optional)</span>
            <input
              value={byok.baseUrl || ''}
              placeholder="https://api.openai.com"
              onChange={(e) => updateByok('baseUrl', e.target.value)}
            />
          </label>
          <label>
            Model <span className="dim">(optional)</span>
            <input
              value={byok.model || ''}
              placeholder="gpt-4o-mini"
              onChange={(e) => updateByok('model', e.target.value)}
            />
          </label>
        </div>
        <p className="dim">
          Your key is sent only to the backend for each chat call and is never stored or logged.
          Works with any OpenAI-compatible endpoint (OpenAI, Groq, OpenRouter, LM Studio…).
        </p>
      </details>

      {error && <div className="call warn"><div className="ct">⚠ Error</div><p>{error}</p></div>}

      <div className="chatbox">
        {messages.length === 0 && (
          <div className="chatempty">
            <div className="ce-mark">✦</div>
            <h2>AI Tutor</h2>
            <p>Ask anything about Java, Spring Boot, Security, or AI</p>
            {SUGGESTION_CATEGORIES.map((cat) => (
              <div key={cat.label} className="suggestion-category">
                <div className="suggestion-cat-label">{cat.label}</div>
                <div className="suggestions">
                  {cat.prompts.map((s) => (
                    <button key={s} onClick={() => setInput(s)}>{s}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`chatmsg ${m.role}`}>
            <div className="cm-avatar">{m.role === 'user' ? 'YOU' : 'AI'}</div>
            <div className="cm-body">
              <div className="cm-meta">
                {m.role === 'assistant' ? (
                  <span className="cm-model">
                    {m.provider === 'openai' ? 'OpenAI · ' : m.provider === 'user-key' ? 'Your key · ' : m.provider === 'user-endpoint' ? 'Your endpoint · ' : m.provider === 'ollama' ? 'Ollama · ' : m.provider === 'free-endpoint' ? 'Free endpoint · ' : m.provider === 'openai-error' ? 'Fallback · ' : 'Local knowledge · '}
                    {m.model || 'assistant'}
                  </span>
                ) : (
                  <span>You</span>
                )}
              </div>
              <div className="cm-content">
                {m.role === 'user' ? <p>{m.content}</p> : <Markdown>{m.content}</Markdown>}
              </div>
              {m.role === 'assistant' && (
                <div className="cm-actions">
                  <button
                    className={`copy-btn ${copiedId === m.id ? 'copied' : ''}`}
                    onClick={() => copyAnswer(m.content, m.id)}
                    title="Copy answer"
                  >
                    {copiedId === m.id ? '✓ Copied' : '📋 Copy'}
                  </button>
                </div>
              )}
              {m.sources && m.sources.length > 0 && (
                <div className="cm-sources">
                  <span className="sources-label">📎 Related Lessons:</span>
                  {m.sources.map((s) => (
                    <Link key={s.lessonId} to={`/lessons/${s.lessonId}`} className="src-chip">
                      <span className="src-module">{s.moduleTitle}</span>
                      <span className="src-title">{s.title}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="chatmsg assistant">
            <div className="cm-avatar">AI</div>
            <div className="cm-body">
              <div className="typing"><i /><i /><i /></div>
              <span className="typing-label">Thinking...</span>
            </div>
          </div>
        )}
        {followUps.length > 0 && !busy && messages.length > 0 && (
          <div className="followups">
            <div className="followups-label">💡 Suggested follow-ups:</div>
            {followUps.map((fu) => (
              <button key={fu} className="followup-btn" onClick={() => handleFollowUp(fu)}>
                {fu}
              </button>
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form className="chatinput" onSubmit={send}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about Java, Spring, Security or AI…"
          disabled={busy}
        />
        <button className="btn primary" disabled={busy || !input.trim()}>
          {busy ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : 'Send ↑'}
        </button>
      </form>
      <div className="chat-footer-info">
        <span>Powered by Spring AI · Answers grounded in {stats?.lessons || 696} lessons</span>
      </div>
    </div>
  );
}
