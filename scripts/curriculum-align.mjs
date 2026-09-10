#!/usr/bin/env node
/**
 * Curriculum aligner — makes the platform a coherent, version-sorted learning path.
 *
 * What it does (idempotent — safe to run repeatedly):
 *   1. Reads scripts/curriculum.config.json (the canonical learning path).
 *   2. Rewrites backend/src/main/resources/content/modules.json:
 *        - inserts new modules defined in the config (e.g. Java 22–24)
 *        - removes retired modules (duplicate/consolidated content)
 *        - assigns a strictly sequential `order` following the
 *          foundation → intermediate → advanced → expert path
 *        - stamps each module with its `level`
 *   3. Enriches every lesson markdown file with a "References" section that routes
 *      the learner to the best of the 5 curated external sites for that topic
 *      (W3Schools, GeeksforGeeks, dev.java, Codecademy, Learn Java Online) plus the
 *      module's official docs — only when the lesson doesn't already have one.
 *
 * Usage: node scripts/curriculum-align.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'scripts/curriculum.config.json'), 'utf8'));
const modulesPath = path.join(root, 'backend/src/main/resources/content/modules.json');
const lessonsDir = path.join(root, 'backend/src/main/resources/content/lessons');
const dryRun = process.argv.includes('--dry-run');

// ---------- 1. load current modules ----------
const modules = JSON.parse(fs.readFileSync(modulesPath, 'utf8'));
const byId = new Map(modules.map((m) => [m.id, m]));

// ---------- 2. insert new modules / drop retired ----------
for (const nm of cfg.newModules || []) {
  if (!byId.has(nm.id)) {
    byId.set(nm.id, nm);
    console.log(`+ new module: ${nm.id} — ${nm.title}`);
  }
}
for (const rid of cfg.retiredModules || []) {
  if (byId.has(rid)) {
    byId.delete(rid);
    console.log(`- retired module: ${rid}`);
  }
}

// ---------- 3. validate path coverage & assign order + level ----------
const pathIds = [...cfg.levels.foundation, ...cfg.levels.intermediate, ...cfg.levels.advanced, ...cfg.levels.expert];
const dupes = pathIds.filter((id, i) => pathIds.indexOf(id) !== i);
if (dupes.length) throw new Error(`Module listed in multiple levels: ${[...new Set(dupes)].join(', ')}`);
const missing = [...byId.keys()].filter((id) => !pathIds.includes(id));
if (missing.length) throw new Error(`Module(s) not in any level: ${missing.join(', ')}. Add them to curriculum.config.json.`);
const stale = pathIds.filter((id) => !byId.has(id));
if (stale.length) throw new Error(`Config references non-existent module(s): ${stale.join(', ')}`);

const ordered = [];
let order = 1;
for (const [level, ids] of Object.entries(cfg.levels)) {
  for (const id of ids) {
    const m = byId.get(id);
    m.order = order++;
    m.level = level;
    ordered.push(m);
  }
}

// ---------- 4. write modules.json ----------
const json = JSON.stringify(ordered, null, 2) + '\n';
if (!dryRun) fs.writeFileSync(modulesPath, json);
console.log(`modules.json: ${ordered.length} modules, order 1..${order - 1}${dryRun ? ' (dry-run)' : ''}`);

// ---------- 5. lesson references ----------
const refs = cfg.references;
const siteEntries = Object.entries(refs.sites).map(([key, s]) => ({
  key, name: s.name, url: s.url, kw: s.keywords.map((k) => k.toLowerCase()),
}));

function bestSiteFor(text) {
  const t = text.toLowerCase();
  let best = null, bestScore = 0;
  for (const s of siteEntries) {
    let score = 0;
    for (const k of s.kw) if (t.includes(k)) score++;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best || siteEntries.find((s) => s.key === refs.defaultSite);
}

function linkName(url) {
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/$/, '')).slice(0, 80) || u.hostname;
  } catch { return url; }
}

/** Friendly display names for the hosts we link most. */
function friendlyName(url) {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, '');
    if (h === 'w3schools.com') return 'W3Schools — Java Tutorial';
    if (h === 'geeksforgeeks.org') return 'GeeksforGeeks — Java';
    if (h === 'dev.java') return 'dev.java — the official OpenJDK site';
    if (h === 'codecademy.com') return 'Codecademy — Learn Java course';
    if (h === 'learnjavaonline.org') return 'Learn Java Online — interactive exercises';
    if (h === 'inside.java') return 'inside.java — the Java team at Oracle';
    if (/^(docs\.)?oracle\.com$/.test(h) && /javase\/tutorial/.test(u.pathname)) return 'Oracle — The Java™ Tutorials';
    if (/^(docs\.)?oracle\.com$/.test(h) && /\/jeps?\//.test(u.pathname)) {
      const jep = /jeps?\/(\d+)/.exec(u.pathname);
      return jep ? `OpenJDK — JEP ${jep[1]}` : 'OpenJDK — JEP';
    }
    if (/^(docs\.)?oracle\.com$/.test(h)) return 'Oracle — official JDK documentation';
    if (h === 'openjdk.org') {
      const jep = /jeps?\/(\d+)/.exec(u.pathname);
      return jep ? `OpenJDK — JEP ${jep[1]}` : 'OpenJDK';
    }
    return linkName(url);
  } catch { return url; }
}

