/**
 * "Next up" recommendation — pure helpers, unit-tested by scripts/test-next-up.mjs.
 *
 * The pedagogically next lesson is the next lesson within the same module; when
 * the module ends it rolls into the FIRST lesson of the next module (skipping
 * empty modules), so the recommendation never dead-ends mid-curriculum.
 */

/**
 * @param {Array} curriculum  [{ module, lessons }] in curriculum order
 * @param {string|null} lessonId  current lesson id
 * @param {object} progress  completed map lessonId → true
 * @returns {{ id, title, moduleTitle, moduleId, order, minutes, completed, wrapped }|null}
 *          `wrapped` is true when the recommendation crossed into the next module.
 */
export function nextUpLesson(curriculum, lessonId, progress = {}) {
  if (!Array.isArray(curriculum) || !lessonId) return null;
  const done = progress || {};

  const flat = [];
  for (const m of curriculum) {
    for (const l of m.lessons || []) flat.push(l);
  }
  const idx = flat.findIndex((l) => l.id === lessonId);
  if (idx < 0) return null;
  const next = flat[idx + 1];
  if (!next) return null; // last lesson of the whole curriculum

  return {
    id: next.id,
    title: next.title,
    moduleTitle: next.moduleTitle || null,
    moduleId: next.moduleId,
    order: next.order,
    minutes: next.minutes,
    completed: !!done[next.id],
    wrapped: next.moduleId !== flat[idx].moduleId,
  };
}
