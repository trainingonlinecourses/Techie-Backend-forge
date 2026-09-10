#!/usr/bin/env node
/**
 * Regenerates frontend/src/fallbackCurriculum.js from the canonical
 * backend/src/main/resources/content/modules.json, preserving the
 * lessonCount/minutes of modules already present in the old file.
 *
 * Usage: node scripts/gen-fallback.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mods = JSON.parse(fs.readFileSync(
  path.join(root, 'backend/src/main/resources/content/modules.json'), 'utf8'));
const fallbackPath = path.join(root, 'frontend/src/fallbackCurriculum.js');
const oldSrc = fs.readFileSync(fallbackPath, 'utf8');

// Carry over lessonCount/minutes from the existing fallback where ids match.
const old = new Map();
for (const m of oldSrc.matchAll(/id: '([a-z0-9-]+)'[\s\S]*?lessonCount: (\d+), minutes: (\d+)/g)) {
  old.set(m[1], { lc: +m[2], min: +m[3] });
}

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const versionOf = (id) => {
  if (id === 'java') return 'Java SE';
  const m = /^java-(\d+(?:-\d+)?)$/.exec(id);
  return m ? `Java ${m[1].replace('-', '–')}` : null;
};

const entries = mods.map((m) => {
  const o = old.get(m.id) || { lc: 0, min: 0 };
  const tech = (m.tech || []).map((t) => `'${esc(t)}'`).join(', ');
  const ver = versionOf(m.id);
  return `  { module: { id: '${esc(m.id)}', title: '${esc(m.title)}', subtitle: '${esc(m.subtitle)}', `
    + `order: ${m.order}, level: '${esc(m.level)}', version: ${ver ? `'${esc(ver)}'` : 'null'}, `
    + `color: '${esc(m.color)}', tech: [${tech}], docsUrl: '${esc(m.docsUrl)}', `
    + `lessonCount: ${o.lc}, minutes: ${o.min} }, lessons: [] },`;
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
console.log(`written ${entries.length} entries`);
