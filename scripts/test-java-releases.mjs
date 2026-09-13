#!/usr/bin/env node
/**
 * Validations for frontend/src/lib/javaReleases.js — the timeline data.
 * Run: node scripts/test-java-releases.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- Load the module under test ---
const src = readFileSync(join(root, 'frontend', 'src', 'lib', 'javaReleases.js'), 'utf8');
const { RELEASES, resolveTimeline } = await import(
  'data:text/javascript;base64,' + Buffer.from(src, 'utf8').toString('base64')
);

// --- Load the fallback curriculum (bundled module list) for cross-checks ---
const fbSrc = readFileSync(join(root, 'frontend', 'src', 'fallbackCurriculum.js'), 'utf8');
const fbExports = await import(
  'data:text/javascript;base64,' + Buffer.from(fbSrc, 'utf8').toString('base64')
);
const FALLBACK = fbExports.FALLBACK_CURRICULUM;
const moduleIds = new Set(FALLBACK.map((m) => m.module.id));

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.log(`  ok   ${name}`);
  }
}

console.log('release list integrity:');
check('16 releases (1.0 → 26)', RELEASES.length === 16, `got ${RELEASES.length}`);
const years = RELEASES.map((r) => r.year);
// Java ships two releases a year since 2018, so years are non-decreasing, not strictly increasing.
check('years non-decreasing', years.every((y, i) => i === 0 || y >= years[i - 1]));
check('every release has ≥2 features', RELEASES.every((r) => r.features.length >= 2));
check('every release has a title', RELEASES.every((r) => r.title && r.title.length > 3));

console.log('module links:');
check('all moduleIds exist in the bundled curriculum',
  RELEASES.every((r) => moduleIds.has(r.moduleId)),
  RELEASES.filter((r) => !moduleIds.has(r.moduleId)).map((r) => `${r.v}→${r.moduleId}`).join(', '));

const lts = RELEASES.filter((r) => r.lts).map((r) => r.v);
check('LTS set is 8, 11, 17, 21, 25', JSON.stringify(lts) === JSON.stringify(['8', '11', '17', '21', '25']), lts.join(','));

console.log('resolveTimeline:');
const resolved = resolveTimeline(FALLBACK, { lx1: 1 });
check('returns one row per release', resolved.length === RELEASES.length);
check('all modules found in fallback curriculum', resolved.every((r) => r.exists),
  resolved.filter((r) => !r.exists).map((r) => r.moduleId).join(', '));
check('lesson counts flow through', resolved.every((r) => typeof r.lessonCount === 'number'));
const j26 = resolved.find((r) => r.v === '26');
// The bundled fallback carries stale lesson counts (0s) — the live API replaces them,
// so only existence and linkage are asserted here.
check('Java 26 → java-26 module', j26.exists && j26.moduleId === 'java-26');
check('progress counts flow through', resolved.find((r) => r.v === '26').completed === 0);
check('empty curriculum → all rows still resolve (exists=false)', resolveTimeline([], {}).every((r) => !r.exists));
check('null progress → no crash', resolveTimeline(FALLBACK, null).length === RELEASES.length);

if (failures > 0) {
  console.error(`\n${failures} test(s) FAILED`);
  process.exit(1);
}
console.log('\nall release-timeline tests passed');
