#!/usr/bin/env node
/**
 * Code-explanation placement fix for ALL lessons (every module).
 *
 * Problem (user-reported): in many lessons the explanation of a code example
 * ("What this code does — step by step:", walkthrough lists, "The code below…")
 * sits ABOVE the ```java block. Learners read the program first, so the
 * explanation belongs AFTER the code. Some blocks also have no explanation at
 * all — only a bare example.
 *
 * What this script does, for every top-level ```java fence in every lesson:
 *   1. MOVE — walks up from the fence and collects the contiguous
 *      "explanation-of-code" chunk (indicator phrases, bold lead-in labels,
 *      walkthrough lists), stopping at headings, other fences, tables and
 *      ordinary theory prose. The chunk is re-inserted immediately BELOW the
 *      closing fence, tagged with an invisible `<!-- why -->` marker.
 *   2. GENERATE — if a fence has no explanation after it (and nothing was
 *      moved there), synthesize a factual "**What this code shows:**" section
 *      from the code itself: classes/methods defined, language features/APIs
 *      used, and what it prints. No invented semantics — only observable facts.
 *
 * Idempotency: the `<!-- why -->` marker marks moved/generated explanations;
 * the upward walk stops at it, so a second run changes nothing (verified).
 * Renderers show comments as nothing; the TTS path strips them.
 *
 * Usage:
 *   node scripts/relocate-explanations.mjs report   # measure only
 *   node scripts/relocate-explanations.mjs apply    # rewrite lesson files
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const base = path.join(root, 'backend/src/main/resources/content/lessons');

const MARK = '<!-- why -->';

/** A line that reads like an explanation OF code (vs. concept theory). */
const INDICATOR =
  /(what (this|the) (code|program|example|snippet) (does|shows|prints|demonstrates))|step[- ]by[- ]step|line[- ]by[- ]line|walkthrough|how (this|the|it) works|the (code|program) (below|above)|this (code|program|snippet|example)|following (code|program|example)|expected output|^\*\*output:?\*\*$|let'?s (walk|trace|break|run)|breakdown|annotated/i;

/** A line below a fence that already reads like an explanation (or the marker). */
const BELOW_EXPL =
  /(<!-- why)|(what this|this (code|program|example|snippet)|explains|how (this|it) works|step[- ]by[- ]step|walkthrough|line[- ]by[- ]line|when (you|this) run|running (this|the)|output)/i;

/** Whole-line bold label like "**What this code does — step by step:**" or "**Output:**". */
const BOLD_LABEL = /^\*\*[^*]{2,90}\*\*\s*:?\s*$/;
const LIST_ITEM = /^(\d+[.)]\s|[-*+]\s)/;
const HEADING = /^#{1,6}\s/;
const TABLE = /^\|/;

// ---------------- fence scanning ----------------

/** Top-level (column-0) fenced blocks; returns [{open, close, lang}] with line indices. */
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

// ---------------- move: collect the chunk above a fence ----------------

/**
 * Walk up from the fence opening and collect the contiguous explanation chunk.
 * Returns [{ i, line }] or null. Stops at: the marker, headings (collected only
 * when they are themselves indicator headings), other fences, tables, theory
 * prose, and non-column-0 regions. Only chunks containing an indicator move.
 */
function collectAbove(lines, openIdx) {
  const collected = [];
  let sawIndicator = false;
  let i = openIdx - 1;
  let guard = 0;
  while (i >= 0 && guard < 60) {
    const t = lines[i].trim();
    if (t === '') { i--; continue; }
    if (t === MARK) break;                    // already-placed explanation
    if (t.startsWith('```')) break;           // previous code block
    if (TABLE.test(t)) break;
    if (HEADING.test(t)) {                    // heading boundary
      if (INDICATOR.test(t)) { collected.unshift({ i, line: lines[i] }); sawIndicator = true; }
      break;
    }
    const isList = LIST_ITEM.test(t);
    const isLabel = BOLD_LABEL.test(t);
    const isIndicator = INDICATOR.test(t);
    if (isIndicator) sawIndicator = true;
    if (!isList && !isLabel && !isIndicator) break;  // ordinary theory — boundary
    collected.unshift({ i, line: lines[i] });
    guard++;
    i--;
  }
  if (!sawIndicator || collected.length === 0) return null;

  // Do not steal a chunk that starts directly under a previous fence close
  // UNLESS it carries an indicator of its own (the walk already ensures the
  // indicator is inside the chunk; this only guards degenerate adjacency).
  return collected;
}

