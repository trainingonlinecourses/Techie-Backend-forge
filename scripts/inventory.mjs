#!/usr/bin/env node
/**
 * Dumps the full curriculum inventory for ordering/gap audits.
 * Usage: node scripts/inventory.mjs [verbose]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const base = path.join(root, 'backend/src/main/resources/content/lessons');
const mods = JSON.parse(fs.readFileSync(path.join(root, 'backend/src/main/resources/content/modules.json'), 'utf8'));
const verbose = process.argv[2] === 'verbose' || process.argv[2] === '-V';

function frontmatter(file) {
  const text = fs.readFileSync(file, 'utf8');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fm = {};
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const mm = line.match(/^([\w-]+):\s*(.*)$/);
      if (mm) fm[mm[1]] = mm[2];
    }
  }
  return fm;
}

const lines = [];
for (const mod of mods) {
  const dir = path.join(base, mod.dir || mod.id || mod.slug || '');
  let lessons = [];
  if (fs.existsSync(dir)) {
    lessons = fs.readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => {
        const fm = frontmatter(path.join(dir, f));
        return {
          file: f.replace(/\.md$/, ''),
          title: (fm.title || '').slice(0, 70),
          order: Number(fm.order || 0),
          minutes: Number(fm.minutes || 0),
          level: fm.level || '',
        };
      })
      .sort((a, b) => a.order - b.order);
  }
  const mins = lessons.reduce((s, l) => s + l.minutes, 0);
  lines.push(`${mod.order} | ${mod.level || mod.band || '?'} | ${mod.title || mod.id} [${lessons.length}L / ${mins}m]`);
  if (verbose) {
    for (const l of lessons) {
      lines.push(`    ${String(l.order).padStart(2)}. ${l.title} (${l.minutes}m)${l.level ? ' [' + l.level + ']' : ''}`);
    }
  }
}
fs.writeFileSync(path.join(root, '.freebuff/inventory.txt'), lines.join('\n'));
console.log(`modules: ${mods.length}, lines written: ${lines.length}, total lessons: ${lines.filter((l) => l.trim().startsWith(String(Number(l.split('.')[0])))).length}`);
