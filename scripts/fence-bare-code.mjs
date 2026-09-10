#!/usr/bin/env node
/**
 * Fences bare (unfenced) Java code blocks in lesson markdown.
 *
 * Problem: many lessons contain Java code as plain paragraphs — no ```java fence —
 * so it renders unstyled, gets no syntax highlighting, and the interactive
 * practice editor can't extract it.
 *
 * Detection (outside existing fenced blocks):
 *   - a line is CODE-ISH when it starts with a Java keyword/modifier/annotation,
 *     or contains { ; } with no inline `backtick` spans, or is an import/package,
 *     or starts with 4+ spaces while looking like code.
 *   - consecutive code-ish lines merge into one block (blank lines inside kept).
 *   - a block becomes fenced ONLY if it "looks compilable": balanced braces over
 *     the block, at least one ';' or '}' or '->', no raw `backticks`, and no
 *     markdown decoration. Single-line "snippets" (one statement, e.g. examples
 *     inside a sentence) are left alone unless they clearly start a class/method.
 *
 * Idempotent: runs to a fixed point (already-fenced code is skipped).
 *
 * Usage: node scripts/fence-bare-code.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const lessonsDir = path.join(root, 'backend/src/main/resources/content/lessons');
const dryRun = process.argv.includes('--dry-run');

const CODE_START =
  /^(public|private|protected|class|interface|enum|record|sealed|static|final|abstract|import|package|void|int|long|double|float|boolean|char|byte|short|var|return|if|else|for|while|do|switch|case|default|try|catch|finally|throw|throws|new|this|super|@|\/\/|\/\*|\*\/|\*)/;
const INLINE_BACKTICK = /`[^`]+`/;
const MD_DECOR = /^\s*(#{1,6}\s|[-*+]\s|>\s|\|)/;
const NONCODE_HINT =
  /(\{folder\}|\{\{|\$\{|<\/?[a-z]+>|:\s*:|http:\/\/|https:\/\/|←|→|Module|module-name|path\/to|< lesson)/i;
function looksLikeCodeLine(line) {
  const t = line.trim();
  if (!t) return false;
  if (INLINE_BACKTICK.test(t) && !/^\s{4,}/.test(line)) return false;
  if (MD_DECOR.test(t)) return false;
  // Numbered markdown list items ("3. **text** — sentence") are prose, never code,
  // even when a semicolon sneaks in.
  if (/^\d+\.\s/.test(t)) return false;
  if (NONCODE_HINT.test(t)) return false;
  if (CODE_START.test(t)) return true;
  if (/[{};]/.test(t)) return true;
  return false;
}

function blockIsCode(lines) {
  const text = lines.join('\n');
  const opens = (text.match(/{/g) || []).length;
  const closes = (text.match(/}/g) || []).length;
  if (opens !== closes) return false;
  if (opens === 0 && !/(;|->)/.test(text)) return false;
  if (text.includes('`')) return false;
  if (NONCODE_HINT.test(text)) return false;
  return lines.every((l) => !l.trim() || looksLikeCodeLine(l));
}

function transform(text) {
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  let fenced = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Pass existing fences through untouched.
    if (/^\s*```/.test(line)) {
      out.push(line);
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        out.push(lines[i]);
        i++;
      }
      if (i < lines.length) {
        out.push(lines[i]);
        i++;
      }
      continue;
    }

    if (looksLikeCodeLine(line)) {
      const block = [];
      while (i < lines.length) {
        const l = lines[i];
        if (l.trim() === '') {
          // blank inside a candidate block: peek — keep only if code continues
          const rest = lines.slice(i + 1);
          const nextCode = rest.findIndex((x) => looksLikeCodeLine(x));
          const nextStop = rest.findIndex((x) => x.trim() !== '' && !looksLikeCodeLine(x));
          if (nextCode !== -1 && (nextStop === -1 || nextCode < nextStop)) {
            block.push(l);
            i++;
            continue;
          }
          break;
        }
        if (looksLikeCodeLine(l)) {
          block.push(l);
          i++;
        } else break;
      }
      // trim trailing blanks
      while (block.length && block[block.length - 1].trim() === '') block.pop();
      if (block.length && blockIsCode(block)) {
        out.push('```java', ...block, '```');
        fenced++;
      } else {
        out.push(...block);
      }
      continue;
    }

    out.push(line);
    i++;
  }

  return { text: out.join('\n'), fenced };
}

// ---------------- run ----------------
const mods = JSON.parse(
  fs.readFileSync(path.join(root, 'backend/src/main/resources/content/modules.json'), 'utf8'));
let filesChanged = 0, blocksFenced = 0;

for (const m of mods) {
  const dir = path.join(lessonsDir, m.id);
  let entries;
  try { entries = fs.readdirSync(dir).filter((f) => f.endsWith('.md')); } catch { continue; }
  for (const f of entries) {
    const p = path.join(dir, f);
    const original = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
    const { text, fenced } = transform(original);
    if (fenced > 0 && !dryRun) {
      fs.writeFileSync(p, text);
      filesChanged++;
      blocksFenced += fenced;
    } else if (dryRun && fenced > 0) {
      filesChanged++;
      blocksFenced += fenced;
    }
  }
}

console.log(`${dryRun ? '[dry-run] ' : ''}fenced ${blocksFenced} bare code blocks in ${filesChanged} files`);
