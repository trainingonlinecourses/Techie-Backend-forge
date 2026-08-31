import React, { useState, useRef, useEffect } from 'react';

export default function CodePlayground({ initialCode = '', language = 'java', title = 'Try it yourself' }) {
  const [code, setCode] = useState(initialCode);
  const [output, setOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const textareaRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [code]);

  // Basic Java simulator for common patterns
  function simulateRun() {
    setIsRunning(true);
    setOutput('');

    setTimeout(() => {
      try {
        const result = simulateJava(code);
        setOutput(result);
      } catch (e) {
        setOutput(`Error: ${e.message}`);
      } finally {
        setIsRunning(false);
      }
    }, 300);
  }

  // Simple Java code simulator
  function simulateJava(src) {
    const lines = [];
    const vars = {};
    const stdlib = {
      'System.out.println': (msg) => lines.push(String(msg).replace(/^"|"$/g, '')),
      'System.out.print': (msg) => {
        if (lines.length === 0) lines.push('');
        lines[lines.length - 1] += String(msg).replace(/^"|"$/g, '');
      }
    };

    // Extract and execute System.out.println calls
    const printRegex = /System\.out\.print(?:ln)?\(([^)]+)\)/g;
    let match;
    while ((match = printRegex.exec(src)) !== null) {
      let arg = match[1].trim();

      // Handle string literals
      if (arg.startsWith('"') && arg.endsWith('"')) {
        lines.push(arg.slice(1, -1));
      }
      // Handle string concatenation
      else if (arg.includes('+')) {
        const parts = arg.split('+').map(p => p.trim());
        let result = '';
        for (const part of parts) {
          if (part.startsWith('"') && part.endsWith('"')) {
            result += part.slice(1, -1);
          } else if (vars[part] !== undefined) {
            result += vars[part];
          } else {
            result += part;
          }
        }
        lines.push(result);
      }
      // Handle variables
      else if (vars[arg] !== undefined) {
        lines.push(String(vars[arg]));
      }
      // Handle numbers
      else if (!isNaN(arg)) {
        lines.push(arg);
      }
      // Handle method calls like Integer.parseInt
      else if (arg.startsWith('Integer.parseInt')) {
        lines.push(arg);
      }
      else {
        lines.push(arg.replace(/"/g, ''));
      }
    }

    // Extract variable assignments
    const varRegex = /(?:int|long|double|float|String|boolean|char|var)\s+(\w+)\s*=\s*(.+);/g;
    while ((match = varRegex.exec(src)) !== null) {
      const name = match[1];
      let value = match[2].trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        vars[name] = value.slice(1, -1);
      } else if (!isNaN(value)) {
        vars[name] = Number(value);
      } else if (value === 'true') {
        vars[name] = true;
      } else if (value === 'false') {
        vars[name] = false;
      } else {
        vars[name] = value;
      }
    }

    if (lines.length === 0) {
      return '(No output — add System.out.println() to see results)';
    }
    return lines.join('\n');
  }

  function handleKeyDown(e) {
    // Tab to indent
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      setCode(code.substring(0, start) + '  ' + code.substring(end));
      setTimeout(() => {
        e.target.selectionStart = e.target.selectionEnd = start + 2;
      }, 0);
    }
    // Ctrl/Cmd + Enter to run
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      simulateRun();
    }
  }

  return (
    <div className={`code-playground ${isExpanded ? 'expanded' : ''}`}>
      <div className="cp-header">
        <div className="cp-title">
          <span className="cp-icon">▶</span>
          <span>{title}</span>
          <span className="cp-lang">{language}</span>
        </div>
        <div className="cp-actions">
          <button
            className="cp-btn cp-expand"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? '⊡' : '⊞'}
          </button>
          <button
            className="cp-btn cp-reset"
            onClick={() => { setCode(initialCode); setOutput(''); }}
            title="Reset code"
          >
            ↺
          </button>
          <button
            className="cp-btn cp-run"
            onClick={simulateRun}
            disabled={isRunning}
          >
            {isRunning ? '⏳ Running...' : '▶ Run'}
          </button>
        </div>
      </div>

      <div className="cp-editor">
        <div className="cp-line-numbers">
          {code.split('\n').map((_, i) => (
            <span key={i}>{i + 1}</span>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          className="cp-textarea"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          aria-label="Code editor"
        />
      </div>

      <div className="cp-output">
        <div className="cp-output-header">
          <span>📋 Output</span>
          {output && (
            <button className="cp-copy" onClick={() => navigator.clipboard.writeText(output)}>
              Copy
            </button>
          )}
        </div>
        <pre className="cp-output-content">
          {isRunning ? (
            <span className="cp-running">Running...</span>
          ) : output ? (
            output
          ) : (
            <span className="cp-placeholder">Click "▶ Run" or press Ctrl+Enter to execute</span>
          )}
        </pre>
      </div>

      <div className="cp-hint">
        💡 Tip: Edit the code above, then click Run or press <kbd>Ctrl</kbd>+<kbd>Enter</kbd>
      </div>
    </div>
  );
}
