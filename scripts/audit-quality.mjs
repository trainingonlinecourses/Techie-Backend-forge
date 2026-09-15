#!/usr/bin/env node
/**
 * Lesson body quality audit — structure, runnable examples, comment walls,
 * beginner-friendliness. Read-only: reports findings with evidence, changes nothing.
 *
 * Signals checked per lesson:
 *   Structure    H1 title, H2 section count, References section, length sanity
 *   Code         java fence count, lessons with no code, orphaned walkthroughs
 *                (a "step by step" list whose code block is missing), generated
 *                explanation ratio, non-compiling snippet smells
 *   Comment walls right-side `// ...` comment density per code line (the "comment
 *                wall" pattern the browser simulator strips, losing the teaching)
 *   Beginner     "Beginner mental model" / analogy presence, unexplained jargon
 *                density, wall-of-text detection (paragraphs > 60 words)
 *
 * Usage:
 *   node scripts/audit-quality.mjs [moduleId]        # default: java
 *   node scripts/audit-quality.mjs --all             # every module
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const base = path.join(root, 'backend/src/main/resources/content/lessons');

const REPORT = [];
const fail = (lesson, kind, msg) => REPORT.push({ lesson, kind, msg });

// ---------- fence helpers ----------

function findFences(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const m = /^```(\w*)\s*$/.exec(lines[i]);
    if (m) {
      const lang = m[1].toLowerCase();
      let j = i + 1;
      while (j < lines.length && !/^```\s*$/.test(lines[j])) j++;
      if (j < lines.length) out.push({ open: i, close: j, lang });
      i = j + 1;
    } else i++;
  }
  return out;
}

/** Full program = declares a class (runnable as-is in an IDE / the simulator). */
const isFullProgram = (code) => /\b(class|interface|enum|record)\s+[A-Z]/.test(code);
const hasMain = (code) => /static\s+void\s+main|void\s+main\s*\(/.test(code);

/** Right-side comment wall: code lines carrying a trailing // comment with real content. */
function commentWallStats(code) {
  const codeLines = code.split('\n').filter((l) => l.trim() && !/^\s*\/?[\/*]/.test(l.trim()));
  let walled = 0;
  for (const l of codeLines) {
    const m = l.match(/\/\/\s*(.{8,})$/);
    if (m && m[1].trim().length > 8) walled++;
  }
  const density = codeLines.length ? walled / codeLines.length : 0;
  return { walled, total: codeLines.length, density };
}

/**
 * A walkthrough whose code was lost: a "What this code does" header with no
 * ``` fence anywhere before the next heading (the walkthrough-list-then-clean-
 * block pattern counts — the list may legitimately precede its fence).
 */
function orphanedWalkthroughs(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (/\*\*What this code does[^*]*\*\*/.test(lines[i])) {
      let found = false;
      let j = i + 1;
      while (j < lines.length && !/^#{1,6}\s/.test(lines[j])) {
        if (lines[j].startsWith('```')) { found = true; break; }
        j++;
      }
      if (!found) out.push(i + 1);
    }
  }
  return out;
}

// ---------- per-lesson audit ----------

function auditLesson(rel, text) {
  const hadCRLF = text.includes('\r\n');
  const src = hadCRLF ? text.replace(/\r\n/g, '\n') : text;
  const lines = src.split('\n');

  // strip front matter
  let bodyStart = 0;
  if (lines[0] === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '---') { bodyStart = i + 1; break; }
    }
  }
  const body = lines.slice(bodyStart);

  // ---- structure ----
  if (!body.some((l) => /^# [^#]/.test(l))) fail(rel, 'structure', 'no H1 title in body');
  const h2 = body.filter((l) => /^## /.test(l)).length;
  if (h2 < 3) fail(rel, 'structure', `only ${h2} H2 section(s) — thin structure`);
  if (!/^## References/m.test(body.join('\n'))) fail(rel, 'structure', 'missing References section');
  const wordCount = body.join(' ').split(/\s+/).length;
  if (wordCount < 250) fail(rel, 'structure', `very short body (~${wordCount} words)`);

  // ---- code ----
  const fences = findFences(body).filter((f) => f.lang === 'java');
  if (fences.length === 0) {
    fail(rel, 'code', 'no runnable java example at all');
  } else {
    const full = fences.filter((f) => {
      const code = body.slice(f.open + 1, f.close).join('\n');
      return isFullProgram(code);
    });
    if (full.length === 0) fail(rel, 'code', `${fences.length} snippet(s), none is a full program`);
    // orphaned walkthroughs (explanation without its code block)
    for (const lineNo of orphanedWalkthroughs(body)) {
      fail(rel, 'code', `orphaned "What this code does" walkthrough at line ${bodyStart + lineNo + 1} — its code block is gone`);
    }
    // non-compiling smells in full programs
    for (const f of fences) {
      const code = body.slice(f.open + 1, f.close).join('\n');
      if (isFullProgram(code) && hasMain(code)) {
        const usesP = /\bobj\b|\bprocess\s*\(/.test(code);
        const definesP = /String obj|Object obj|int process|static.*process\s*\(|void process/.test(code);
        if (usesP && !definesP) fail(rel, 'code', `possible non-compiling program at line ${bodyStart + f.open + 1}: uses obj/process without defining them`);
      }
    }
    // generated-explanation coverage (any explanation voice counts)
    const withExpl = fences.filter((f) => {
      const after = body.slice(f.close + 1, f.close + 8).join('\n');
      return /What this code (shows|does)|Line-by-line|step[- ]by[- ]step|walkthrough|How (this|it) works|\*\*Output|breakdown/i.test(after)
        || /^\s*\d+[.)]\s|^\s*[-*+]\s/m.test(after);
    }).length;
    const bare = fences.length - withExpl;
    if (bare > Math.max(2, fences.length * 0.25)) {
      fail(rel, 'code', `${bare}/${fences.length} code blocks have no explanation below`);
    }
  }

  // ---- comment walls ----
  let worst = null;
  for (const f of fences) {
    const code = body.slice(f.open + 1, f.close).join('\n');
    const st = commentWallStats(code);
    if (!worst || st.density > worst.density) worst = { ...st, line: bodyStart + f.open + 1 };
  }
  if (worst && worst.total >= 6 && worst.density >= 0.5) {
    fail(rel, 'walls', `comment wall: ${Math.round(worst.density * 100)}% of code lines carry right-side comments (fence at line ${worst.line})`);
  }

  // ---- beginner-friendliness ----
  const flat = body.join('\n');
  const hasAnchor = /Beginner mental model|Think of (it|this|a) like|analogy|In plain (English|words)|mental model/i.test(flat);
  if (fences.length >= 2 && !hasAnchor) fail(rel, 'beginner', 'no analogy / mental-model anchor anywhere');
  // wall of text: prose paragraphs over ~65 words (lists and indented code excluded)
  const paras = flat.split(/\n\s*\n/).filter((p) => !p.trim().startsWith('```') && !p.trim().startsWith('|') && !/^#/.test(p.trim()) && !/^[<!--]/.test(p.trim()) && !/^ {4,}/.test(p));
  const walls = paras.filter((p) => {
    const lines2 = p.split('\n').filter((l) => l.trim());
    const listish = lines2.filter((l) => /^\s*([-*+]|\d+[.)])\s/.test(l)).length;
    return listish < lines2.length * 0.5 && p.split(/\s+/).length > 65;
  });
  if (walls.length) fail(rel, 'beginner', `${walls.length} wall-of-text paragraph(s) over ~65 words (first: "${walls[0].trim().slice(0, 60)}…")`);
  // unexplained heavy jargon in first 300 words (before any code)
  const intro = body.slice(0, Math.min(30, body.length)).join(' ');
  const jargon = ['monomorphization', 'reification', 'variance', 'ephemeron', 'happens-before', 'monad'];
  const hits = jargon.filter((j) => intro.toLowerCase().includes(j));
  if (hits.length) fail(rel, 'beginner', `jargon in intro without explanation: ${hits.join(', ')}`);
}

// ---------- main ----------

const arg = process.argv[2] || 'java';
const moduleIds = arg === '--all'
  ? fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [arg];

let lessons = 0;
const byKind = {};
for (const modId of moduleIds) {
  const dir = path.join(base, modId);
  if (!fs.existsSync(dir)) { console.error(`unknown module: ${modId}`); process.exit(1); }
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
    lessons++;
    auditLesson(`${modId}/${f}`, fs.readFileSync(path.join(dir, f), 'utf8'));
  }
}
for (const r of REPORT) byKind[r.kind] = (byKind[r.kind] || 0) + 1;

console.log(`Audited ${lessons} lesson(s) in ${moduleIds.length} module(s) — ${REPORT.length} finding(s)\n`);
for (const [kind, n] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${kind}: ${n}`);
}
console.log('');
const KINDS = ['structure', 'code', 'walls', 'beginner'];
for (const kind of KINDS) {
  const rows = REPORT.filter((r) => r.kind === kind);
  if (!rows.length) continue;
  console.log(`== ${kind.toUpperCase()} (${rows.length}) ==`);
  for (const r of rows) console.log(`  ${r.lesson}: ${r.msg}`);
  console.log('');
}
