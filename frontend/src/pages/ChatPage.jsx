import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import Markdown from '../components/Markdown.jsx';

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    api
      .get('/chat/history')
      .then((res) => setMessages(res.data))
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
      const res = await api.post('/chat', { message: text });
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
            Answers come from the academy's 73 lessons. No key needed — the backend automatically uses
            <strong>OpenAI</strong> (if a key is set), a local <strong>Ollama</strong> (auto-detected),
            a free <strong>Hugging Face</strong> endpoint by default, or <strong>Spring AI's ChatClient</strong>
            with retrieval + a lesson tool — falling back to a local knowledge assistant only if everything
            is unreachable.
          </p>
        </div>
        <button className="btn ghost small" onClick={clear} disabled={messages.length === 0}>
          Clear history
        </button>
      </div>

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
                    {m.provider === 'openai' ? 'OpenAI · ' : m.provider === 'ollama' ? 'Ollama · ' : m.provider === 'free-endpoint' ? 'Free endpoint · ' : m.provider === 'openai-error' ? 'Fallback · ' : 'Local knowledge · '}
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
