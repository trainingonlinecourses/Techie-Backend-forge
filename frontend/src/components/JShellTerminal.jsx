import React, { useEffect, useMemo, useRef, useState } from 'react';
import { simulateJava } from './JavaSimulator';

/**
 * JShellTerminal — a JShell-style REPL for the browser.
 *
 * Unlike the IDE tab (which runs a whole class each time), this works the way
 * real JShell does: you type snippets one at a time, variables PERSIST between
 * entries, and a bare expression echoes its value —
 *
 *   jshell> 2 + 2
 *   $1 ==> 4
 *   jshell> int x = 40
 *   x ==> 40
 *   jshell> x + $1
 *   $2 ==> 44
 *
 * How persistence works without a real JVM: every entry is appended to a
 * session script, and the whole script is re-executed inside a synthetic
 * `main` on each submit. Because execution is deterministic, the response to
 * the NEW entry is the output produced beyond what the prefix produced —
 * so earlier prints don't repeat in the transcript.
 *
 * Slash commands: /help /reset /clear /list /vars
 * Keyboard: Enter submits, ↑/↓ recalls history, Ctrl+L clears the screen,
 * and unbalanced braces continue onto a ...> line like real JShell.
 */

const HISTORY_KEY = 'bf:jshell-history';

// Heuristics for how a snippet line is turned into executable source.
function isControlStart(line) {
  return /^(for|while|if|else|try|switch|do|class|interface|enum|record|method|void|static|public|private|protected)\b/.test(line)
    || /^[{}]/.test(line);
}

function isDeclaration(line) {
  // e.g. `int x = 5`, `String name = "hi"`, `var list = ...`
  return /^(final\s+)?(int|long|double|float|boolean|char|byte|short|String|var)\s+[A-Za-z_$][\w$]*\s*=/.test(line);
}

function declVarName(line) {
  const m = /^(?:final\s+)?(?:int|long|double|float|boolean|char|byte|short|String|var)\s+([A-Za-z_$][\w$]*)\s*=/.exec(line);
  return m ? m[1] : null;
}

// Convert one entered snippet into the source lines appended to the script.
// Echoed values are captured by injecting a println of the expression INTO the
// replay script: earlier printlns re-run inside the prefix (invisible — the
// transcript only shows output beyond the prefix), and the new println lands
// exactly at the end where the diff picks it up as this entry's value.
function snippetToSource(raw) {
  const line = raw.trim();
  if (!line) return { lines: [], echo: null };

  if (line.endsWith(';')) {
    return { lines: [line], echo: null };
  }
  if (isControlStart(line)) {
    return { lines: [line], echo: null };
  }
  // println/print without a semicolon is a statement, not a value to echo —
  // wrapping it would double-print (println(println(...))).
  if (/^System\.out\.print/.test(line)) {
    return { lines: [line + ';'], echo: null };
  }
  if (isDeclaration(line)) {
    // jshell echoes declarations: `x ==> 40`
    const name = declVarName(line);
    return {
      lines: [line + ';', 'System.out.println(' + name + ');'],
      echo: { kind: 'decl', name },
    };
  }
  // Bare expression → evaluate and echo the value (jshell's $1 ==> ... style)
  return {
    lines: ['System.out.println(' + line + ');'],
    echo: { kind: 'expr', source: line },
  };
}

function wrapInMain(scriptLines) {
  return 'public class ReplSession {\n'
    + '    public static void main(String[] args) {\n'
    + scriptLines.map((l) => '        ' + l).join('\n')
    + '\n    }\n'
    + '}';
}

// Rough bracket balance (strings/comments are already handled by the simulator;
// for continuation detection a naive count is enough).
function isBalanced(text) {
  let bal = 0;
  for (const ch of text) {
    if (ch === '{' || ch === '(' || ch === '[') bal++;
    if (ch === '}' || ch === ')' || ch === ']') bal--;
  }
  return bal <= 0;
}

