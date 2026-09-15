#!/usr/bin/env node
/**
 * Adds a missing H1 heading to lessons whose body has no H1 outside code
 * fences — derived from the front-matter `title:` (the authoritative name).
 * Inserted as the first body line (after front matter), followed by a blank.
 * Fence-aware: `#` comment lines inside ``` blocks are never treated as H1s.
 * Idempotent; never touches lessons that already have a real H1.
 *
 * Usage: node scripts/add-missing-h1.mjs [report|apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const lessonsDir = path.join(root, 'backend', 'src', 'main', 'resources', 'content', 'lessons');
const mode = process.argv[2] === 'apply' ? 'apply' : 'report';

/** Count real H1s (outside fences) in the body. */
function realH1Count(body) {
  let inFence = false, n = 0;
  for (const line of body.split('\n')) {
    if (/^```/.test(line)) { inFence = !inFence; continue; }
    if (!inFence && /^#\s/.test(line)) n++;
  }
  return n;
}

let added = 0;
const touched = [];

for (const mod of fs.readdirSync(lessonsDir)) {
  const modDir = path.join(lessonsDir, mod);
  if (!fs.statSync(modDir).isDirectory()) continue;
  for (const file of fs.readdirSync(modDir)) {
    if (!file.endsWith('.md')) continue;
    const fp = path.join(modDir, file);
    const src = fs.readFileSync(fp, 'utf8');

    const fm = src.match(/^---\n([\s\S]*?)\n---\n?/);
    if (!fm) continue;
    const bodyStart = fm[0].length;
    const body = src.slice(bodyStart);
    if (realH1Count(body) > 0) continue; // already has a real H1

    const title = fm[1].match(/^title:\s*(.+)$/m);
    if (!title) continue;
    const heading = `# ${title[1].trim().replace(/^["']|["']$/g, '')}`;

    const trimmed = body.replace(/^\n+/, '');
    const next = src.slice(0, bodyStart) + `${heading}\n\n` + trimmed;

    if (next !== src) {
      if (mode === 'apply') fs.writeFileSync(fp, next);
      added++;
      touched.push(`${mod}/${file} -> ${heading}`);
    }
  }
}

console.log(`Mode: ${mode} — H1 headings ${mode === 'apply' ? 'added' : 'to add'}: ${added}`);
if (touched.length) console.log('\n' + touched.slice(0, 20).join('\n'));
