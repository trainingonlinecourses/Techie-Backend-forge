#!/usr/bin/env node
/**
 * Repairs pre-existing content damage: empty ```java fences (which render as
 * empty code boxes), including dangling "same code, clean" markers whose code
 * block was lost by an earlier transform.
 *
 * Usage: node scripts/repair-empty-fences.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const lessonsDir = path.join(root, 'backend/src/main/resources/content/lessons');

// Windows can transiently fail file writes (antivirus/indexer locks). Retry briefly.
function writeWithRetry(p, data, attempts = 4) {
  for (let i = 1; ; i++) {
    try { fs.writeFileSync(p, data); return; } catch (e) {
      if (i >= attempts) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 80);
    }
  }
}

let fixed = 0;
for (const mod of fs.readdirSync(lessonsDir)) {
  const dir = path.join(lessonsDir, mod);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const p = path.join(dir, f);
    const before = fs.readFileSync(p, 'utf8');
    let t = before;
    // dangling "same code, clean" marker + empty java fence
    t = t.replace(/\n[^\n]*same code, clean[^\n]*:\n?\n?```java\n```\n/g, '\n');
    // any other empty java fence: drop just the empty fence pair
    t = t.replace(/```java\n```\n?/g, '');
    if (t !== before) { writeWithRetry(p, t); fixed++; }
  }
}
console.log(`repaired ${fixed} files`);
