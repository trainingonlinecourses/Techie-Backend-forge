// @ts-check
import { test, expect } from '@playwright/test';

/**
 * PRODUCTION smoke — the same critical path as e2e/auth-progress.spec.js, but
 * against the deployed app: Vercel (frontend) → its /api proxy → Render (API).
 * Fails CI when signup, login, lesson load, or the prereq gate break in prod.
 *
 * Run locally:
 *   cd frontend && npx playwright test --config=playwright.prod.config.js
 * Override target:
 *   PROD_FRONTEND_URL=https://<preview>.vercel.app npx playwright test --config=playwright.prod.config.js
 */

const PASSWORD = 'prod-Smoke1!';
const DISPLAY = 'Prod Smoke';
// Same resolution as playwright.prod.config.js — usable inside hooks, where
// test.info() is not available.
const BASE = process.env.PROD_FRONTEND_URL || 'https://techie-backend-forge.vercel.app';

function mkUsername(retry = 0) {
  return `psmoke_${Date.now().toString(36)}${retry}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

// Render free tier sleeps after ~15 idle minutes; the first request then HANGS
// (not 503 — no response at all) while the instance boots. Warm the API through
// Vercel's proxy before any assertion.
//
// This runs in beforeAll (not afterAll) and THROWS on failure, deliberately:
// a dead backend must fail the job in ~2 minutes with one clear message. The
// previous version warned and let all four tests run anyway, each burning its own
// 150s timeout — a 29-minute CI job that said only "failed".
test.beforeAll(async () => {
  // Budget must stay well under the suite's 150s per-test timeout: beforeAll
  // shares that timeout, so a budget >= it would be killed mid-loop and report
  // a generic "hook timeout" instead of this diagnostic.
  const DEADLINE = 90_000; // total warmup budget
  const PER_ATTEMPT = 15_000;
  const started = Date.now();
  let last = 'no attempt completed';

  while (Date.now() - started < DEADLINE) {
    try {
      const res = await fetch(`${BASE}/api/content/stats`, {
        signal: AbortSignal.timeout(PER_ATTEMPT),
      });
      if (res.ok) {
        console.log(`\n[smoke-prod] API warmed in ${Math.round((Date.now() - started) / 1000)}s`);
        return;
      }
      last = `HTTP ${res.status}`;
    } catch (e) {
      // A hung Render instance rejects as a timeout/fetch error, not a status.
      last = e.name === 'TimeoutError' ? 'timeout (no response)' : e.name;
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }

  throw new Error(
    `PRODUCTION BACKEND IS DOWN — ${BASE}/api/content/stats never answered ` +
      `(${last}) after ${Math.round(DEADLINE / 1000)}s.\n` +
      `This is an outage, not a test bug. Recovery: Render dashboard -> the service -> ` +
      `Manual Deploy -> "Clear build cache & deploy". If it still fails to boot, check ` +
      `that the Supabase project behind DATABASE_URL is not paused ` +
      `(Supabase dashboard -> the project -> Restore). See docs/ops-production-monitoring.md.`
  );
});

/** Register a fresh account through the production UI and wait until signed in. */
async function registerUser(page, username) {
  await page.goto('/register');
  await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Display name').fill(DISPLAY);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByText(DISPLAY).first()).toBeVisible({ timeout: 30_000 });
}

async function gotoLesson(page, slug) {
  await page.goto(`/lessons/${slug}`);
  await expect(page.getByRole('article').getByRole('heading', { level: 1 })).toBeVisible({
    timeout: 60_000,
  });
}

test.describe('production smoke (Vercel + Render)', () => {
  test('lesson loads for a guest with real content', async ({ page }) => {
    await gotoLesson(page, 'java-platform');
    const article = page.getByRole('article');
    const text = (await article.textContent()) || '';
    // Content-agnostic emptiness guard: catches a stale/blank curriculum deploy.
    expect(text.length).toBeGreaterThan(200);
    // The guest CTA must still be present (no redirect loop, no crash page).
    await expect(page.getByRole('link', { name: /sign in to track progress/i })).toBeVisible();
  });

  test('prereq gate: chips as guest, banner once signed in', async ({ page }, testInfo) => {
    // Pick a REAL prereq-tagged lesson from the live production API so the
    // test survives content edits. The modules tree doesn't carry `prereqs`
    // (only the lesson detail does), so probe known tagged slugs first, then
    // fall back to scanning deep lessons in the first modules.
    const preferred = ['java-streams', 'java-virtual-threads', 'text-blocks-deep', 'capstone-architecture'];
    let slug = null;
    for (const candidate of preferred) {
      try {
        const d = await fetch(`${BASE}/api/content/lessons/${candidate}`, {
          signal: AbortSignal.timeout(60_000),
        });
        if (!d.ok) continue;
        const body = await d.json();
        const lesson = body.lesson || body;
        if (Array.isArray(lesson.prereqs) && lesson.prereqs.length > 0) { slug = candidate; break; }
      } catch {
        /* transient — try the next candidate */
      }
    }
    if (!slug) {
      const res = await fetch(`${BASE}/api/content/modules`, { signal: AbortSignal.timeout(60_000) });
      const tree = await res.json();
      const modules = Array.isArray(tree) ? tree : tree.modules || [];
      outer: for (const mod of modules.slice(0, 3)) {
        const L = mod.lessons || [];
        for (let i = 3; i < L.length; i++) {
          try {
            const d = await fetch(`${BASE}/api/content/lessons/${L[i].id}`, {
              signal: AbortSignal.timeout(60_000),
            });
            if (!d.ok) continue;
            const body = await d.json();
            const lesson = body.lesson || body;
            if (Array.isArray(lesson.prereqs) && lesson.prereqs.length > 0) {
              slug = L[i].id;
              break outer;
            }
          } catch {
            /* transient — keep probing */
          }
        }
      }
    }
    if (!slug) {
      test.skip(true, 'production curriculum currently exposes no deep prereq-tagged lesson');
      return;
    }
    testInfo.attach('prereq-lesson', { body: slug, contentType: 'text/plain' });

    // Guest: the "Builds on" chips render, no banner (guests have no progress).
    await gotoLesson(page, slug);
    await expect(page.getByTestId('prereq-row')).toBeVisible();

    // Sign in with a fresh account (empty progress) → the banner appears.
    await registerUser(page, mkUsername(testInfo.retry));
    await gotoLesson(page, slug);
    const banner = page.getByTestId('prereq-banner');
    await expect(banner).toBeVisible({ timeout: 30_000 });
    await expect(banner.getByText(/skipping ahead|prerequisites pending/i)).toBeVisible();
  });

  test('signup → lesson completes → reload → logout → login persists', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const username = mkUsername(testInfo.retry);

    // ---------- 1. Signup ----------
    await registerUser(page, username);

    // Session survives a full reload (JWT is server-persisted, not just local).
    await page.reload();
    await expect(page.getByText(DISPLAY).first()).toBeVisible({ timeout: 30_000 });

    // ---------- 2. Complete a lesson ----------
    await gotoLesson(page, 'java-platform');
    const completeBtn = page.getByRole('button', { name: /mark lesson complete/i });
    await expect(completeBtn).toBeVisible({ timeout: 60_000 });
    await completeBtn.click();
    await expect(page.getByRole('button', { name: /completed — mark as unread/i })).toBeVisible({
      timeout: 30_000,
    });

    // ---------- 3. Completion survives a reload (server-side, not optimistic UI) ----------
    await page.reload();
    await expect(page.getByRole('button', { name: /completed — mark as unread/i })).toBeVisible({
      timeout: 30_000,
    });

    // ---------- 4. Logout → login with the same credentials ----------
    await page.goto('/');
    await page.getByRole('button', { name: new RegExp(DISPLAY) }).click();
    await page.getByRole('button', { name: /log ?out|sign ?out/i }).click();
    await expect(page.getByRole('link', { name: /log ?in|sign ?in/i }).first()).toBeVisible({
      timeout: 30_000,
    });

    await page.goto('/login');
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(DISPLAY).first()).toBeVisible({ timeout: 30_000 });

    // ---------- 5. The completed lesson is STILL completed after re-login ----------
    await gotoLesson(page, 'java-platform');
    await expect(page.getByRole('button', { name: /completed — mark as unread/i })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('login rejects a wrong password', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill(mkUsername());
    await page.getByLabel('Password').fill('definitely-wrong-password');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(
      page.getByText(/invalid username or password|login failed|incorrect/i).first()
    ).toBeVisible({ timeout: 30_000 });
  });
});
