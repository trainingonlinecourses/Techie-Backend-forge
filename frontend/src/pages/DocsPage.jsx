import React, { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function DocsPage() {
  const [sections, setSections] = useState(null);

  useEffect(() => {
    api.get('/content/docs').then((res) => setSections(res.data)).catch(() => {});
  }, []);

  return (
    <div className="page">
      <div className="pagehead">
        <div className="meta-chips">
          <span className="chip amber">docs.spring.io</span>
          <span className="chip blue">docs.oracle.com</span>
        </div>
        <h1 className="ptitle">Official documentation index</h1>
        <p className="lede">
          Every lesson links to the authoritative reference. This page is the organizational map —
          the same one a professional team uses to navigate Spring, Boot, Security, AI and Java docs.
        </p>
      </div>

      {!sections ? (
        <div className="page-loading">Loading docs index…</div>
      ) : (
        <div className="docsecs">
          {sections.map((s) => (
            <section key={s.title} className="docsec">
              <h2>{s.title}</h2>
              <div className="doclinks">
                {s.links.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="doclink">
                    <div className="dl-title">{l.title} <span className="ext">↗</span></div>
                    <p>{l.description}</p>
                    <span className="dl-url">{l.url.replace(/^https?:\/\//, '')}</span>
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
