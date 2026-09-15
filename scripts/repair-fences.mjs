#!/usr/bin/env node
/**
 * Repairs fence-structure damage in lesson markdown:
 *
 *   P1  fence-split programs — an injected ```java open fence inside a Java
 *       program. Case A: injected open + close pair mid-program → remove both.
 *       Case B: injected open only (next close is the real close) → remove open.
 *   P2  orphan close fences — a bare ``` line whose following lines are prose
 *       (its open was lost) → remove.
 *   P3  prose swallowed as a whole java fence → unwrap to prose.
 *   P3b 1–2 line lead-in sentences fenced as java → unwrap.
 *   P4  prose runs INSIDE a long java fence → split the fence around them
 *       (code | ``` | prose | ```java | code).
 *
 * All edits for a file are applied together, then the file is validated
 * (balanced fences, no prose left in java fences); invalid results unwind
 * per-edit until valid or the file is left untouched.
 * Modes: `report` (default) and `apply`. Idempotent.
 *
 * Usage: node scripts/repair-fences.mjs [report|apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const lessonsDir = path.join(root, 'backend', 'src', 'main', 'resources', 'content', 'lessons');
const mode = process.argv[2] === 'apply' ? 'apply' : 'report';

const FENCE = /^```(\w*)\s*$/;

/** A statement fragment that continues code interrupted by an injected fence. */
const isContinuation = (line) =>
  /^\s*\./.test(line) ||
  /^\s*"""/.test(line) ||
  /^\s*(assertThat|andExpect|andReturn|andDo|assertThatThrownBy|mockMvc)\b/.test(line);

/** A line that completes a code unit. */
const finishesCode = (line) => /[;{}]\s*$/.test(line) || /\*\/\s*$/.test(line);

/** A line that looks like more java ("code resumes" vs "prose follows"). */
const looksLikeCode = (line) =>
  isContinuation(line) || finishesCode(line) ||
  /^\s*(public|private|protected|return|@|import|void|int|var|String|if|for|while|try|catch|class|record|interface|enum)\b/.test(line) ||
  /^\s*[)\]}]/.test(line);

/** Markdown prose (strict set — what must never sit inside a java fence). */
const looksLikeProseStrict = (line) =>
  /^\s*(#{1,6}\s|\*\*[^*]+\*\*|>\s|[-*]\s\*\*|\d+\.\s\*\*|\|)/.test(line);

/** Markdown prose inside a swallowed fence (P3 detector, broader). */
const looksLikeProse = (line) =>
  /^\s*(#{1,6}\s|\*\*|[-*]\s|>\s|\|)/.test(line) || /`[^`]+`/.test(line);

/**
 * P3b: a 1–2 line ```java fence holding a prose lead-in sentence.
 */
const isProseLeadIn = (lines) => {
  if (lines.length === 0 || lines.length > 2) return false;
  return lines.every((l) =>
    (l.trim().endsWith(':') || /\s—\s/.test(l)) &&
    !/[{}]/.test(l) && !/\bnew\s|\breturn\s|\bvoid\s/.test(l));
};

/** Consecutive prose runs (with blank lines between) inside a fence buffer. */
function findProseRuns(buf) {
  const runs = [];
  let start = -1;
  for (let i = 0; i < buf.length; i++) {
    const prose = buf[i].trim() === '' || looksLikeProseStrict(buf[i]);
    if (prose && start === -1) start = i;
    if (!prose && start !== -1) {
      // trim trailing blanks off the run
      let end = i;
      while (end > start && buf[end - 1].trim() === '') end--;
      if (end > start) runs.push({ start, end });
      start = -1;
    }
  }
  if (start !== -1) {
    let end = buf.length;
    while (end > start && buf[end - 1].trim() === '') end--;
    if (end > start) runs.push({ start, end });
  }
  return runs;
}

/** Whole-file validation: balanced fences, closed file, no prose in java fences. */
function validateFences(lines) {
  let inFence = false, lang = '', bufHasTextBlock = false;
  for (const line of lines) {
    const m = line.match(FENCE);
    if (m) {
      if (!inFence) { inFence = true; lang = m[1] || ''; bufHasTextBlock = false; }
      else { inFence = false; lang = ''; }
      continue;
    }
    if (inFence && line.includes('"""')) bufHasTextBlock = true;
    // Markdown-shaped string content inside """ text blocks is legitimate code.
    if (inFence && lang === 'java' && !bufHasTextBlock && looksLikeProseStrict(line)) return false;
  }
  return !inFence;
}

