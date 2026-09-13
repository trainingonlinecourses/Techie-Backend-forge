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
 * Why recommendBand picked what it picked — powers the home page ribbon.
 * Pure data + human phrasing, unit-tested in scripts/test-recommend-band.mjs.
 */
export function explainRecommendation(curriculum, progress) {
  const band = recommendBand(curriculum, progress);
  if (!band) {
    const total = (curriculum || []).reduce(
      (n, m) => n + (m.module.lessonCount ?? m.lessons.length), 0);
    return {
      kind: 'graduated', band: null,
      reason: total > 0
        ? `You've completed all ${total} lessons in the curriculum — nothing left to recommend. Revisit any band, or challenge the AI tutor.`
        : 'Curriculum still loading…',
    };
  }

  const mods = (curriculum || []).filter((m) => m.module.level === band);
  const total = mods.reduce((n, m) => n + (m.module.lessonCount ?? m.lessons.length), 0);
  const completed = mods.reduce((n, m) => n + m.lessons.filter((l) => progress?.[l.id]).length, 0);

  const bandIndex = LEVELS.indexOf(band);
  const earlier = LEVELS.slice(0, bandIndex);
  const finishedEarlier = earlier.filter((lv) => {
    const lvMods = (curriculum || []).filter((m) => m.module.level === lv);
    const lvTotal = lvMods.reduce((n, m) => n + (m.module.lessonCount ?? m.lessons.length), 0);
    const lvDone = lvMods.reduce((n, m) => n + m.lessons.filter((l) => progress?.[l.id]).length, 0);
    return lvTotal > 0 && lvDone === lvTotal;
  });
  const earlierDone = finishedEarlier.reduce((sum, lv) => {
    const lvMods = (curriculum || []).filter((m) => m.module.level === lv);
    return sum + lvMods.reduce((n, m) => n + (m.module.lessonCount ?? m.lessons.length), 0);
  }, 0);

  if (completed === 0) {
    return {
      kind: 'fresh-start', band, completed, total,
      reason: finishedEarlier.length > 0
        ? `You finished every lesson in ${finishedEarlier.join(' and ')} — the next step is ${band}.`
        : `You haven't completed any lessons yet — ${band} builds the base everything else stands on.`,
    };
  }
  return {
    kind: 'in-progress', band, completed, total,
    reason: finishedEarlier.length > 0
      ? `You've finished ${finishedEarlier.join(' and ')} (${earlierDone} lessons) — keep the momentum in ${band}: ${completed}/${total} done.`
      : `You're ${completed} lesson${completed === 1 ? '' : 's'} into ${band} (${total} total) — finish the band to unlock the next.`,
  };
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
