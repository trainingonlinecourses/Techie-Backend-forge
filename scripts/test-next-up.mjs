#!/usr/bin/env node
/**
 * Unit tests for frontend/src/lib/nextUp.js — the "Next up" recommendation.
 * Run: node scripts/test-next-up.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'src', 'lib', 'nextUp.js'),
  'utf8'
);
const mod = await import(
  'data:text/javascript;base64,' + Buffer.from(src, 'utf8').toString('base64')
);
const { nextUpLesson } = mod;

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.error(`  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  } else {
    console.log(`  ok   ${name}`);
  }
}

const L = (id, order) => ({ id, order, moduleId: 'm1', moduleTitle: 'Module 1' });
const curriculum = [
  { module: { id: 'm1', title: 'Module 1' }, lessons: [L('a1', 1), L('a2', 2), L('a3', 3)] },
  { module: { id: 'm2', title: 'Module 2' }, lessons: [{ id: 'b1', order: 1, moduleId: 'm2', moduleTitle: 'Module 2' }] },
];

console.log('nextUpLesson:');
check('mid-module → next lesson in same module', nextUpLesson(curriculum, 'a1')?.id, 'a2');
check('mid-module → not wrapped', nextUpLesson(curriculum, 'a1')?.wrapped, false);
check('module end → first lesson of next module', nextUpLesson(curriculum, 'a3')?.id, 'b1');
check('module end → wrapped=true', nextUpLesson(curriculum, 'a3')?.wrapped, true);
check('module end → carries next module title', nextUpLesson(curriculum, 'a3')?.moduleTitle, 'Module 2');
check('last lesson overall → null', nextUpLesson(curriculum, 'b1'), null);
check('unknown lesson → null', nextUpLesson(curriculum, 'nope'), null);
check('null curriculum → null', nextUpLesson(null, 'a1'), null);
check('null lessonId → null', nextUpLesson(curriculum, null), null);

check('completed flag reflects progress', nextUpLesson(curriculum, 'a1', { a2: true })?.completed, true);
check('uncompleted next → completed=false', nextUpLesson(curriculum, 'a1', { a1: true })?.completed, false);

// empty module in between is skipped
const withEmpty = [
  { module: { id: 'm1', title: 'Module 1' }, lessons: [L('a1', 1)] },
  { module: { id: 'm2', title: 'Empty' }, lessons: [] },
  { module: { id: 'm3', title: 'Module 3' }, lessons: [{ id: 'c1', order: 1, moduleId: 'm3', moduleTitle: 'Module 3' }] },
];
check('empty module skipped on roll-over', nextUpLesson(withEmpty, 'a1')?.id, 'c1');
check('roll-over across empty module marks wrapped', nextUpLesson(withEmpty, 'a1')?.wrapped, true);

// summary payloads without moduleTitle still work (module-scoped compare)
const noTitles = [
  { module: { id: 'm1' }, lessons: [{ id: 'x1', order: 1, moduleId: 'm1' }, { id: 'x2', order: 2, moduleId: 'm1' }] },
];
check('missing moduleTitle tolerated', nextUpLesson(noTitles, 'x1')?.id, 'x2');
check('missing moduleTitle → wrapped=false', nextUpLesson(noTitles, 'x1')?.wrapped, false);

console.log(failures ? `\n${failures} failure(s)` : '\nAll next-up tests pass');
process.exit(failures ? 1 : 0);
