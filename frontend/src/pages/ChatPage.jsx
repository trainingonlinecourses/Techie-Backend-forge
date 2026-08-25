import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import Markdown from '../components/Markdown.jsx';

const BYOK_KEY = 'backendforge_byok';

function loadByok() {
  try {
    return JSON.parse(localStorage.getItem(BYOK_KEY) || 'null') || {};
  } catch {
    return {};
  }
}

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [byok, setByok] = useState(loadByok);
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
      setMessages((m) => [
        ...m,
        {
          id: `local-${Date.now() + 1}`,
          role: 'assistant',
          content: res.data.answer,
          model: res.data.model,
          provider: res.data.provider,
          sources: res.data.sources || [],
        },
      ]);
    } catch (err) {
      setError(errorMessage(err, 'The tutor is unavailable right now.'));
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    await api.delete('/chat/history').catch(() => {});
    setMessages([]);
  }

  return (
    <div className="page chatpage">
      <div className="chathead">
        <div>
          <div className="kicker"><span className="pulse" /> AI TUTOR</div>
          <h1 className="ptitle">Ask anything about the curriculum</h1>
          <p className="lede">
            Answers come from the academy's 581 lessons. No key needed — the backend automatically uses
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
            <p>Try asking:</p>
            <div className="suggestions">
              {[
                'How does @Transactional actually work?',
                'What is the self-invocation trap in Spring AOP?',
                'Explain JWT authentication for a REST API',
                'How do I build RAG with Spring AI?',
                'Why should money never be a double?',
              ].map((s) => (
                <button key={s} onClick={() => setInput(s)}>{s}</button>
              ))}
            </div>
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
              {m.sources && m.sources.length > 0 && (
                <div className="cm-sources">
                  <span>Sources:</span>
                  {m.sources.map((s) => (
                    <Link key={s.lessonId} to={`/lessons/${s.lessonId}`} className="src-chip">
                      {s.title}
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
            </div>
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
          {busy ? '…' : 'Send ↑'}
        </button>
      </form>
    </div>
  );
}
