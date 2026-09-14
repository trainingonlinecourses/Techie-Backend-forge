#!/usr/bin/env node
/**
 * Unit tests for frontend/src/lib/prereqs.js — prerequisite gating logic.
 * Run: node scripts/test-prereqs.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'src', 'lib', 'prereqs.js'),
  'utf8'
);
const mod = await import(
  'data:text/javascript;base64,' + Buffer.from(src, 'utf8').toString('base64')
);
const { analyzePrereqs, prereqWarning, isGateOpenFor, setGateOpenFor } = mod;

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

const P = (id) => ({ id, title: `Lesson ${id}` });
const lesson = (id, order, prereqIds) => ({ id, moduleId: 'm1', order, prereqs: prereqIds.map(P) });
const done = (...ids) => Object.fromEntries(ids.map((id) => [id, true]));

// Minimal sessionStorage shim — the gate-override helpers degrade gracefully
// without it, but the tests below exercise the real state machine.
const memStore = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
  setItem: (k, v) => memStore.set(k, String(v)),
  removeItem: (k) => memStore.delete(k),
};

console.log('analyzePrereqs:');
check('null lesson → ok', analyzePrereqs(null, {}), { tagged: [], missing: [], skipped: 0, severity: 'ok', gateLocked: false, gateOpen: false });
check('no prereqs → ok', analyzePrereqs(lesson('e', 5, []), {}), { tagged: [], missing: [], skipped: 0, severity: 'ok', gateLocked: false, gateOpen: false });
check('all prereqs completed → ok, tagged kept', analyzePrereqs(lesson('c', 3, ['a', 'b']), done('a', 'b')).severity, 'ok');
check('all prereqs completed → tagged list present', analyzePrereqs(lesson('c', 3, ['a', 'b']), done('a', 'b')).tagged.length, 2);

check('1 missing, no skip → warn', analyzePrereqs(lesson('b', 2, ['a']), {}).severity, 'warn');
check('warn → missing lists the uncompleted prereq', analyzePrereqs(lesson('b', 2, ['a']), {}).missing.map((p) => p.id), ['a']);

// module-local skip counting: lesson e at index 4 of [a,b,c,d,e], prereq = d
const moduleIds = ['a', 'b', 'c', 'd', 'e'];
check('2 skipped in module → warn', analyzePrereqs(lesson('e', 5, ['d']), done('a', 'b'), moduleIds).severity, 'warn');
check('3 skipped in module → gate', analyzePrereqs(lesson('e', 5, ['d']), done('a'), moduleIds).severity, 'gate');
check('gate → locked when not overridden', analyzePrereqs(lesson('e', 5, ['d']), done('a'), moduleIds).gateLocked, true);
check('1 skipped in module → warn not gate', analyzePrereqs(lesson('e', 5, ['d']), done('a', 'b', 'c'), moduleIds).severity, 'warn');

// fallback without module list: skipped = (order-1) - totalCompleted
check('no module list: big global skip → gate', analyzePrereqs(lesson('e', 5, ['d']), done('a')).severity, 'gate');
check('no module list: close skip → warn', analyzePrereqs(lesson('e', 5, ['d']), done('a', 'b', 'c')).severity, 'warn');

console.log('gate override (sessionStorage):');
const gid = 'gate-test-lesson';
check('gate opens after override', (() => {
  setGateOpenFor(gid, true);
  const open = isGateOpenFor(gid);
  setGateOpenFor(gid, false);
  return open;
})(), true);
check('gate closed after override removed', isGateOpenFor(gid), false);

console.log('prereqWarning:');
check('ok → empty string', prereqWarning({ missing: [], severity: 'ok' }), '');
check('1 missing names the lesson', prereqWarning({ missing: [P('a')], severity: 'warn', skipped: 0 }), 'One lesson this one builds on is still uncompleted: “Lesson a”.');
check('2 missing joins both', prereqWarning({ missing: [P('a'), P('b')], severity: 'warn', skipped: 0 }), '2 lessons this one builds on are still uncompleted: “Lesson a” and “Lesson b”.');
check('3+ missing uses the count suffix', prereqWarning({ missing: [P('a'), P('b'), P('c')], severity: 'warn', skipped: 1 }), '3 lessons this one builds on are still uncompleted: “Lesson a” and “Lesson b” and 1 more.');
check('gate wording mentions the jump', prereqWarning({ missing: [P('a')], severity: 'gate', skipped: 4 }), "You've jumped ~4 lessons ahead of your completed path. This lesson builds on “Lesson a”.");

console.log(failures ? `\n${failures} failure(s)` : '\nAll prereq tests pass');
process.exit(failures ? 1 : 0);
