#!/usr/bin/env node
/**
 * Lesson revamp: make code examples self-explanatory.
 *
 * Problem this fixes: many lessons contain large ```java blocks where the
 * teaching text lives in `// ...` comments glued to the right of the code (a
 * "comment wall"). The browser simulator strips comments before running, so
 * the wall carries no meaning at runtime, and long right-side comments make
 * code hard to read in the IDE.
 *
 * The transform (per ```java block):
 *   1. Comment wall  ->  a readable "step by step" list (each comment becomes a
 *      numbered step; trailing comments become `code — explanation`), followed
 *      by the same code with comments stripped.
 *   2. Bare runnable block (statements with no class/main wrapper)  ->  wrapped
 *      in `public class Main { public static void main(String[] args) { ... } }`
 *      so it runs as-is in the browser IDE.
 *
 * Usage:
 *   node scripts/lesson-revamp.mjs --dry-run   # report only, no writes
 *   node scripts/lesson-revamp.mjs             # apply
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'backend/src/main/resources/content/lessons');
const DRY = process.argv.includes('--dry-run');

// ---------- helpers ----------

/** Find the first `//` that is not inside a string literal. */
function splitTrailingComment(line) {
  let inStr = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inStr = !inStr;
    else if (ch === '/' && line[i + 1] === '/' && !inStr) {
      return [line.slice(0, i).trimEnd(), line.slice(i + 2).trim()];
    }
  }
  return [line, null];
}

function isPureComment(line) {
  return line.trim().startsWith('//');
}

/** Heuristic: does this block carry a "comment wall"? */
function isCommentWall(lines) {
  let comments = 0;
  for (const line of lines) {
    const [, c] = splitTrailingComment(line);
    if (isPureComment(line) || c) comments++;
  }
  return comments >= 5;
}

/** Does the block look like a runnable snippet (no class/main wrapper)? */
function isBareRunnable(lines) {
  const text = lines.join('\n');
  if (/\bclass\s+\w+/.test(text)) return false;      // already has a class
  if (/public\s+static\s+void\s+main/.test(text)) return false;
  const stmts = lines.filter((l) => {
    const t = l.trim();
    return t && !isPureComment(t) && /;\s*$/.test(t);
  });
  const hasOutput = /System\.out\.(print|println|printf)/.test(text);
  return stmts.length >= 2 && hasOutput;
}

function indentBlock(lines, pad) {
  return lines.map((l) => (l.trim() ? pad + l : l));
}

function wrapInMain(codeLines) {
  // Leading imports stay outside the class (imports are illegal in class bodies).
  const imports = [];
  const body = [...codeLines];
  while (body.length && /^import\b/.test(body[0].trim())) imports.push(body.shift().trim());

  const out = [];
  for (const imp of imports) out.push(imp, '');
  out.push('public class Main {', '', '    public static void main(String[] args) {');
  out.push(...indentBlock(body, '        '));
  out.push('    }', '}');
  return out;
}

/** Convert a comment-walled block into steps + clean code. */
function wallToSteps(lines) {
  const steps = [];
  let pending = null; // { type: 'concept' | 'trailing', text, code, indent }

  const join = (a, b) => {
    if (!a) return b;
    // Join continuation fragments with correct separators.
    if (/[.!?;:]$/.test(a) || b.startsWith('—') || b.startsWith('->')) return a + ' ' + b;
    return a + '. ' + b.charAt(0).toUpperCase() + b.slice(1);
  };

  // End the current pending step (trailing-comment steps continue across lines).
  const flush = (hard) => {
    if (!pending) return;
    if (pending.type === 'concept' || hard) {
      const text = pending.text.replace(/\s+/g, ' ').trim();
      steps.push(pending.type === 'concept'
        ? text
        : '`' + pending.code + '` — ' + text);
      pending = null;
    }
  };

  // Skip meta intros like "Line-by-line explanation:" — the step list replaces it.
  const isMetaIntro = (t) => /^(line[- ]by[- ]line|step[- ]by[- ]step|how (it|this) works|explanation)\b.*:?\s*$/i.test(t);

  const codeLines = [];
  for (const line of lines) {
    const indent = line.match(/^\s*/)[0].length;
    if (!line.trim()) {
      // Blank line: hard-flush (blank lines separate statements) but keep in code.
      flush(true);
      codeLines.push('');
      continue;
    }
    const [code, comment] = splitTrailingComment(line);
    if (isPureComment(line)) {
      const text = line.trim().replace(/^\/\/+\s*/, '');
      if (isMetaIntro(text)) continue;
      // Deep-indented comment = continuation of the step above (Java convention).
      if (pending && indent >= 4) {
        pending.text = join(pending.text, text);
        continue;
      }
      if (pending && pending.type === 'concept') pending.text = join(pending.text, text);
      else { flush(true); pending = { type: 'concept', text }; }
      continue;
    }
    if (comment) {
      // Consecutive trailing-comment lines for the SAME statement continue the step.
      const frag = code.trim();
      if (pending && pending.type === 'trailing' && (!frag || frag === pending.code)) {
        pending.text = join(pending.text, comment);
      } else {
        flush(true);
        pending = { type: 'trailing', code: frag, text: comment };
      }
      codeLines.push(code);
      continue;
    }
    flush(true);
    codeLines.push(code);
  }
  flush(true);

  // Trim leading/trailing blank code lines and collapse >1 blank line to one.
  while (codeLines.length && !codeLines[0].trim()) codeLines.shift();
  while (codeLines.length && !codeLines[codeLines.length - 1].trim()) codeLines.pop();
  const collapsed = [];
  for (const l of codeLines) {
    if (!l.trim() && collapsed.length && !collapsed[collapsed.length - 1].trim()) continue;
    collapsed.push(l);
  }

  const stepLines = ['', '**What this code does — step by step:**', ''];
  steps.forEach((s, i) => stepLines.push(String(i + 1) + '. ' + s));
  stepLines.push('', 'The same code, clean:');

  return { stepLines, codeLines };
}

