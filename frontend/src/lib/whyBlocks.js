/**
 * Pure helpers for the per-code-block "Show explanation" toggle.
 *
 * A "why block" is the explanation unit that directly follows a fenced code
 * block: the `**What this code shows:**` paragraph and/or the
 * `**What this code does — step by step:**` walkthrough list. Splitting the
 * lesson markdown into alternating markdown/code runs lets the lesson page
 * render each code block with a collapsible explanation attached to it,
 * instead of always dumping every explanation between blocks.
 */

const FENCE_OPEN = /^```(\w*)\s*$/;

/** Split a lesson body into runs: { kind: 'code'|'markdown', lines, lang? }. */
export function splitRuns(markdown) {
  const lines = String(markdown || '').split('\n');
  const runs = [];
  let buf = [];
  let inFence = false, lang = '';
  for (const line of lines) {
    const m = line.match(FENCE_OPEN);
    if (m && !inFence) {
      if (buf.length) runs.push({ kind: 'markdown', lines: buf });
      buf = [];
      inFence = true;
      lang = m[1] || '';
      buf = [line];
      continue;
    }
    if (inFence && /^```\s*$/.test(line)) {
      buf.push(line);
      runs.push({ kind: 'code', lines: buf, lang });
      buf = [];
      inFence = false;
      lang = '';
      continue;
    }
    buf.push(line);
  }
  if (buf.length) runs.push({ kind: inFence ? 'code' : 'markdown', lines: buf, lang });
  return runs;
}

const WHY_TEXT = /\*{0,2}what this code (shows|does)[^\n]*\*{0,2}/i;
const BULLET = /^\s*[-*]\s+/;
const NUMBERED = /^\s*\d+\.\s+/;

/**
 * Which explanation lines belong to the code block just above?
 * A paragraph starting with "What this code…" plus its bullet/numbered list.
 * The first non-explanation line ends the chunk.
 */
export function explanationChunk(lines) {
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i >= lines.length || !WHY_TEXT.test(lines[i].trim())) return { lines: [], consumed: i };
  const chunk = [];
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === '') {
      const next = lines[i + 1] || '';
      if (BULLET.test(next) || NUMBERED.test(next)) { chunk.push(lines[i]); continue; }
      break;
    }
    if (WHY_TEXT.test(t) || BULLET.test(t) || NUMBERED.test(t)) {
      chunk.push(lines[i]);
      continue;
    }
    break;
  }
  while (chunk.length && chunk[chunk.length - 1].trim() === '') chunk.pop();
  return { lines: chunk, consumed: i };
}

/** Render-ready model: markdown items and code items with attached explanations. */
export function buildWhyBlocks(markdown) {
  const runs = splitRuns(markdown);
  const items = [];
  let pending = [];
  const flush = () => {
    if (pending.join('\n').trim() !== '') {
      items.push({ type: 'markdown', markdown: pending.join('\n') });
    }
    pending = [];
  };
  for (let r = 0; r < runs.length; r++) {
    const run = runs[r];
    if (run.kind !== 'code') {
      pending.push(...run.lines);
      continue;
    }
    // Explanation lives at the top of the markdown run that follows the code.
    const after = r + 1 < runs.length && runs[r + 1].kind === 'markdown'
      ? runs[r + 1].lines
      : [];
    const { lines: chunk, consumed } = explanationChunk(after);
    const rest = consumed > 0 ? after.slice(consumed) : after;
    flush();
    items.push({
      type: 'code',
      code: run.lines.join('\n'),
      lang: run.lang,
      explanation: chunk.join('\n'),
    });
    pending.push(...rest);
    if (r + 1 < runs.length && runs[r + 1].kind === 'markdown') r += 1;
  }
  flush();
  return items;
}

/** True when the item is a code block carrying an attachable explanation. */
export function hasExplanation(item) {
  return item.type === 'code' && !!item.explanation && item.explanation.trim().length > 0;
}