// ---------------- generate: explain a bare code block ----------------

const FEATURES = [
  [/\.stream\(\)|Stream<|Collectors\./, 'the Streams API to process data declaratively'],
  [/Optional</, '`Optional` for null-safe values'],
  [/CompletableFuture/, 'asynchronous composition with `CompletableFuture`'],
  [/Thread\.ofVirtual|virtual thread/i, 'virtual threads'],
  [/new Thread|implements Runnable|extends Thread/, 'manual threading'],
  [/synchronized/, 'synchronization with `synchronized`'],
  [/try\s*{/, 'exception handling with try/catch'],
  [/->/, 'lambda expressions'],
  [/\w\s*::\s*\w/, 'method references'],
  [/\brecord\s+[A-Z]/, 'a `record`'],
  [/\benum\s+[A-Z]/, 'an `enum`'],
  [/\binterface\s+[A-Z]/, 'an interface'],
  [/\bextends\b/, 'inheritance'],
  [/\bimplements\b/, 'interface implementation'],
  [/List</, 'the `List` collection'],
  [/Map</, 'the `Map` collection'],
  [/Set</, 'the `Set` collection'],
  [/new Scanner/, 'console input with `Scanner`'],
  [/String\.format|printf/, 'formatted output'],
  [/Comparator|\.sort\(/, 'sorting with a `Comparator`'],
  [/Pattern\.compile|\.matches\(/, 'regex matching'],
  [/BigDecimal/, '`BigDecimal` for exact decimal math'],
  [/LocalDate|LocalDateTime|Duration/, 'the java.time date-time API'],
  [/Files\.|Paths\.get/, 'file I/O with the NIO API'],
  [/HttpClient/, 'the `HttpClient` API'],
  [/\bvar\s/, 'local type inference with `var`'],
  [/\bswitch\b/, 'switch branching'],
  [/\bfor\s*\(|\bwhile\s*\(|\bdo\s*{/, 'loops'],
  [/if\s*\(|else/, 'conditionals'],
  [/<[A-Z]\w*\s*(,\s*[A-Z]\w*\s*)*>/, 'generics'],
];

/** Factual bullets describing what the code observably does. */
function explainCode(code) {
  const bullets = [];

  const classes = [...code.matchAll(/\b(?:class|interface|enum|record)\s+([A-Z]\w*)/g)]
    .map((m) => m[1]);
  const uniqClasses = [...new Set(classes)];
  if (uniqClasses.length) {
    let b = `Defines ${uniqClasses.slice(0, 2).map((c) => '`' + c + '`').join(' and ')}` +
      (uniqClasses.length > 2 ? ` and ${uniqClasses.length - 2} more type(s)` : '');
    const methods = [...new Set(
      [...code.matchAll(/(?:public|private|protected|static)[\w<>\[\],\s]*?\s([a-z]\w*)\s*\(/g)]
        .map((m) => m[1])
    )].filter((m) => !['if', 'for', 'while', 'switch', 'catch', 'return', 'new'].includes(m));
    if (methods.length && methods.length <= 3) b += ` with methods ${methods.map((m) => '`' + m + '()`').join(', ')}`;
    else if (methods.length) b += ` with ${methods.length} methods`;
    bullets.push(b + '.');
  }

  for (const [re, label] of FEATURES) {
    if (bullets.length >= 4) break;
    if (re.test(code)) bullets.push(`Uses ${label}.`);
  }

  const prints = [...code.matchAll(/System\.out\.print(?:ln|f)?\(\s*"([^"]{3,70})/g)]
    .map((m) => m[1]);
  if (prints.length && bullets.length < 4) {
    const shown = prints.slice(0, 2).map((p) => `“${p.replace(/\\n.*$/, '')}”`).join(', ');
    bullets.push(`When run, it prints: ${shown}${prints.length > 2 ? ' …' : ''}`);
  }
  return bullets.slice(0, 4);
}

// ---------------- per-file transform ----------------

function transform(text) {
  const hadCRLF = text.includes('\r\n');
  const src = hadCRLF ? text.replace(/\r\n/g, '\n') : text;
  let lines = src.split('\n');
  let moves = 0;
  let generated = 0;

  const javaFences = findFences(lines).filter((f) => f.lang === 'java');

  // ---- pass 1: move above-explanations below their fence (bottom-up) ----
  for (const f of [...javaFences].sort((a, b) => b.open - a.open)) {
    const chunk = collectAbove(lines, f.open);
    if (!chunk) continue;
    const idxs = chunk.map((c) => c.i);
    const last = idxs[idxs.length - 1];
    const removal = new Set(idxs);
    // seam cleanup: drop one of the two blank lines that would double up
    if ((lines[idxs[0] - 1] ?? '').trim() === '' && (lines[last + 1] ?? '').trim() === '') {
      removal.add(last + 1);
    }
    const kept = lines.filter((_, i) => !removal.has(i));
    const closeNew = f.close - removal.size;
    // insert after the closing fence: blank, marker, chunk, then keep spacing
    const block = ['', MARK, ...chunk.map((c) => c.line)];
    const after = kept.slice(closeNew + 1);
    if (after.length && after[0].trim() !== '') block.push('');
    lines = [...kept.slice(0, closeNew + 1), ...block, ...after];
    moves++;
  }

  // ---- pass 2: give bare fences an explanation (scan the moved text) ----
  const fences2 = findFences(lines).filter((f) => f.lang === 'java');
  for (const f of [...fences2].sort((a, b) => b.close - a.close)) {
    // region below the fence until the next heading / fence / EOF
    let end = lines.length;
    for (let i = f.close + 1; i < lines.length; i++) {
      const t = lines[i].trim();
      if (HEADING.test(t) || t.startsWith('```')) { end = i; break; }
    }
    const region = lines.slice(f.close + 1, end).filter((l) => l.trim() !== '');
    const hasSignal = region.some((l) => BELOW_EXPL.test(l) || LIST_ITEM.test(l.trim()) || BOLD_LABEL.test(l.trim()));
    if (hasSignal || region.length > 8) continue;

    const code = lines.slice(f.open + 1, f.close).join('\n');
    const bullets = explainCode(code);
    if (!bullets.length) continue;
    const block = ['', MARK, '**What this code shows:**', '', ...bullets.map((b) => '- ' + b)];
    const after = lines.slice(f.close + 1);
    if (after.length && after[0].trim() !== '') block.push('');
    lines = [...lines.slice(0, f.close + 1), ...block, ...after];
    generated++;
  }

  const out = lines.join('\n');
  return { text: hadCRLF ? out.replace(/\n/g, '\r\n') : out, moves, generated };
}

// ---------------- main ----------------

const mode = process.argv[2] === 'apply' ? 'apply' : 'report';
let filesScanned = 0;
let filesChanged = 0;
let totalMoves = 0;
let totalGenerated = 0;
const perModule = new Map();

for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dir = path.join(base, entry.name);
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    filesScanned++;
    const file2 = path.join(dir, file);
    const text = fs.readFileSync(file2, 'utf8');
    const { text: next, moves, generated } = transform(text);
    if (moves || generated) {
      perModule.set(entry.name, (perModule.get(entry.name) || 0) + moves + generated);
      totalMoves += moves;
      totalGenerated += generated;
      filesChanged++;
      if (mode === 'apply') fs.writeFileSync(file2, next);
    }
  }
}

console.log(`${mode === 'apply' ? 'Applied' : 'Would apply'}: ${filesChanged}/${filesScanned} lesson files, ` +
  `${totalMoves} explanation(s) moved below code, ${totalGenerated} explanation(s) generated`);
if (perModule.size) {
  console.log('per-module:');
  for (const [m, n] of [...perModule.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`  ${m}: ${n}`);
  }
}
if (mode === 'apply' && filesChanged === 0) console.log('Already clean — nothing to do.');
