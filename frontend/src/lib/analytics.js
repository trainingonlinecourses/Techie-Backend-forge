// Recommendation A/B analytics — thin, best-effort event tracking.
//
// The experiment measures whether the recommendation surfaces (the
// "Start here"/"Continue" chip and the ribbon's jump action) help learners
// reach lessons compared to manual browsing. Events are logged only for
// signed-in users; every call fails silently so analytics can never break UX.
import { api } from '../api/client';

function log(surface, lessonId = null, band = null) {
  // Fire-and-forget: never await, never surface errors to the learner.
  api.post('/analytics/events', { surface, lessonId, band }).catch(() => { });
}

export const trackChipClick = (lessonId, band) => log('CONTINUE_CHIP', lessonId, band);
export const trackRibbonJump = (band) => log('RIBBON_JUMP', null, band);

/**
 * Called when a lesson page opens WITHOUT passing through a recommendation
 * surface — the control observation.
 */
export const trackManualNavigation = (lessonId) => log('MANUAL_NAVIGATION', lessonId, null);

/**
 * Remember that the given lesson was reached via a recommendation, so the
 * lesson page won't double-log it as manual browsing. Stores the lesson id
 * and is checked non-destructively: React StrictMode runs effects twice in
 * dev, and a consume-on-read flag would misclassify the second run as manual.
 */
export function markRecommendedVisit(lessonId) {
  try { sessionStorage.setItem('bf:recVisit', lessonId); } catch { /* ignore */ }
}

export function isRecommendedVisit(lessonId) {
  try { return sessionStorage.getItem('bf:recVisit') === lessonId; } catch { return false; }
}
