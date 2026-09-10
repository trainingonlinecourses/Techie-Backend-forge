#!/usr/bin/env node
/**
 * Simulator smoke-test for the java-1-7 era lessons.
 * Extracts the FIRST ```java block from each lesson markdown and runs it
 * through the browser Java simulator, so the test always reflects exactly
 * what ships in the lesson.
 *
 * Usage: node scripts/test-era-lessons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulateJava } from '../frontend/src/components/JavaSimulator.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const lessonsDir = path.join(root, 'backend/src/main/resources/content/lessons/java-1-7');

const lessons = fs.readdirSync(lessonsDir)
  .filter((f) => f.endsWith('.md'))
  .map((f) => path.join(lessonsDir, f));

if (lessons.length === 0) {
  console.error('No lessons found in', lessonsDir);
  process.exit(1);
}

let failed = 0;
for (const p of lessons) {
  const md = fs.readFileSync(p, 'utf8');
  const blocks = [...md.matchAll(/```java\n([\s\S]*?)```/g)].map((m) => m[1]);
  // The runnable demo is the block with a main method; display-only era
  // snippets (Vector, fork/join shapes, applet lifecycle) have none.
  const main = blocks.find((b) => b.includes('static void main'));
  const title = (md.match(/^title:\s*(.+)$/m) || [, path.basename(p)])[1];
  if (!main) {
    console.log('SKIP  ' + title + ' — no java code block');
    continue;
  }
  try {
    const r = await simulateJava(main);
    if (r && !r.error) {
      console.log(`PASS  ${title}`);
      console.log(`      ${JSON.stringify(r.output ?? r).slice(0, 150)}`);
    } else {
      failed++;
      console.log(`FAIL  ${title} -> ${r && r.error ? r.error : 'no result'}`);
    }
  } catch (e) {
    failed++;
    console.log(`THROW ${title} -> ${String(e.message ?? e).slice(0, 200)}`);
  }
}
console.log(failed === 0 ? 'ALL ERA LESSONS RUN CLEAN' : `${failed} lesson block(s) failed`);
process.exit(failed === 0 ? 0 : 1);