/** Pass 1 rewrite: P2/P3/P3b/P4 on one file's lines. Returns [outLines, log]. */
function pass1(lines, totals) {
  const out = [];
  const log = [];
  let pending = null; // { lang, buf }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(FENCE);
    if (m && !pending) {
      pending = { lang: m[1] || '', buf: [] };
      continue;
    }
    if (pending && m) {
      // Close of the pending fence.
      const { lang, buf } = pending;
      pending = null;
      if (lang === 'java') {
        const nonEmpty = buf.filter((l) => l.trim() !== '');
        if (nonEmpty.length > 0 && nonEmpty.every(looksLikeProse)) {
          log.push(`P3 unwrap prose fence (near line ${i + 1})`);
          totals.p3++;
          out.push(...buf);
          continue;
        }
        if (isProseLeadIn(nonEmpty)) {
          log.push(`P3b unwrap lead-in fence (near line ${i + 1})`);
          totals.p3++;
          out.push(...buf);
          continue;
        }
        const runs = findProseRuns(buf);
        // Guard: text blocks (""") legitimately contain markdown-shaped string
        // content (README templates, doc strings). Never split those.
        const isTextBlock = buf.some((l) => l.includes('"""'));
        if (runs.length > 0 && !isTextBlock) {
          log.push(`P4 split ${runs.length} prose run(s) out of java fence (near line ${i + 1})`);
          totals.p4 += runs.length;
          const chunks = [];
          let pos = 0;
          for (const r of runs) {
            chunks.push({ code: buf.slice(pos, r.start) });
            chunks.push({ prose: buf.slice(r.start, r.end) });
            pos = r.end;
          }
          chunks.push({ code: buf.slice(pos) });
          for (const c of chunks) {
            if (c.prose) { out.push(...c.prose); continue; }
            if (c.code.some((l) => l.trim() !== '')) out.push('```java', ...c.code, '```');
          }
          continue;
        }
      }
      out.push(lang ? '```' + lang : '```', ...buf, '```');
      continue;
    }
    if (!pending) {
      // Outside any fence: a bare ``` is an orphan close when prose follows.
      if (/^```\s*$/.test(line)) {
        let k = i + 1;
        while (k < lines.length && lines[k].trim() === '') k++;
        const nextIsProse = k < lines.length && looksLikeProse(lines[k]);
        if (nextIsProse) { log.push(`P2 orphan close at line ${i + 1}`); totals.p2++; continue; }
        // else: legit open of an unlabeled block — keep as pending with lang ''
        pending = { lang: '', buf: [] };
        continue;
      }
      out.push(line);
      continue;
    }
    pending.buf.push(line);
  }
  if (pending) {
    // Unclosed fence at EOF: emit as-is (validator will reject; damage visible).
    out.push(pending.lang ? '```' + pending.lang : '```', ...pending.buf);
  }
  return [out, log];
}

let filesChanged = 0, filesRejected = 0;
const totals = { p1a: 0, p1b: 0, p2: 0, p3: 0, p4: 0 };
const perFile = [];

for (const mod of fs.readdirSync(lessonsDir)) {
  const modDir = path.join(lessonsDir, mod);
  if (!fs.statSync(modDir).isDirectory()) continue;
  for (const file of fs.readdirSync(modDir)) {
    if (!file.endsWith('.md')) continue;
    const fp = path.join(modDir, file);
    const src = fs.readFileSync(fp, 'utf8');
    const [out1, log1] = pass1(src.split('\n'), totals);

    // Pass 2: P1 injected opens on the rewritten lines.
    const base = out1;
    const drops = new Set();
    const candidates = [];
    let inF2 = false;
    for (let i = 0; i < base.length; i++) {
      if (drops.has(i)) continue;
      const line = base[i];
      const m = line.match(FENCE);
      if (m && !inF2) {
        inF2 = true;
        if (m[1] !== 'java') continue;
        const prev = (base[i - 1] ?? '').trim();
        if (prev === '' || prev.startsWith('```') || finishesCode(prev)) continue;
        const next = base[i + 1] ?? '';
        if (!isContinuation(next)) continue;
        let j = -1;
        for (let k = i + 1; k < Math.min(i + 62, base.length); k++) {
          if (drops.has(k)) continue;
          if (/^#{1,6}\s/.test(base[k])) break;
          if (FENCE.test(base[k])) { j = k; break; }
        }
        if (j === -1) continue;
        let k = j + 1;
        while (k < base.length && (drops.has(k) || base[k].trim() === '')) k++;
        const caseA = looksLikeCode(base[k] ?? '');
        candidates.push({ i, j, caseA });
        drops.add(i);
        if (caseA) drops.add(j);
        inF2 = false;
        i = j;
      } else if (inF2 && FENCE.test(line)) {
        inF2 = false;
      }
    }

    const applyDrops = (set) => base.filter((_, i) => !set.has(i));
    let finalSet = new Set(drops);
    if (!validateFences(applyDrops(finalSet))) {
      for (let c = candidates.length - 1; c >= 0; c--) {
        const { i, j, caseA } = candidates[c];
        finalSet.delete(i);
        if (caseA) finalSet.delete(j);
        if (validateFences(applyDrops(finalSet))) break;
      }
    }
    const valid = validateFences(applyDrops(finalSet));
    for (const { i, j, caseA } of candidates) {
      if (!finalSet.has(i)) continue;
      if (caseA) { totals.p1a++; log1.push(`P1 remove split pair`); }
      else { totals.p1b++; log1.push(`P1 remove injected open (close kept)`); }
    }
    if (!valid) {
      filesRejected++;
      perFile.push(`${mod}/${file}\n    REJECTED: ${log1.join('; ') || 'unknown'}`);
      continue;
    }
    const nextLines = applyDrops(finalSet);
    const nextSrc = nextLines.join('\n');
    if (nextSrc !== src) {
      if (mode === 'apply') fs.writeFileSync(fp, nextSrc);
      filesChanged++;
      perFile.push(`${mod}/${file}\n    ${log1.join('\n    ')}`);
    }
  }
}

console.log(`Mode: ${mode}`);
console.log(`P1 pairs: ${totals.p1a}, P1 opens: ${totals.p1b}, P2 orphans: ${totals.p2}, P3 unwraps: ${totals.p3}, P4 splits: ${totals.p4}, files rejected: ${filesRejected}`);
console.log(`Files ${mode === 'apply' ? 'changed' : 'that would change'}: ${filesChanged}`);
if (perFile.length) console.log('\n' + perFile.slice(0, 400).join('\n'));
