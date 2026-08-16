import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const [query, setQuery] = useState(q);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q) {
      setResults([]);
      return;
    }
    setLoading(true);
    api
      .get('/content/search', { params: { q } })
      .then((res) => setResults(res.data))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [q]);

  function submit(e) {
    e.preventDefault();
    setParams({ q: query });
  }

  return (
    <div className="page">
      <div className="pagehead">
        <h1 className="ptitle">Search the curriculum</h1>
        <form className="searchwrap big" onSubmit={submit}>
          <span className="ic">⌕</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="jwt, AOP, virtual threads, RAG, @Transactional…"
            autoFocus
          />
          <button type="submit" className="btn primary small">Search</button>
        </form>
      </div>

      {q && (
        <p className="results-meta">
          {loading ? 'Searching…' : `${results?.length ?? 0} result(s) for “${q}”`}
        </p>
      )}

      <div className="results">
        {results?.map((r) => (
          <Link key={r.lessonId} to={`/lessons/${r.lessonId}`} className="resultcard">
            <div className="rc-head">
              <span className="rc-module">{r.moduleTitle}</span>
              <span className="rc-score">match {Math.round(r.score)}</span>
            </div>
            <h3>{r.title}</h3>
            <p dangerouslySetInnerHTML={{ __html: highlight(r.snippet, q) }} />
          </Link>
        ))}
        {!loading && q && results?.length === 0 && (
          <div className="call info"><div className="ct">No matches</div>
            <p>Try broader terms: “spring”, “security”, “ai”, or browse the curriculum from the sidebar.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function highlight(text, q) {
  if (!q) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const re = new RegExp(`(${q.split(/\s+/).map(escapeRegex).join('|')})`, 'gi');
  return escaped.replace(re, '<mark>$1</mark>');
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
