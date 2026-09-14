#!/usr/bin/env node
/**
 * Lesson ordering — makes each module's lessons read in teaching order.
 *
 * Problem this fixes: many modules had lessons ordered filename-alphabetically,
 * so intros landed mid-module ("The Spring Ecosystem" at #22, "OAuth2 Overview"
 * after flows, module 'java' starting at Abstract Classes) — incomprehensible
 * for a beginner following the path top to bottom.
 *
 * What it does:
 *   1. For every module dir listed in ORDERINGS below, rewrites each lesson's
 *      `order:` to the position in the curated sequence. The sequence must
 *      cover every .md file in that dir EXACTLY once, or the script aborts
 *      without writing anything (set-equality validation).
 *   2. Modules not listed are left untouched and reported, so gaps are visible.
 *
 * Idempotent. Usage: node scripts/order-lessons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const base = path.join(root, 'backend/src/main/resources/content/lessons');

// ---------- curated pedagogical sequences (basics first, depth last) ----------
const ORDERINGS = {
  // The flagship module: language → OOP → collections/exceptions → functional →
  // strings/IO → network/DB → concurrency → JVM/reflection → modern features.
  java: [
    'java-platform', 'class-loading-jvm', 'java-syntax', 'operators-deep', 'type-casting',
    'math-random', 'scanner-input', 'command-line-args', 'pass-by-value-reference',
    'varargs-overloading', 'packages-imports', 'access-modifiers', 'static-deep', 'final-deep',
    'java-oop', 'object-class-methods', 'constructor-deep', 'initializer-blocks',
    'composition-aggregation', 'polymorphism-deep', 'abstract-classes-deep', 'interface-defaults',
    'nested-classes', 'equals-hashcode', 'object-cloning', 'immutable-class', 'java-records',
    'enums-deep', 'enum-operations', 'wrapper-classes-deep', 'primitive-vs-wrapper',
    'bigdecimal-money', 'arrays-deep', 'arrays-2d-deep', 'java-collections', 'iterator-iterable',
    'comparable-comparator', 'arraylist-hashmap-internals', 'java-generics', 'generics-wildcards',
    'java-exceptions', 'assertions-debugging', 'java-functional', 'method-reference-deep',
    'java-streams', 'java-optional', 'java-date-time', 'string-methods-deep', 'string-comparison',
    'string-pool', 'stringbuilder-buffer', 'text-blocks-deep', 'regex-patterns',
    'file-io-operations', 'iostreams-deep', 'java-nio-files', 'serialization-deep',
    'java-networking', 'nio-channels-deep', 'java-jdbc', 'java-security-jca', 'logging-deep', 'threads-deep',
    'java-concurrency', 'synchronized-monitors', 'volatile-happens-before', 'memory-model',
    'threadlocal', 'concurrent-collections', 'atomic-classes', 'fork-join-framework',
    'java-virtual-threads', 'structured-concurrency', 'scoped-values', 'shutdown-hooks',
    'weak-references', 'jvm-garbage-collection', 'java-reflection', 'method-handles',
    'annotations-built-in', 'annotations-processor-deep', 'java-modules', 'java-modern',
    'record-patterns', 'delegation-pattern',
  ],
  // Spring Boot: philosophy → structure → config → web → data → testing → production.
  'spring-boot': [
    'boot-philosophy', 'boot-project', 'servlet-embed', 'application-runners', 'commandline-runner',
    'boot-configuration', 'profiles-deep', 'configuration-properties-validation', 'logging',
    'boot-rest-api', 'dto-pattern', 'content-negotiation-media', 'patch-mapping', 'validation',
    'validation-custom', 'exception-handling-deep', 'error-handling-deep', 'spring-data-jpa',
    'jdbcclient-deep', 'transaction-deep', 'loading-initial-data', 'boot-file-upload',
    'thymeleaf-templates', 'websocket-intro', 'websocket-boot', 'jackson-custom',
    'resttemplate-webclient', 'restclient-deep', 'http-interface-client', 'swagger-openapi',
    'rate-limiting', 'filter-once-per-request', 'interceptor', 'event-listener',
    'async-scheduling', 'async-deep', 'boot-scheduled-tasks', 'caching-deep', 'caching-patterns',
    'email-sending', 'jms-messaging', 'boot-testing', 'test-slices-deep', 'testcontainers',
    'actuator', 'custom-actuator-endpoints', 'boot-production', 'graceful-shutdown',
    'devtools-restart', 'boot3-java21-features', 'admin', 'custom-starters',
    'packaging-layered-jars', 'docker-deploy', 'startup-performance', 'non-web-apps',
  ],
  // Spring Core: overview → container → DI → config machinery → cross-cutting.
  'spring-core': [
    'spring-overview', 'ioc-container', 'dependency-injection', 'value-injection',
    'lookup-method-injection', 'configuration', 'configuration-classes-deep',
    'component-scanning', 'bean-definition-inheritance', 'bean-scopes-lifecycle',
    'bean-post-processors', 'conditional-beans', 'circular-dependencies',
    'environment-abstraction', 'resources', 'spel', 'spel-advanced', 'data-access',
    'spring-aop', 'spring-events', 'bean-validation', 'method-validation', 'spring-webmvc',
    'i18n-messagesource',
  ],
  // Security: overview before flows, hardening last.
  'spring-security-jwt-deep': ['jwt-structure', 'jwt-issuance', 'jwt-validation', 'jwt-pitfalls', 'refresh-tokens'],
  'oauth2-oidc': ['oauth2-overview', 'authorization-code', 'openid-connect', 'jwt-oauth2', 'oauth2-practices'],
  'owasp-security': ['owasp-top10', 'authentication-authorization', 'injection-prevention', 'xss-csrf', 'secure-coding'],
  // Config trio: concept intro → mechanics → best practices / advanced.
  'spring-configuration': ['externalized-config', 'property-sources', 'yaml-config', 'profiles', 'config-best-practices'],
  'spring-configproperties': ['configuration-properties', 'binding-deep', 'nested-properties', 'validation-config', 'profile-config'],
  'spring-profiles-deep': ['profiles-configuration', 'profile-activation', 'profile-specific-beans', 'yaml-multidoc', 'feature-flags', 'profiles-spring-deep'],
  // Tooling: intro → features → advanced.
  'spring-lombok': ['lombok-annotations', 'lombok-builder-pattern', 'lombok-mapstruct', 'lombok-testing'],
  'spring-boot-devtools': ['devtools-overview', 'restart-strategies', 'livereload', 'remote-debug', 'devtools-advanced'],
  'spring-logging': ['logging-configuration', 'logback-patterns', 'mdc-logging', 'structured-logging', 'production-logging'],
};

function readOrder(file) {
  const text = fs.readFileSync(file, 'utf8');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) throw new Error(`no frontmatter: ${file}`);
  const om = m[1].match(/^order:\s*(\d+)\s*$/m);
  return om ? Number(om[1]) : null;
}

function writeOrder(file, order) {
  const text = fs.readFileSync(file, 'utf8');
  const next = text.replace(/^order:\s*\d+\s*$/m, `order: ${order}`);
  if (next === text) throw new Error(`could not rewrite order in ${file}`);
  fs.writeFileSync(file, next);
}

let reordered = 0;
let changed = 0;
const untouched = [];

for (const [modId, seq] of Object.entries(ORDERINGS)) {
  const dir = path.join(base, modId);
  if (!fs.existsSync(dir)) throw new Error(`ORDERINGS references unknown module dir: ${modId}`);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')).sort();
  const seqSorted = [...seq].sort();
  const missing = seqSorted.filter((f) => !files.includes(f));
  const extra = files.filter((f) => !seqSorted.includes(f));
  if (missing.length || extra.length) {
    throw new Error(`module '${modId}' mismatch. missing-from-dir: [${missing}] not-in-sequence: [${extra}]`);
  }
  seq.forEach((name, i) => {
    const file = path.join(dir, `${name}.md`);
    const before = readOrder(file);
    const after = i + 1;
    reordered++;
    if (before !== after) {
      writeOrder(file, after);
      changed++;
    }
  });
  console.log(`✓ ${modId}: ${seq.length} lessons ordered`);
}

// report modules not covered (visibility, not an error)
for (const d of fs.readdirSync(base, { withFileTypes: true })) {
  if (!d.isDirectory() || ORDERINGS[d.name]) continue;
  const dir = path.join(base, d.name);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  const orders = files.map((f) => readOrder(path.join(dir, f)));
  const clean = orders.every((o) => Number.isInteger(o)) &&
    [...orders].sort((a, b) => a - b).every((o, i) => o === i + 1);
  untouched.push(`${d.name}: ${files.length}L ${clean ? '(already 1..n — left as-is)' : '(NOT listed, orders not a clean permutation — REVIEW)'}`);
}

console.log(`\nreordered ${reordered} lessons (${changed} actually changed) across ${Object.keys(ORDERINGS).length} modules`);
console.log('modules left untouched:');
for (const u of untouched.sort()) console.log(`  ${u}`);
