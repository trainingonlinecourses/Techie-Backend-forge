/**
 * Prerequisite gating — pure helpers, no React, unit-tested by scripts/test-prereqs.mjs.
 *
 * A lesson payload carries `prereqs`: explicit `requires:` tags first, then up to
 * three lessons the curriculum places directly before it (the natural reading
 * path). This module turns that list plus the learner's progress into UI state:
 *
 *   severity 'ok'   — nothing to say (all prereqs completed, or no skip at all)
 *   severity 'warn' — some prereqs are uncompleted, but the learner is close
 *   severity 'gate' — a far jump ahead of the completed path; content is locked
 *                     behind a "show anyway" action for the rest of the visit
 */

/** Lessons jumped ahead of the completed path before gating kicks in. */
const GATE_SKIP_THRESHOLD = 3;

const GATE_KEY = 'bf_prereq_gate_open';

/**
 * Analyze one lesson against the learner's progress.
 *
 * @param {object|null} lesson  LessonSummaryDto (needs id, moduleId, order, prereqs)
 * @param {object} progress     map of completed lessonId → true
 * @param {string[]|null} moduleLessonIds  ordered ids of the lesson's own module
 *        (from the curriculum tree) — sharpens the "skipped" count; optional.
 * @returns {{tagged: object[], missing: object[], skipped: number, severity: 'ok'|'warn'|'gate', gateLocked: boolean, gateOpen: boolean}}
 */
export function analyzePrereqs(lesson, progress, moduleLessonIds = null) {
  const empty = { tagged: [], missing: [], skipped: 0, severity: 'ok', gateLocked: false, gateOpen: false };
  const prereqs = Array.isArray(lesson?.prereqs) ? lesson.prereqs : [];
  if (!lesson || prereqs.length === 0) return empty;
  const done = progress || {};

  const missing = prereqs.filter((p) => p && p.id && !done[p.id]);
  if (missing.length === 0) return { ...empty, tagged: prereqs };

  // How much of the path did the learner skip to get here? Prefer the module's
  // own lesson list; without it, fall back to a global-order estimate.
  const beforeInModule = Array.isArray(moduleLessonIds)
    ? moduleLessonIds.slice(0, Math.max(0, moduleLessonIds.indexOf(lesson.id)))
    : null;
  const completedHere = beforeInModule
    ? beforeInModule.filter((id) => done[id]).length
    : Object.keys(done).length;
  const skipped = Math.max(0, (beforeInModule ? beforeInModule.length : Math.max(0, lesson.order - 1)) - completedHere);

  const gate = skipped >= GATE_SKIP_THRESHOLD;
  const gateOpen = gate && isGateOpenFor(lesson.id);
  return {
    tagged: prereqs,
    missing,
    skipped,
    severity: gate ? 'gate' : 'warn',
    gateLocked: gate && !gateOpen,
    gateOpen,
  };
}

/**
 * Human-readable one-liner for the banner: why this lesson was flagged.
 * @returns {string} '' when there is nothing to explain.
 */
export function prereqWarning(analysis) {
  if (!analysis || analysis.missing.length === 0) return '';
  const n = analysis.missing.length;
  const titles = analysis.missing.slice(0, 2).map((p) => `“${p.title}”`).join(' and ');
  const more = n > 2 ? ` and ${n - 2} more` : '';
  if (analysis.severity === 'gate') {
    return `You've jumped ~${analysis.skipped} lessons ahead of your completed path. ` +
      `This lesson builds on ${titles}${more}.`;
  }
  return `${n === 1 ? 'One lesson' : `${n} lessons`} this one builds on ${n === 1 ? 'is' : 'are'} still uncompleted: ${titles}${more}.`;
}

// ---- per-visit gate state (sessionStorage: survives reloads in this tab,
// ---- resets when the tab closes — a fresh visit gates again) ----------------

export function isGateOpenFor(lessonId) {
  try {
    const state = JSON.parse(sessionStorage.getItem(GATE_KEY)) || {};
    return state[lessonId] === true;
  } catch {
    return false;
  }
}

export function setGateOpenFor(lessonId, open) {
  try {
    const state = JSON.parse(sessionStorage.getItem(GATE_KEY)) || {};
    if (open) state[lessonId] = true;
    else delete state[lessonId];
    sessionStorage.setItem(GATE_KEY, JSON.stringify(state));
  } catch {
    /* private mode / storage disabled — gating then just can't be overridden */
  }
}
