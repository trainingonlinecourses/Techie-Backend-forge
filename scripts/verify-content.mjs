#!/usr/bin/env node
/**
 * Content-integrity gate — run in CI so broken curriculum can never merge.
 *
 * Checks:
 *   1. modules.json: strictly sequential unique orders (1..N), valid levels,
 *      a lesson directory per module, required metadata fields.
 *   2. Lessons: front matter with title/summary/order, unique order per module,
 *      balanced code fences, no empty ```java fences, a References section.
 *   3. Global lesson-slug uniqueness (lesson ids are global; duplicate files
 *      silently overwrite each other in the database).
 *
 * Usage: node scripts/verify-content.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const contentDir = path.join(root, 'backend/src/main/resources/content');

const errors = [];
const fail = (msg) => errors.push(msg);

// ---------- 1. modules.json ----------
const modulesPath = path.join(contentDir, 'modules.json');
let modules;
try {
  modules = JSON.parse(fs.readFileSync(modulesPath, 'utf8'));
} catch (e) {
  console.error(`modules.json is not valid JSON: ${e.message}`);
  process.exit(1);
}

const VALID_LEVELS = new Set(['foundation', 'intermediate', 'advanced', 'expert']);
const orders = modules.map((m) => m.order);
modules.forEach((m, i) => {
  if (m.order !== i + 1) fail(`modules.json: order gap — position ${i + 1} has order ${m.order} (${m.id})`);
  if (!m.id) fail(`modules.json: module at position ${i + 1} has no id`);
  if (!m.title) fail(`modules.json: ${m.id || i + 1} has no title`);
  if (!VALID_LEVELS.has(m.level)) fail(`modules.json: ${m.id} has invalid level "${m.level}"`);
  if (!m.docsUrl) fail(`modules.json: ${m.id} has no docsUrl`);
});
if (new Set(orders).size !== orders.length) fail('modules.json: duplicate order values');

// ---------- 2. lessons ----------
const seenSlugs = new Map();
let lessonCount = 0;

for (const m of modules) {
  const dir = path.join(contentDir, 'lessons', m.id);
  if (!fs.existsSync(dir)) {
    fail(`module "${m.id}" has no lessons directory`);
    continue;
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  if (files.length === 0) fail(`module "${m.id}" has no lessons`);

  const moduleOrders = [];
  for (const f of files) {
    lessonCount++;
    const slug = f.replace(/\.md$/, '');
    const rel = `lessons/${m.id}/${f}`;

    if (seenSlugs.has(slug)) {
      fail(`duplicate lesson slug "${slug}": ${rel} collides with ${seenSlugs.get(slug)} (lesson ids are global — one silently overwrites the other)`);
    } else {
      seenSlugs.set(slug, rel);
    }

    const text = fs.readFileSync(path.join(dir, f), 'utf8');

    // front matter
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    if (!fm) {
      fail(`${rel}: missing front matter`);
      continue;
    }
    const meta = fm[1];
    for (const key of ['title', 'summary', 'order', 'minutes']) {
      if (!new RegExp(`(?:^|\\n)${key}:\\s*\\S`).test(meta)) fail(`${rel}: front matter missing "${key}"`);
    }
    const om = /(?:^|\n)order:\s*(\d+)/.exec(meta);
    if (om) moduleOrders.push(+om[1]);

    // fences balanced
    const fences = (text.match(/^\s*```/gm) || []).length;
    if (fences % 2 !== 0) fail(`${rel}: unbalanced code fences (${fences})`);

    // empty java fences
    if (/```java\r?\n\s*```/.test(text)) fail(`${rel}: empty java code fence`);

    // references section
    if (!/^##\s*References/mi.test(text)) fail(`${rel}: missing References section`);
  }

  const dup = moduleOrders.filter((o, i) => moduleOrders.indexOf(o) !== i);
  if (dup.length) fail(`module "${m.id}": duplicate lesson order values: ${[...new Set(dup)].join(', ')}`);
}

// ---------- result ----------
if (errors.length) {
  console.error(`\n✖ Content integrity: ${errors.length} problem(s)\n`);
  for (const e of errors.slice(0, 50)) console.error('  - ' + e);
  if (errors.length > 50) console.error(`  … and ${errors.length - 50} more`);
  process.exit(1);
}

console.log(`✓ Content integrity OK: ${modules.length} modules (order 1..${modules.length}), ${lessonCount} lessons, all slugs unique, all fences balanced`);
