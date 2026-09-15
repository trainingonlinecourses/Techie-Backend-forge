#!/usr/bin/env node
/**
 * Removes ORPHANED walkthrough sections: a "**What this code does — step by
 * step:**" header followed by a numbered list, where NO code block appears
 * before the next heading (the code it described was lost by an earlier
 * transform). The surrounding lesson prose/tables carry the same information.
 *
 * A walkthrough followed by a code block (normal placement) is never touched.
 * Modes: `report` (default) and `apply`. Idempotent.
 *
 * Usage: node scripts/remove-orphan-walkthroughs.mjs [report|apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const lessonsDir = path.join(root, 'backend', 'src', 'main', 'resources', 'content', 'lessons');
const mode = process.argv[2] === 'apply' ? 'apply' : 'report';

const HEADER = /^\*\*What this code does — step by step:\*\*\s*$/;

let removed = 0, filesChanged = 0;
const touched = [];

for (const mod of fs.readdirSync(lessonsDir)) {
  const modDir = path.join(lessonsDir, mod);
  if (!fs.statSync(modDir).isDirectory()) continue;
  for (const file of fs.readdirSync(modDir)) {
    if (!file.endsWith('.md')) continue;
    const fp = path.join(modDir, file);
    const lines = fs.readFileSync(fp, 'utf8').split('\n');
    const drop = new Set();

    for (let i = 0; i < lines.length; i++) {
      if (!HEADER.test(lines[i])) continue;
      // Does a code fence open before the next markdown heading?
      let fenceBeforeHeading = false, j = i + 1;
      for (; j < lines.length; j++) {
        if (/^#{1,6}\s/.test(lines[j])) break;
        if (/^```/.test(lines[j])) { fenceBeforeHeading = true; break; }
      }
      if (fenceBeforeHeading || j === i + 1) continue; // code follows (or file end) — keep

      // Orphan: remove the header + the list/blank lines after it.
      drop.add(i);
      let k = i + 1;
      let sawList = false;
      for (; k < lines.length; k++) {
        const l = lines[k];
        if (l.trim() === '' && !sawList) { drop.add(k); continue; }
        if (/^\d+\.\s/.test(l)) { sawList = true; drop.add(k); continue; }
        if (l.trim() === '' && sawList) {
          // stop at the blank line that ends the list (keep it)
          break;
        }
        break; // any other content ends the list
      }
      removed++;
    }

    if (drop.size > 0) {
      const next = lines.filter((_, idx) => !drop.has(idx)).join('\n');
      if (mode === 'apply') fs.writeFileSync(fp, next);
      filesChanged++;
      touched.push(`${mod}/${file}`);
    }
  }
}

console.log(`Mode: ${mode} — orphaned walkthroughs removed: ${removed} in ${filesChanged} file(s)`);
if (touched.length) console.log('\n' + touched.slice(0, 25).join('\n'));