/** Transform one ```java fenced block. Returns [replacement, statsDelta]. */
function transformBlock(innerLines) {
  const stats = { wrapped: 0, split: 0 };

  // 1) Comment wall -> steps + clean code.
  if (isCommentWall(innerLines)) {
    const { stepLines, codeLines: collapsed } = wallToSteps(innerLines);
    let finalLines = collapsed;
    if (isBareRunnable(collapsed)) finalLines = wrapInMain(collapsed);
    stats.split++;
    if (finalLines !== collapsed) stats.wrapped++;
    return { lines: [...stepLines, '', '```java', ...finalLines, '```'], stats, wrappedBlock: false };
  }

  // 2) Bare runnable block -> wrap in a Main class so it runs in the browser.
  if (isBareRunnable(innerLines)) {
    stats.wrapped++;
    return { lines: wrapInMain(innerLines), stats, wrappedBlock: true };
  }

  return { lines: innerLines, stats, wrappedBlock: false };
}

// ---------- main ----------

function processFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const isCrlf = raw.includes('\r\n');
  const nl = isCrlf ? '\r\n' : '\n';

  // Split off front-matter so we never touch it.
  let fm = '';
  let body = raw;
  if (raw.startsWith('---')) {
    const end = raw.indexOf('---', 4);
    if (end !== -1) {
      fm = raw.slice(0, end + 3);
      body = raw.slice(end + 3);
    }
  }

  // Walk ``` fences; only rewrite ```java blocks. The transform REPLACES the whole
  // block including its fences (the step prose must sit between blocks, not inside
  // the original fence), so the opener is buffered, not pushed immediately.
  const lines = body.split(/\r?\n/);
  const out = [];
  const stats = { wrapped: 0, split: 0 };
  let inFence = false;
  let fenceLang = '';
  let buf = [];

  for (const line of lines) {
    const fenceMatch = /^\s*```(\w*)\s*$/.exec(line);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fenceLang = fenceMatch[1] || '';
        buf = [];
      } else {
        inFence = false;
        if (fenceLang === 'java') {
          const r = transformBlock(buf);
          stats.wrapped += r.stats.wrapped;
          stats.split += r.stats.split;
          out.push(...r.lines);
        } else {
          out.push('```' + fenceLang, ...buf, line);
        }
        buf = [];
      }
      continue;
    }
    if (inFence) buf.push(line);
    else out.push(line);
  }
  // Unterminated fence at EOF — flush as-is to preserve content.
  if (inFence) out.push('```' + fenceLang, ...buf);

  const result = fm + out.join(nl) + (body.endsWith('\n') ? nl : '');
  const changed = result !== raw;
  if (changed && !DRY) fs.writeFileSync(file, result, 'utf8');
  return { changed, ...stats };
}

function walk(dir, files = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, files);
    else if (e.name.endsWith('.md')) files.push(p);
  }
  return files;
}

const files = walk(ROOT);
let touched = 0, wrapped = 0, split = 0;
const touchedList = [];
for (const f of files) {
  const r = processFile(f);
  if (r.changed || (DRY && (r.wrapped || r.split))) {
    touched++;
    touchedList.push(path.relative(process.cwd(), f) + '  (+' + r.split + ' splits, +' + r.wrapped + ' wraps)');
  }
  wrapped += r.wrapped;
  split += r.split;
}

console.log('Scanned ' + files.length + ' lesson files.');
console.log(DRY ? 'DRY RUN — would change ' + touched + ' files' : 'Changed ' + touched + ' files');
console.log('Comment walls split into step-by-step sections: ' + split);
console.log('Bare runnable blocks wrapped in class Main: ' + wrapped);
if (process.argv.includes('--list')) touchedList.forEach((l) => console.log('  ' + l));
