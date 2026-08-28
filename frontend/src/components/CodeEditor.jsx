import React, { useState, useRef, useEffect } from 'react';

// Simple syntax highlighting for Java code
function highlightJava(code) {
  if (!code) return '';
  
  // Keywords
  const keywords = ['public', 'private', 'protected', 'static', 'final', 'class', 'interface',
    'extends', 'implements', 'new', 'return', 'if', 'else', 'for', 'while', 'do', 'switch',
    'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'throws', 'void',
    'int', 'long', 'double', 'float', 'boolean', 'char', 'byte', 'short', 'String',
    'List', 'Map', 'Set', 'Optional', 'Stream', 'var', 'record', 'sealed', 'permits',
    'import', 'package', 'this', 'super', 'true', 'false', 'null', 'instanceof', 'enum'];

  // Highlight keywords
  let highlighted = code.replace(
    new RegExp(`\\b(${keywords.join('|')})\\b`, 'g'),
    '<span class="kw">$1</span>'
  );

  // Highlight strings
  highlighted = highlighted.replace(
    /"(?:[^"\\]|\\.)*"/g,
    '<span class="str">$&</span>'
  );

  // Highlight comments
  highlighted = highlighted.replace(
    /(\/\/.*$)/gm,
    '<span class="cmt">$1</span>'
  );
  highlighted = highlighted.replace(
    /(\/\*[\s\S]*?\*\/)/g,
    '<span class="str">$1</span>'
  );

  // Highlight numbers
  highlighted = highlighted.replace(
    /\b(\d+\.?\d*)\b/g,
    '<span class="num">$1</span>'
  );

  // Highlight annotations
  highlighted = highlighted.replace(
    /@(\w+)/g,
    '<span class="ann">@$1</span>'
  );

  return highlighted;
}

export default function CodeEditor({ initialCode = '', language = 'java', readOnly = false, onChange }) {
  const [code, setCode] = useState(initialCode);
  const [output, setOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const textareaRef = useRef(null);

  useEffect(() => {
    setCode(initialCode);
  }, [initialCode]);

  const handleChange = (e) => {
    const newCode = e.target.value;
    setCode(newCode);
    if (onChange) onChange(newCode);
  };

  const handleKeyDown = (e) => {
    // Tab support
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const newCode = code.substring(0, start) + '    ' + code.substring(end);
      setCode(newCode);
      if (onChange) onChange(newCode);
      // Restore cursor position
      setTimeout(() => {
        e.target.selectionStart = e.target.selectionEnd = start + 4;
      }, 0);
    }
  };

  const runCode = async () => {
    setIsRunning(true);
    setOutput('Running...\n');

    try {
      // Simulate code execution (in real app, this would call a backend API)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Basic Java syntax validation
      const errors = [];
      if (!code.trim()) {
        errors.push('Error: No code to execute');
      }
      if (code.includes('public static void main') && !code.includes('class ')) {
        errors.push('Error: main method must be inside a class');
      }
      
      if (errors.length > 0) {
        setOutput(errors.join('\n'));
      } else {
        setOutput('✓ Code compiled successfully\n\nOutput:\nHello, World!');
      }
    } catch (err) {
      setOutput(`Error: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // clipboard unavailable
    }
  };

  const lines = code.split('\n');
  const lineCount = lines.length;

  return (
    <div className="code-editor">
      <div className="code-editor-header">
        <div className="code-editor-tabs">
          <span className="tab active">{language}</span>
        </div>
        <div className="code-editor-actions">
          <button 
            className="btn-icon" 
            onClick={() => setShowLineNumbers(!showLineNumbers)}
            title="Toggle line numbers"
          >
            {showLineNumbers ? '123' : '#'}
          </button>
          <button className="btn-icon" onClick={copyCode} title="Copy code">
            📋
          </button>
          {!readOnly && (
            <button 
              className="btn-run" 
              onClick={runCode} 
              disabled={isRunning}
            >
              {isRunning ? '⏳' : '▶'} Run
            </button>
          )}
        </div>
      </div>
      
      <div className="code-editor-body">
        {showLineNumbers && (
          <div className="line-numbers">
            {Array.from({ length: lineCount }, (_, i) => (
              <span key={i + 1}>{i + 1}</span>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          className="code-textarea"
          value={code}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          readOnly={readOnly}
          spellCheck="false"
          placeholder="Write your Java code here..."
        />
      </div>

      {output && (
        <div className="code-output">
          <div className="output-header">
            <span>Console Output</span>
            <button className="btn-icon" onClick={() => setOutput('')}>×</button>
          </div>
          <pre className="output-content">{output}</pre>
        </div>
      )}
    </div>
  );
}
