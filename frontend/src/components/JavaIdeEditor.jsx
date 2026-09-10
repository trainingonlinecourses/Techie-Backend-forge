import React, { useEffect, useRef, useState } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, crosshairCursor, highlightSpecialChars } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, bracketMatching, foldGutter, indentOnInput, foldKeymap } from '@codemirror/language';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { lintKeymap } from '@codemirror/lint';
import { java } from '@codemirror/lang-java';
import { oneDark } from '@codemirror/theme-one-dark';
import { simulateJava } from './JavaSimulator';

/**
 * JavaIdeEditor — a real IDE-grade code editor in the browser, powered by CodeMirror 6.
 *
 * Replaces the old plain <textarea>: syntax highlighting, bracket auto-closing,
 * auto-indent, code folding, undo history, search, autocompletion (Java language +
 * local identifiers) and Ctrl+Enter to run. Output panel is shared with the
 * JavaSimulator engine — the same engine the lesson pages use.
 */
export default function JavaIdeEditor({
  initialCode = '',
  onChange,
  onRun,
  initialOutput = '',
  readOnly = false,
}) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const readOnlyComp = useRef(new Compartment());
  const [output, setOutput] = useState(initialOutput);
  const [outputKind, setOutputKind] = useState('ok'); // 'ok' | 'error'
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  // Create the CodeMirror instance once.
  useEffect(() => {
    if (!hostRef.current) return undefined;

    const runHere = () => {
      runCode(viewRef.current?.state.doc.toString() ?? '');
      return true; // handled
    };

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: initialCode,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          foldGutter(),
          drawSelection(),
          rectangularSelection(),
          crosshairCursor(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          indentOnInput(),
          java(), // real Java syntax highlighting
          syntaxHighlighting(oneDark, { fallback: true }),
          readOnlyComp.current.of(EditorState.readOnly.of(readOnly)),
          EditorView.editable.of(!readOnly),
          keymap.of([
            { key: 'Mod-Enter', run: runHere },
            indentWithTab,
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...completionKeymap,
            ...lintKeymap,
          ]),
          EditorView.lineWrapping,
          // Report edits upward (parent can persist code per session).
          EditorView.updateListener.of((u) => {
            if (u.docChanged && onChange) onChange(u.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Re-create only when the document is *replaced* (new lesson/lab), not on
    // every parent render — initialCode changes are pushed via the second effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode === '' ? 'empty' : 'doc']);

  // When the parent replaces the code (new starter code, reset), push it in.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (initialCode !== current) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: initialCode },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  useEffect(() => {
    const view = viewRef.current;
    if (view) {
      view.dispatch({
        effects: readOnlyComp.current.reconfigure(EditorState.readOnly.of(readOnly)),
      });
    }
  }, [readOnly]);

  const runCode = async (source) => {
    setIsRunning(true);
    setOutput('');
    try {
      await new Promise((r) => setTimeout(r, 150)); // perceptible compile beat
      const result = simulateJava(source);
      let text;
      if (result.errors && result.errors.length > 0) {
        setOutputKind('error');
        text =
          '✖ Compilation / runtime errors:\n' +
          result.errors.map((e) => '  ' + e).join('\n');
      } else {
        setOutputKind('ok');
        const out = result.output || '';
        text =
          '✔ Compiled successfully\n' +
          '─'.repeat(44) + '\n' +
          (out || '(no output — add System.out.println() to see results)');
      }
      setOutput(text);
      if (onRun) onRun(text);
    } catch (err) {
      setOutputKind('error');
      const text = '✖ Simulator crashed: ' + (err?.message || String(err));
      setOutput(text);
      if (onRun) onRun(text);
    } finally {
      setIsRunning(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(viewRef.current?.state.doc.toString() ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const resetCode = () => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: initialCode },
    });
  };

  const fmtCode = () => {
    const view = viewRef.current;
    if (!view) return;
    const src = view.state.doc.toString();
    // Lightweight re-indenter: normalize indentation to 4-space steps based on braces.
    let depth = 0;
    const formatted = src
      .split('\n')
      .map((raw) => {
        const line = raw.trim();
        if (!line) return '';
        if (line.startsWith('}')) depth = Math.max(0, depth - 1);
        const out = '    '.repeat(depth) + line;
        const opens = (line.match(/{/g) || []).length;
        const closes = (line.match(/}/g) || []).length;
        depth = Math.max(0, depth + opens - closes - (line.startsWith('}') ? 1 : 0));
        return out;
      })
      .join('\n');
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: formatted },
    });
  };

  return (
    <div className="java-ide">
      <div className="java-ide-toolbar">
        <div className="java-ide-title">
          <span className="java-ide-dot" />
          Main.java
          <span className="java-ide-lang">Java 21</span>
        </div>
        <div className="java-ide-actions">
          <button className="java-ide-btn" onClick={fmtCode} title="Re-indent code">⇔ Format</button>
          <button className="java-ide-btn" onClick={resetCode} title="Restore starter code">↺ Reset</button>
          <button className="java-ide-btn" onClick={copyCode} title="Copy to clipboard">
            {copied ? '✓ Copied' : '⧉ Copy'}
          </button>
          <button
            className="java-ide-run"
            onClick={() => runCode(viewRef.current?.state.doc.toString() ?? '')}
            disabled={isRunning}
            title="Ctrl+Enter"
          >
            {isRunning ? '⏳ Running…' : '▶ Run'}
          </button>
        </div>
      </div>

      <div ref={hostRef} className="java-ide-editor" />

      {(output || isRunning) && (
        <div className={`java-ide-output ${outputKind}`}>
          <div className="java-ide-output-head">
            <span>Console</span>
            <button className="java-ide-x" onClick={() => setOutput('')} title="Clear">×</button>
          </div>
          <pre>{output}</pre>
        </div>
      )}
    </div>
  );
}
