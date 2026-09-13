// The Java release story, 1.0 → 26 — the data behind the /timeline page.
//
// Every version between 1.0 and 26 appears exactly once, in release order.
// `moduleId` points at the module that teaches the release: most have a
// dedicated module, early/interim releases are covered inside an era module
// (Java 1–7, Java 22–24) or a neighbouring module (Java 10's `var` is taught
// with Java 11; Java 9's modules get their own JPMS module).
export const RELEASES = [
  {
    v: '1.0', year: 1996, lts: false, moduleId: 'java-1-7',
    title: 'The beginning',
    features: ['Applets & AWT', 'Bytecode · WORA', 'JDBC', 'The first JVM'],
  },
  {
    v: '1.2', year: 1998, lts: false, moduleId: 'java-1-7',
    title: 'Java 2 — the platform era',
    features: ['Collections Framework', 'Swing', 'JIT compiler', 'strictfp'],
  },
  {
    v: '5', year: 2004, lts: false, moduleId: 'java-1-7',
    title: 'The language revolution',
    features: ['Generics', 'Enums & annotations', 'Autoboxing · varargs', 'Enhanced for'],
  },
  {
    v: '6', year: 2006, lts: false, moduleId: 'java-1-7',
    title: 'The performance release',
    features: ['Scripting engine', 'Web services', 'Humongous perf gains'],
  },
  {
    v: '7', year: 2011, lts: false, moduleId: 'java-1-7',
    title: 'Small syntax, big engine',
    features: ['try-with-resources', 'Diamond operator', 'Fork/Join', 'NIO.2'],
  },
  {
    v: '8', year: 2014, lts: true, moduleId: 'java-8',
    title: 'Functions become data',
    features: ['Lambdas', 'Stream API', 'Optional', 'java.time'],
  },
  {
    v: '9', year: 2017, lts: false, moduleId: 'java-jpms',
    title: 'The platform splits',
    features: ['JPMS modules', 'JShell REPL', 'Private interface methods'],
  },
  {
    v: '10', year: 2018, lts: false, moduleId: 'java-11',
    title: 'Less ceremony',
    features: ['var — type inference', 'G1 becomes the default GC'],
  },
  {
    v: '11', year: 2018, lts: true, moduleId: 'java-11',
    title: 'The modern baseline',
    features: ['HttpClient API', 'Single-file source launch', 'String improvements'],
  },
  {
    v: '17', year: 2021, lts: true, moduleId: 'java-17',
    title: 'Data-oriented syntax',
    features: ['Records', 'Sealed classes', 'Pattern matching', 'Text blocks'],
  },
  {
    v: '21', year: 2023, lts: true, moduleId: 'java-21',
    title: 'Threads, unbound',
    features: ['Virtual threads', 'Sequenced collections', 'Record patterns', 'Pattern matching switch'],
  },
  {
    v: '22', year: 2024, lts: false, moduleId: 'java-22-24',
    title: 'Sharper corners',
    features: ['Unnamed variables (preview)', 'Statements before super() (preview)', 'FFM API finalized'],
  },
  {
    v: '23', year: 2024, lts: false, moduleId: 'java-22-24',
    title: 'Docs go Markdown',
    features: ['Markdown doc comments (preview)', 'Primitive patterns (preview)'],
  },
  {
    v: '24', year: 2025, lts: false, moduleId: 'java-22-24',
    title: 'Gatherers arrive',
    features: ['Stream Gatherers (final)', 'Pinning-free synchronized VT', 'AOT class loading'],
  },
  {
    v: '25', year: 2025, lts: true, moduleId: 'java-25',
    title: 'The latest LTS',
    features: ['Stable Values', 'Scoped Values (final)', 'Compact object headers'],
  },
  {
    v: '26', year: 2026, lts: false, moduleId: 'java-26',
    title: 'The cutting edge',
    features: ['Flexible constructors', 'Structured concurrency', 'Scoped Values in practice'],
  },
];

/**
 * Join the release list with the live curriculum: attach each release module's
 * lessonCount/minutes/color and per-release completed-lesson counts, and flag
 * modules that are missing from the curriculum (e.g. a static fallback).
 * Pure — unit-tested in scripts/test-java-releases.mjs.
 */
export function resolveTimeline(curriculum, progress = {}) {
  const byId = new Map((curriculum || []).map((m) => [m.module.id, m]));
  return RELEASES.map((r) => {
    const entry = byId.get(r.moduleId);
    const lessons = entry?.lessons || [];
    const done = lessons.filter((l) => progress[l.id]).length;
    return {
      ...r,
      exists: Boolean(entry),
      lessonCount: entry?.module.lessonCount ?? lessons.length,
      minutes: entry?.module.minutes ?? 0,
      color: entry?.module.color || '#f5a623',
      completed: done,
    };
  });
}
