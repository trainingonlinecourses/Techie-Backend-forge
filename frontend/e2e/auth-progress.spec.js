// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Critical-path E2E: register → login → complete a lesson → persistence
 * across reload → still signed in on a fresh visit → progress survives
 * logout + login. These are the flows real learners break first.
 *
 * The backend is the real local one (H2 file DB, seeded curriculum), reached
 * through the Vite /api proxy — no mocking, so auth, JWT and progress rows
 * are exercised for real.
 */

const PASSWORD = 'e2e-Password1!';
const DISPLAY = 'E2E Learner';

/** Fresh credentials per attempt — a CI retry never collides with the user row it just created. */
function mkUsername(retry = 0) {
  return `e2e_${Date.now().toString(36)}${retry}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

async function gotoLesson(page) {
  // The first teachable lesson of the first module — stable across content edits.
  await page.goto('/lessons/java-platform');
  // Scope to the article: the page header (h1.ptitle) and the body's H1 both
  // render — matching the long-standing pattern across the curriculum.
  await expect(page.getByRole('article').getByRole('heading', { level: 1 })).toBeVisible();
}

test.describe('auth + progress critical path', () => {
  test('register → auto signed-in → complete lesson → progress survives reload, logout & login', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const username = mkUsername(testInfo.retry);

    // ---------- 1. Register ----------
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();

    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Display name').fill(DISPLAY);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: /create account/i }).click();

    // Registration signs the user in and lands on home.
    await expect(page.getByText(DISPLAY).first()).toBeVisible({ timeout: 20_000 });

    // ---------- 2. Session survives a full reload ----------
    await page.reload();
    await expect(page.getByText(DISPLAY).first()).toBeVisible({ timeout: 20_000 });

    // ---------- 3. Open a lesson and complete it ----------
    await gotoLesson(page);
    const completeBtn = page.getByRole('button', { name: /mark lesson complete/i });
    await expect(completeBtn).toBeVisible();
    await completeBtn.click();

    // Optimistic UI flips to the completed state…
    await expect(
      page.getByRole('button', { name: /completed — mark as unread/i })
    ).toBeVisible({ timeout: 20_000 });

    // …and the server actually persisted it (round-trip, not just local state).
    await page.reload();
    await expect(
      page.getByRole('button', { name: /completed — mark as unread/i })
    ).toBeVisible({ timeout: 20_000 });

    // ---------- 4. Logout → login with the SAME credentials ----------
    // (This is the regression the user hit: back/forward + re-login failing.)
    await page.goto('/');
    await page.getByRole('button', { name: new RegExp(DISPLAY) }).click(); // open the user menu
    await page.getByRole('button', { name: /log ?out|sign ?out/i }).click();
    await expect(
      page.getByRole('link', { name: /log ?in|sign ?in/i }).first()
    ).toBeVisible({ timeout: 20_000 });

    await page.goto('/login');
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();

    // Back on the app, still the same user…
    await expect(page.getByText(DISPLAY).first()).toBeVisible({ timeout: 20_000 });

    // …and the completed lesson is STILL completed (server-side persistence).
    await gotoLesson(page);
    await expect(
      page.getByRole('button', { name: /completed — mark as unread/i })
    ).toBeVisible({ timeout: 20_000 });
  });

  test('guest visiting a lesson is not kicked off the page', async ({ page }) => {
    await gotoLesson(page);
    // Guests can read; the sign-in CTA is present instead of a redirect loop.
    await expect(page.getByRole('link', { name: /sign in to track progress/i })).toBeVisible();
    // The quiz widget may 401 for guests — the page must stay put regardless.
    await page.waitForTimeout(1_500);
    await expect(page).toHaveURL(/\/lessons\/java-platform/);
  });

  test('login rejects a wrong password', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill(mkUsername());
    await page.getByLabel('Password').fill('definitely-wrong-password');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/invalid username or password|login failed|incorrect/i).first())
      .toBeVisible({ timeout: 20_000 });
  });
});
