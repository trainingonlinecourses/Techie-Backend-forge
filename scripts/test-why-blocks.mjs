#!/usr/bin/env node
/**
 * Unit tests for frontend/src/lib/whyBlocks.js — the Show/Hide explanation
 * splitter. Run: node scripts/test-why-blocks.mjs
 */
import { buildWhyBlocks, splitRuns, explanationChunk, hasExplanation } from '../frontend/src/lib/whyBlocks.js';

let passed = 0, failed = 0;
const fail = (msg) => { failed++; console.error('  FAIL:', msg); };
const ok = (cond, msg) => { if (cond) { passed++; } else { fail(msg); } };

// --- splitRuns ------------------------------------------------------------
{
  const runs = splitRuns('para one\n\n```java\nint x = 1;\n```\npara two\n');
  ok(runs.length === 3, `splitRuns: 3 runs, got ${runs.length}`);
  ok(runs[0].kind === 'markdown' && runs[1].kind === 'code' && runs[2].kind === 'markdown', 'splitRuns: alternating kinds');
  ok(runs[1].lang === 'java' && runs[1].lines.join('\n').includes('int x = 1;'), 'splitRuns: code run keeps lang and body');
}

// --- explanationChunk -----------------------------------------------------
{
  const r = explanationChunk([
    '',
    '**What this code shows:**',
    '',
    '- Declares `x`.',
    '- Prints it.',
    '',
    '## Next Section',
  ]);
  ok(r.lines.length === 4, `chunk: header + 2 bullets, got ${r.lines.length}`);
  ok(r.lines[0].startsWith('**What this code shows:**'), 'chunk: starts at the header');
  ok(r.consumed === 5, `chunk: consumed through blank before heading, got ${r.consumed}`);
}
{
  const r = explanationChunk(['Plain prose first.', '**What this code shows:**', '- a']);
  ok(r.lines.length === 0, 'chunk: no header-first match → empty');
}
{
  const r = explanationChunk([
    '**What this code does — step by step:**',
    '',
    '1. Old way.',
    '2. Modern way.',
    '',
    '| table | continues |',
  ]);
  ok(r.lines.length === 4 && r.lines[2].startsWith('1.'), 'chunk: numbered walkthrough list attached');
}

// --- buildWhyBlocks -------------------------------------------------------
{
  const md = [
    '## Intro',
    '',
    '```java',
    'int x = 1;',
    '```',
    '',
    '**What this code shows:**',
    '',
    '- Declares `x`.',
    '',
    'More prose after.',
    '',
    '```java',
    'int y = 2;',
    '```',
  ].join('\n');
  const items = buildWhyBlocks(md);
  const code = items.filter((i) => i.type === 'code');
  ok(items.length === 4, `build: 4 items (md, code, md, code), got ${items.length}`);
  ok(code.length === 2, 'build: two code items');
  ok(code[0].explanation.includes('Declares `x`.'), 'build: explanation attached to first block');
  ok(!code[1].explanation, 'build: second block has no explanation');
  ok(items[0].markdown.includes('## Intro'), 'build: intro markdown preserved');
  ok(items[2].markdown.includes('More prose after.'), 'build: post-explanation prose preserved');
  ok(hasExplanation(code[0]) && !hasExplanation(code[1]), 'build: hasExplanation flag');
}
{
  // Explanation followed IMMEDIATELY by a table must not swallow the table.
  const md = ['```java', 'x();', '```', '', '**What this code shows:**', '- calls x.', '', '| a | b |', '|---|---|', '| 1 | 2 |'].join('\n');
  const items = buildWhyBlocks(md);
  const code = items.find((i) => i.type === 'code');
  const mdItems = items.filter((i) => i.type === 'markdown').map((i) => i.markdown).join('\n');
  ok(mdItems.includes('| a | b |'), 'build: table after explanation stays in markdown');
  ok(code && !String(code.explanation || '').includes('| a | b |'), 'build: table not glued to explanation');
}
{
  // No explanations at all → pure fallback, no data loss.
  const md = 'prose\n\n```java\nx();\n```\n\nend\n';
  const items = buildWhyBlocks(md);
  const code = items.filter((i) => i.type === 'code');
  ok(code.length === 1 && !code[0].explanation, 'build: code without explanation stays plain');
  const mdItems = items.filter((i) => i.type === 'markdown').map((i) => i.markdown).join('\n');
  ok(mdItems.includes('prose') && mdItems.includes('end'), 'build: all prose preserved');
}

console.log(`\nwhy-blocks: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
