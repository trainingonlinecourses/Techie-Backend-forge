#!/usr/bin/env node
/**
 * Regenerates frontend/src/fallbackCurriculum.js from the canonical
 * backend/src/main/resources/content.
 *
 * Module metadata comes from modules.json; lessonCount and minutes are
 * computed from the lesson files themselves (front-matter `minutes:`), so the
 * fallback can never drift from the real curriculum the way a carried-over
 * count did (it once summed 563 lessons while the curriculum held 792).
 *
 * Usage: node scripts/gen-fallback.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mods = JSON.parse(fs.readFileSync(
  path.join(root, 'backend/src/main/resources/content/modules.json'), 'utf8'));
const lessonsBase = path.join(root, 'backend/src/main/resources/content/lessons');
const fallbackPath = path.join(root, 'frontend/src/fallbackCurriculum.js');

/** Count lessons and sum front-matter minutes for one module directory. */
function moduleStats(moduleId) {
  const dir = path.join(lessonsBase, moduleId);
  if (!fs.existsSync(dir)) return { lc: 0, min: 0 };
  let lc = 0;
  let min = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    lc++;
    const m = /^minutes:\s*(\d+)\s*$/m.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
    min += m ? +m[1] : 10; // same default the backend loader uses
  }
  return { lc, min };
}

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const versionOf = (id) => {
  if (id === 'java') return 'Java SE';
  const m = /^java-(\d+(?:-\d+)?)$/.exec(id);
  return m ? `Java ${m[1].replace('-', '–')}` : null;
};

const entries = mods.map((m) => {
  const { lc, min } = moduleStats(m.id);
  const tech = (m.tech || []).map((t) => `'${esc(t)}'`).join(', ');
  const ver = versionOf(m.id);
  return `  { module: { id: '${esc(m.id)}', title: '${esc(m.title)}', subtitle: '${esc(m.subtitle)}', `
    + `order: ${m.order}, level: '${esc(m.level)}', version: ${ver ? `'${esc(ver)}'` : 'null'}, `
    + `color: '${esc(m.color)}', tech: [${tech}], docsUrl: '${esc(m.docsUrl)}', `
    + `lessonCount: ${lc}, minutes: ${min} }, lessons: [] },`;
});

const out = `// Shown when the API is unreachable (e.g. a static-only deployment) so the
// curriculum still renders. The live backend always replaces this.
// GENERATED from backend/src/main/resources/content/modules.json — regenerate with
// scripts/gen-fallback.mjs rather than editing by hand.
export const FALLBACK_CURRICULUM = [
${entries.join('\n')}
];
`;

fs.writeFileSync(fallbackPath, out);
const totalLessons = entries.reduce((a, e) => a + (+(e.match(/lessonCount: (\d+)/) || [0, 0])[1]), 0);
const totalMinutes = entries.reduce((a, e) => a + (+(e.match(/minutes: (\d+) },/) || [0, 0])[1]), 0);
console.log(`written ${entries.length} entries — ${totalLessons} lessons, ${totalMinutes} minutes`);