const refsRe = /^##\s*References/mi;
// Windows can transiently fail file writes (antivirus/indexer locks). Retry briefly.
function writeWithRetry(p, data, attempts = 4) {
  for (let i = 1; ; i++) {
    try { fs.writeFileSync(p, data); return; } catch (e) {
      if (i >= attempts) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60);
    }
  }
}
const refsSectionRe = /\n##\s*References[\s\S]*$/mi;
let enriched = 0, alreadyOk = 0;

for (const m of ordered) {
  const dir = path.join(lessonsDir, m.id);
  let files;
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')); } catch { continue; }
  for (const f of files) {
    const p = path.join(dir, f);
    let text = fs.readFileSync(p, 'utf8');
    text = text.replace(/\r\n/g, '\n'); // CRLF checkouts — keep sections stable

    // Idempotent: strip any previous auto-generated References section, rebuild.
    const had = refsRe.test(text);
    if (had) text = text.replace(refsSectionRe, '\n');

    // Topic context: lesson title + summary + module metadata.
    const fm = /^---\n([\s\S]*?)\n---/.exec(text);
    const metaText = fm ? fm[1] : '';
    const titleMatch = /(?:^|\n)title:\s*(.+)/.exec(metaText);
    const sumMatch = /(?:^|\n)summary:\s*(.+)/.exec(metaText);
    const context = `${titleMatch?.[1] ?? ''} ${sumMatch?.[1] ?? ''} ${m.title} ${m.subtitle} ${(m.tech || []).join(' ')}`;

    // URLs: the lesson's own docs links first (JEPs etc.), then curated site + official docs.
    const urls = [];
    const fmDocs = /(?:^|\n)docs:\s*\n?([\s\S]*?)(?=\n[a-z-]+:|\n---)/.exec(metaText);
    if (fmDocs) {
      for (const u of fmDocs[1].matchAll(/https?:\/\/[^\s"']+/g)) urls.push(u[0].replace(/[),]+$/, ''));
    }
    const site = bestSiteFor(context);
    urls.push(site.url);
    if (m.docsUrl && !urls.includes(m.docsUrl)) urls.push(m.docsUrl);

    const lines = [`\n## References\n`];
    for (const u of [...new Set(urls)]) {
      lines.push(`- [${friendlyName(u)}](${u})`);
    }
    const out = text.replace(/\s*$/, '') + '\n' + lines.join('\n') + '\n';

    if (!dryRun) writeWithRetry(p, out);
    had ? alreadyOk++ : enriched++;
  }
}

console.log(`lessons: ${enriched} enriched with references, ${alreadyOk} refreshed${dryRun ? ' (dry-run)' : ''}`);
console.log('Done.');
