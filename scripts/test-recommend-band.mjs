#!/usr/bin/env node
/**
 * Unit tests for frontend/src/lib/bands.js — recommendation logic.
 * Run: node scripts/test-recommend-band.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'src', 'lib', 'bands.js'),
  'utf8'
);
// Load the pure ESM helpers without touching React/JSX tooling.
const mod = await import(
  'data:text/javascript;base64,' + Buffer.from(src, 'utf8').toString('base64')
);
const { recommendBand, nextModuleInBand, LEVELS } = mod;

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

// Tiny fixture curriculum: 2 bands, 2 modules, 4 lessons.
const mods = [
  { module: { id: 'a', level: 'foundation', order: 1 }, lessons: [{ id: 'a1' }, { id: 'a2' }] },
  { module: { id: 'b', level: 'foundation', order: 2 }, lessons: [{ id: 'b1' }] },
  { module: { id: 'c', level: 'expert', order: 3 }, lessons: [{ id: 'c1' }] },
];

console.log('recommendBand:');
check('guest (no progress) → foundation', recommendBand(mods, {}), 'foundation');
check('null curriculum → foundation', recommendBand(null, {}), 'foundation');
check('mid-band → same band', recommendBand(mods, { a1: 1, a2: 1 }), 'foundation');
check('band complete → next band', recommendBand(mods, { a1: 1, a2: 1, b1: 1 }), 'expert');
check('everything done → null', recommendBand(mods, { a1: 1, a2: 1, b1: 1, c1: 1 }), null);

console.log('nextModuleInBand:');
check('inside a band → first incomplete lesson',
  nextModuleInBand(mods, 'foundation', { a1: 1 }),
  { module: mods[0].module, lesson: { id: 'a2' } });
check('all → first incomplete overall',
  nextModuleInBand(mods, 'all', { a1: 1, a2: 1 }),
  { module: mods[1].module, lesson: { id: 'b1' } });
check('band fully done → null', nextModuleInBand(mods, 'foundation', { a1: 1, a2: 1, b1: 1 }), null);
check('unknown level → treated as all',
  nextModuleInBand(mods, 'zzz', { a1: 1 }),
  { module: mods[0].module, lesson: { id: 'a2' } });
check('empty curriculum → null', nextModuleInBand([], 'foundation', {}), null);

console.log('misc:');
check('LEVELS order', LEVELS, ['foundation', 'intermediate', 'advanced', 'expert']);

if (failures > 0) {
  console.error(`\n${failures} test(s) FAILED`);
  process.exit(1);
}
console.log('\nall recommendation tests passed');
