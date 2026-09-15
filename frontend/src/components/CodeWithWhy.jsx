import React, { useState } from 'react';
import Markdown from './Markdown.jsx';
import CodeBlock from './CodeBlock.jsx';

/**
 * A code block plus its collapsible explanation ("What this code shows /
 * does — step by step"). When no explanation is attached it renders as a
 * plain CodeBlock. The explanation is collapsed by default — the learner can
 * try to predict what the code does first, then reveal the walkthrough.
 */
export default function CodeWithWhy({ code, lang, explanation }) {
  const [open, setOpen] = useState(false);
  const has = explanation && explanation.trim().length > 0;
  if (!has) return <CodeBlock className={`language-${lang || 'text'}`}>{code}</CodeBlock>;

  return (
    <div className="cww">
      <CodeBlock className={`language-${lang || 'text'}`}>{code}</CodeBlock>
      <button
        type="button"
        className={`cww-toggle${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={undefined}
      >
        <span className="cww-chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
        {open ? 'Hide explanation' : 'Show explanation'}
      </button>
      {open && (
        <div className="cww-body">
          <Markdown>{explanation}</Markdown>
        </div>
      )}
    </div>
  );
}
