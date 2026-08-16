import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import CodeBlock from './CodeBlock.jsx';

/**
 * The academy's markdown renderer. Handles:
 *  - fenced code blocks with copy buttons + syntax highlighting
 *  - GFM tables wrapped for horizontal scroll
 *  - blockquotes styled as callouts
 *  - external links opened in a new tab
 */
export default function Markdown({ children }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre({ children }) {
            const child = React.Children.toArray(children)[0];
            if (child && child.props?.className) {
              return <CodeBlock className={child.props.className}>{child.props.children}</CodeBlock>;
            }
            return <pre>{children}</pre>;
          },
          code({ className, children, ...props }) {
            if (className) return <code className={className} {...props}>{children}</code>;
            return <code className="inline" {...props}>{children}</code>;
          },
          table({ children }) {
            return (
              <div className="tblwrap">
                <table>{children}</table>
              </div>
            );
          },
          a({ href, children }) {
            const external = /^https?:\/\//.test(href || '');
            return (
              <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>
                {children}
              </a>
            );
          },
          h2: ({ children }) => <h2 id={slug(children)}>{children}</h2>,
          h3: ({ children }) => <h3 id={slug(children)}>{children}</h3>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function slug(children) {
  const text = String(children).toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
  return text;
}
