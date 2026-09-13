// Band recommendation — pure curriculum/progress math, shared by the Home page
// and unit-tested in scripts/test-recommend-band.mjs.
export const LEVELS = ['foundation', 'intermediate', 'advanced', 'expert'];

/**
 * The first band (in learning order) that still has unfinished lessons —
 * where this learner should be right now. Guests (no progress) land on
 * foundation; a learner who finished every band gets null.
 */
export function recommendBand(curriculum, progress) {
  // No curriculum data (still loading, fetch failed) ⇒ nothing is completed ⇒ start at the beginning.
  if (!curriculum || curriculum.length === 0) return 'foundation';
  const done = (id) => Boolean(progress?.[id]);
  for (const level of LEVELS) {
    const mods = (curriculum || []).filter((m) => m.module.level === level);
    const total = mods.reduce((n, m) => n + (m.module.lessonCount ?? m.lessons.length), 0);
    if (total === 0) continue; // empty band — nothing to recommend
    const completed = mods.reduce((n, m) => n + m.lessons.filter((l) => done(l.id)).length, 0);
    if (completed < total) return level;
  }
  return null;
}

/**
 * The module (and its first incomplete lesson) where the learner should resume
 * inside `level` — or across the whole curriculum when level is 'all'/unknown.
 * Returns null when everything in scope is complete.
 */
export function nextModuleInBand(curriculum, level, progress) {
  // A known band scopes the search; 'all' or anything unknown means the whole curriculum.
  const mods = LEVELS.includes(level)
    ? (curriculum || []).filter((m) => m.module.level === level)
    : curriculum || [];
  for (const m of mods) {
    const next = m.lessons.find((l) => !progress?.[l.id]);
    if (next) return { module: m.module, lesson: next };
  }
  return null;
}
