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
const { recommendBand, nextModuleInBand, explainRecommendation, estimateMinutesLeft, formatMinutes, LEVELS } = mod;

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

console.log('explainRecommendation:');
{
  const fresh = explainRecommendation(mods, {});
  check('fresh-start kind', fresh.kind, 'fresh-start');
  check('fresh-start band', fresh.band, 'foundation');
  check('fresh-start reason mentions no completions', /haven't completed/i.test(fresh.reason), true);

  const mid = explainRecommendation(mods, { a1: 1 });
  check('in-progress kind', mid.kind, 'in-progress');
  check('in-progress counts 1/3 lessons', `${mid.completed}/${mid.total}`, '1/3');
  check('in-progress reason shows counts', /1 lesson into foundation \(3 total\)/.test(mid.reason), true);

  const graduatedBands = explainRecommendation(mods, { a1: 1, a2: 1, b1: 1 });
  check('graduated-foundation mentions finished band', /finished every lesson in foundation/.test(graduatedBands.reason), true);
  check('graduated-foundation recommends expert', graduatedBands.band, 'expert');

  const allDone = explainRecommendation(mods, { a1: 1, a2: 1, b1: 1, c1: 1 });
  check('graduated kind', allDone.kind, 'graduated');
  check('graduated reason counts all 4', /all 4 lessons/.test(allDone.reason), true);

  const loading = explainRecommendation(null, {});
  check('no curriculum → fresh-start foundation', loading.band, 'foundation');

  const plural = explainRecommendation(mods, { a1: 1, a2: 1 });
  check('plural handled', /2 lessons into foundation/.test(plural.reason), true);
}

console.log('estimateMinutesLeft / formatMinutes:')
{
  // fixture lessons get minutes: a1=30, a2=45, b1=20 → foundation total 95, 30 done after a1
  const timed = [
    { module: { id: 'a', level: 'foundation', order: 1 }, lessons: [{ id: 'a1', minutes: 30 }, { id: 'a2', minutes: 45 }] },
    { module: { id: 'b', level: 'foundation', order: 2 }, lessons: [{ id: 'b1', minutes: 20 }] },
    { module: { id: 'c', level: 'expert', order: 3 }, lessons: [{ id: 'c1', minutes: 90 }] },
  ];
  check('all incomplete → 95', estimateMinutesLeft(timed, 'foundation', {}), 95);
  check('one done → 65', estimateMinutesLeft(timed, 'foundation', { a1: 1 }), 65);
  check('band-scoped (expert → 90)', estimateMinutesLeft(timed, 'expert', {}), 90);
  check('all → 185', estimateMinutesLeft(timed, 'all', {}), 185);
  check('band complete → 0', estimateMinutesLeft(timed, 'foundation', { a1: 1, a2: 1, b1: 1 }), 0);
  check('null curriculum → 0', estimateMinutesLeft(null, 'foundation', {}), 0);
  check('missing minutes field counts as 0', estimateMinutesLeft(
    [{ module: { id: 'x', level: 'foundation', order: 1 }, lessons: [{ id: 'x1' }] }], 'foundation', {}), 0);

  check('format 0 → 0m', formatMinutes(0), '0m');
  check('format 45 → 45m', formatMinutes(45), '45m');
  check('format 95 → 1h 35m', formatMinutes(95), '1h 35m');
  check('format 60 → 1h 0m', formatMinutes(60), '1h 0m');
  check('format negative clamps to 0m', formatMinutes(-5), '0m');
}

console.log('misc:');
check('LEVELS order', LEVELS, ['foundation', 'intermediate', 'advanced', 'expert']);

if (failures > 0) {
  console.error(`\n${failures} test(s) FAILED`);
  process.exit(1);
}
console.log('\nall recommendation tests passed');