export default function JShellTerminal() {
  const [entries, setEntries] = useState([]); // {kind:'in'|'out'|'err'|'sys', text}
  const [input, setInput] = useState('');
  const [pending, setPending] = useState([]); // multi-line continuation buffer
  const [history, setHistory] = useState([]); // recalled with ↑/↓
  const [histIdx, setHistIdx] = useState(-1);
  // Session state lives in REFS, not state: submit/evaluate run synchronously
  // and must never read a stale batched render (three rapid entries in one tick
  // is a normal REPL burst). Entries are append-only so functional setState is safe.
  const scriptRef = useRef([]);   // accumulated executable lines
  const counterRef = useRef(0);   // jshell-style $1, $2 ...
  const pendingRef = useRef([]);  // continuation lines
  const inputRef = useRef(null);  // DOM node
  const inputValueRef = useRef(''); // mirror of the controlled input value
  const outRef = useRef(null);
  const histRef = useRef([]);
  const histIdxRef = useRef(-1);

  // Restore recall history.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) histRef.current = JSON.parse(raw) || [];
    } catch { /* private mode */ }
  }, []);

  // Keep the transcript scrolled to the bottom.
  useEffect(() => {
    if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight;
  }, [entries]);

  const prompt = pending.length ? '...> ' : 'jshell> ';

  function pushEntry(entry) {
    setEntries((e) => [...e, entry]);
  }

  function resetSession() {
    scriptRef.current = [];
    pendingRef.current = [];
    counterRef.current = 0;
    pushEntry({ kind: 'sys', text: '|  Session reset — variables cleared' });
  }

  function runCommand(cmd) {
    const c = cmd.trim();
    if (c === '/help') {
      pushEntry({ kind: 'sys', text:
        '|  Commands:\n'
        + '|  /list   show the snippets in this session\n'
        + '|  /vars   show declared variables\n'
        + '|  /reset  clear all variables and start over\n'
        + '|  /clear  clear the screen\n'
        + '|  Type any Java snippet. A bare expression echoes its value.\n'
        + '|  Variables persist between entries. ↑/↓ recalls history.' });
    } else if (c === '/list') {
      if (!scriptRef.current.length) { pushEntry({ kind: 'sys', text: '|  (empty session)' }); return; }
      pushEntry({ kind: 'sys', text: scriptRef.current.map((s, i) => `   ${i + 1}  ${s}`).join('\n') });
    } else if (c === '/vars') {
      const decls = [];
      for (const s of scriptRef.current) {
        const name = declVarName(s.replace(/;$/, ''));
        if (name) decls.push(name);
      }
      pushEntry({ kind: 'sys', text: decls.length ? '|  ' + decls.join(', ') : '|  (no variables)' });
    } else if (c === '/reset') {
      resetSession();
    } else if (c === '/clear') {
      setEntries([]);
    } else {
      pushEntry({ kind: 'err', text: `|  Unknown command: ${c} — try /help` });
    }
  }

  function evaluate(rawLines) {
    const joined = rawLines.join(' ').trim();
    const { lines, echo } = snippetToSource(joined);
    if (!lines.length) return;

    const prefix = simulateJava(wrapInMain(scriptRef.current));
    const full = simulateJava(wrapInMain([...scriptRef.current, ...lines]));

    // output is a STRING of accumulated println lines; the response to this
    // entry is whatever appears beyond the prefix's output. errors is an array.
    const prefixOut = prefix.output || '';
    const fullOut = full.output || '';
    const newOut = fullOut.slice(prefixOut.length).replace(/^\n/, '');
    const newErr = (full.errors || []).slice((prefix.errors || []).length);

    if (newErr.length) {
      pushEntry({ kind: 'err', text: newErr.join('\n') });
      // Failed snippets are NOT added to the script (like jshell, which
      // rejects broken snippets without polluting the session).
      return;
    }

    let response = '';
    if (echo && echo.kind === 'decl') {
      response = `${echo.name} ==> ${newOut || '?'}`;
    } else if (echo && echo.kind === 'expr') {
      response = `$${counterRef.current + 1} ==> ${newOut || '(void)'}`;
    } else {
      response = newOut;
    }

    // The println wrapper lines stay in the script (see snippetToSource):
    // replays re-print old values inside the prefix where the diff ignores them.
    scriptRef.current = [...scriptRef.current, ...lines];
    if (echo && echo.kind === 'expr') counterRef.current += 1;

    pushEntry({ kind: response ? 'out' : 'sys', text: response || '|  ok' });
  }

  function submit() {
    const text = inputValueRef.current;
    setInput('');
    inputValueRef.current = '';
    if (!text.trim() && !pendingRef.current.length) return;

    // Command mode
    if (text.trim().startsWith('/') && !pendingRef.current.length) {
      pushEntry({ kind: 'in', text });
      runCommand(text);
      remember(text);
      return;
    }

    const next = [...pendingRef.current, text];
    if (!isBalanced(next.join(' '))) {
      pendingRef.current = next;
      setPending(next);
      return;
    }
    pushEntry({ kind: 'in', text: pendingRef.current.length ? next.join('\n') : text });
    pendingRef.current = [];
    setPending([]);
    evaluate(next);
    remember(text);
  }

  function remember(text) {
    if (!text.trim()) return;
    const next = [...histRef.current.filter((x) => x !== text), text].slice(-100);
    histRef.current = next;
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const h = histRef.current;
      if (!h.length) return;
      const idx = histIdxRef.current < 0 ? h.length - 1 : Math.max(0, histIdxRef.current - 1);
      histIdxRef.current = idx;
      setInput(h[idx]);
      inputValueRef.current = h[idx];
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const h = histRef.current;
      if (histIdxRef.current < 0) return;
      const idx = histIdxRef.current + 1;
      const v = idx >= h.length ? '' : h[idx];
      histIdxRef.current = idx >= h.length ? -1 : idx;
      setInput(v);
      inputValueRef.current = v;
    } else if (e.key === 'l' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setEntries([]);
    }
  }

  const greeting = useMemo(() => ([
    { kind: 'sys', text: '|  Welcome to JShell — browser edition (runs on the academy simulator)' },
    { kind: 'sys', text: '|  Type a Java snippet and press Enter. /help for commands.' },
  ]), []);

  return (
    <div className="java-ide jshell-terminal" onClick={() => inputRef.current?.focus()}>
      <div className="java-ide-toolbar">
        <div className="java-ide-title">
          <span className="java-ide-dot" />
          JShell
          <span className="java-ide-lang">REPL</span>
        </div>
        <div className="java-ide-actions">
          <button className="java-ide-btn" onClick={(e) => { e.stopPropagation(); runCommand('/reset'); }} title="Clear all variables">↺ Reset</button>
          <button className="java-ide-btn" onClick={(e) => { e.stopPropagation(); runCommand('/help'); }} title="Commands">? Help</button>
        </div>
      </div>

      <div className="jshell-out" ref={outRef}>
        {greeting.map((g, i) => <pre key={'g' + i} className="jshell-sys">{g.text}</pre>)}
        {entries.map((en, i) => (
          <pre key={i} className={
            en.kind === 'in' ? 'jshell-in'
              : en.kind === 'err' ? 'jshell-err'
                : en.kind === 'sys' ? 'jshell-sys' : 'jshell-out-line'
          }>{en.kind === 'in' ? 'jshell> ' + en.text : en.text}</pre>
        ))}
      </div>

      <div className="jshell-inputrow">
        <span className="jshell-prompt">{prompt}</span>
        <input
          ref={inputRef}
          className="jshell-input"
          value={input}
          onChange={(e) => { setInput(e.target.value); inputValueRef.current = e.target.value; }}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
          placeholder={'e.g.  int x = 5   |   x * 2   |   System.out.println("hi")'}
        />
      </div>
    </div>
  );
}
