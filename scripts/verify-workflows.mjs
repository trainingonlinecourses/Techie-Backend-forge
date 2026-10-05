#!/usr/bin/env node
/**
 * Workflow YAML sanity checks — no parser dependency, deliberately strict.
 *
 * Why hand-rolled: the only YAML lib in this repo would be a new devDependency
 * for one check, and the bug this guards against is structural.
 *
 * The bug this exists for: editing keepalive.yml once left TWO `on:` keys at the
 * top level. GitHub rejected the entire file ("'on' is already defined"), which
 * silently disabled the uptime guard — the very failure the guard exists to
 * prevent. A "does the string appear?" check passed it happily.
 *
 * Why the first version was wrong: it flagged duplicate keys by indentation
 * alone, so `name:` under every step and every job looked like a duplicate. Keys
 * legitimately repeat inside sibling lists. Duplicates are only real within ONE
 * mapping, so this tracks the full key PATH (walking the indentation stack) and
 * compares siblings only.
 *
 * Checks:
 *   1. No tabs (invalid YAML indentation).
 *   2. No duplicate key within a single mapping (same parent path).
 *   3. Required top-level keys present: name, on, jobs.
 *
 * Deliberately NOT checked: keys with no nested block. `on:\n  push:` is valid
 * (push: null means every branch), so flagging it produced false alarms.
 *
 * Usage: node scripts/verify-workflows.mjs [dir]
 */
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] || '.github/workflows';
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  .map((f) => path.join(dir, f));

if (files.length === 0) {
  console.error(`no workflow files in ${dir}`);
  process.exit(1);
}

let failures = 0;

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const problems = [];

  // ---- 1. tabs -------------------------------------------------------------
  lines.forEach((l, i) => {
    if (/^\s*\t/.test(l)) problems.push(`line ${i + 1}: tab indentation (invalid YAML)`);
  });

  // ---- 2. walk the indentation stack to build real key paths ---------------
  // Each stack entry is one MAPPING (an object). Its `seen` set holds the keys
  // declared directly inside it. Two rules make this accurate:
  //   - a list item "- key: value" is its OWN mapping, so repeated `name:` /
  //     `cron:` across list items are legal, not duplicates;
  //   - the root mapping needs a persistent scope, or top-level duplicates
  //     (the `on:` / `on:` bug this script exists for) go unnoticed.
  const rootScope = new Set();
  const stack = []; // { indent, key, seen }
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim() || /^\s*#/.test(raw)) continue;

    const indent = raw.match(/^ */)[0].length;
    const isListItem = /^\s*-\s+/.test(raw);
    const body = isListItem ? raw.replace(/^\s*-\s+/, '').trim() : raw.trim();

    // A key at indent 0 belongs to the DOCUMENT ROOT no matter what was pushed
    // earlier — it must be checked against the root scope and must NOT be
    // pushed onto the stack (otherwise the next indent-0 key looks nested and
    // the duplicate-`on:` bug slips through).
    const isRoot = !isListItem && indent === 0;

    const scope = isListItem ? new Set() : isRoot ? rootScope : stack.length ? stack[stack.length - 1].seen : rootScope;
    const parentKey = isListItem ? '(list item)' : isRoot ? '(document root)' : stack.length ? stack[stack.length - 1].key : '(document root)';

    const m = body.match(/^([A-Za-z_][\w.-]*):(\s.*|)$/);
    if (m) {
      const [, key] = m;
      if (scope.has(key)) {
        problems.push(
          `line ${i + 1}: duplicate key "${key}" in ${parentKey} (already declared in this block)`
        );
      } else {
        scope.add(key);
      }
    }

    if (isRoot) {
      stack.length = 0; // a root key closes every open block
      continue;
    }

    // Pop scopes that this line closes, then open this key's own mapping.
    // For a list item the effective indent is the column after "- ".
    const effectiveIndent = isListItem ? indent + 2 : indent;
    while (stack.length && stack[stack.length - 1].indent >= effectiveIndent) stack.pop();
    if (m) {
      stack.push({ indent: effectiveIndent, key: m[1], seen: new Set() });
    }
  }

  // ---- 3. required top-level keys -----------------------------------------
  for (const key of ['name:', 'on:', 'jobs:']) {
    const topLevel = new RegExp(`^${key}`, 'm');
    if (!topLevel.test(text)) problems.push(`missing required top-level "${key}"`);
  }

  if (problems.length) {
    failures++;
    console.error(`✗ ${file}`);
    problems.forEach((p) => console.error(`    ${p}`));
  } else {
    console.log(`✓ ${file}`);
  }
}

if (failures) {
  console.error(`\n${failures} workflow file(s) failed validation.`);
  process.exit(1);
}
console.log(`\n✓ ${files.length} workflow file(s) valid`);