import React, { useState } from 'react';

function languageFrom(className) {
  const m = /language-([\w+-]+)/.exec(className || '');
  return m ? m[1] : 'text';
}

function extractText(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement(node)) return extractText(node.props?.children);
  return '';
}

export default function CodeBlock({ children, className }) {
  const [copied, setCopied] = useState(false);
  const code = extractText(children).replace(/\n$/, '');

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <figure className="codeblock">
      <figcaption>
        <span className="dots">
          <i /><i /><i />
        </span>
        <span className="fname">{languageFrom(className)}</span>
        <span className="lang">{languageFrom(className)}</span>
        <button className={`copybtn ${copied ? 'ok' : ''}`} onClick={copy}>
          {copied ? '✓ copied' : 'copy'}
        </button>
      </figcaption>
      <pre>
        <code className={className}>{code}</code>
      </pre>
    </figure>
  );
}
