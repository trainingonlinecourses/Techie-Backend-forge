// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Password recovery E2E — the flows a locked-out learner depends on:
 *   1. register with a security question → logout
 *   2. forgot-password: question shown → wrong answer rejected → right answer
 *      → new password → signed in → NEW password works on re-login
 *   3. settings: change password requires the CURRENT password
 *
 * Real backend (H2 file DB via the Vite /api proxy) — no mocking.
 */

const DISPLAY = 'Recovery Learner';

function mkUsername(retry = 0) {
  return `rec_${Date.now().toString(36)}${retry}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

async function logout(page) {
  await page.goto('/');
  await page.getByRole('button', { name: /recovery learner/i }).click();
  await page.getByRole('button', { name: /log ?out|sign ?out/i }).click();
  await expect(page.getByRole('link', { name: /sign in|log ?in/i }).first()).toBeVisible({ timeout: 20_000 });
}

test.describe('password recovery', () => {
  test('full recovery flow: wrong answer rejected, right answer resets, new password logs in', async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    const username = mkUsername(testInfo.retry);
    const question = `What is the code word for ${username}?`;
    const answer = 'blue whale orchestra';
    const password = 'RecoveryPass1!';

    // ---------- 1. Register WITH a security question ----------
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Display name').fill(DISPLAY);
    await page.getByLabel('Password').fill(password);
    await page.getByText(/add a security question/i).click(); // open the opt-in
    await page.getByLabel('Question').fill(question);
    await page.getByLabel('Answer').fill(answer);
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page.getByText(DISPLAY).first()).toBeVisible({ timeout: 20_000 });
    await logout(page);

    // ---------- 2. Forgot password ----------
    await page.goto('/login');
    await page.getByRole('link', { name: /forgot password/i }).click();
    await expect(page.getByRole('heading', { name: /reset your password/i })).toBeVisible();

    // Step 1: username → question appears
    await page.getByLabel('Username').fill(username);
    await page.getByRole('button', { name: /find my question/i }).click();
    await expect(page.getByText(question)).toBeVisible({ timeout: 20_000 });

    // Step 2: WRONG answer is rejected (and shows attempts remaining)
    await page.getByLabel('Your answer').fill('deliberately wrong answer');
    await page.getByRole('button', { name: /verify answer/i }).click();
    await expect(page.getByText(/not correct|attempts remaining/i).first()).toBeVisible({ timeout: 20_000 });

    // RIGHT answer advances to step 3
    await page.getByLabel('Your answer').fill(answer);
    await page.getByRole('button', { name: /verify answer/i }).click();
    await expect(page.getByLabel('New password', { exact: true })).toBeVisible({ timeout: 20_000 });

    // Mismatched confirmation is blocked client-side
    await page.getByLabel('New password', { exact: true }).fill('BrandNewPass1!');
    await page.getByLabel('Confirm new password').fill('DifferentPass1!');
    await page.getByRole('button', { name: /set new password/i }).click();
    await expect(page.getByText(/do not match/i)).toBeVisible();

    // Matching passwords → reset → signed in automatically
    await page.getByLabel('Confirm new password').fill('BrandNewPass1!');
    await page.getByRole('button', { name: /set new password/i }).click();
    await expect(page.getByText(DISPLAY).first()).toBeVisible({ timeout: 20_000 });

    // ---------- 3. The NEW password works on a fresh login ----------
    await logout(page);
    await page.goto('/login');
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill('BrandNewPass1!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(DISPLAY).first()).toBeVisible({ timeout: 20_000 });
  });

  test('account without a question is told recovery is unavailable (no enumeration signal)', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('Username').fill('definitely-not-a-real-user-xyz');
    await page.getByRole('button', { name: /find my question/i }).click();
    await expect(
      page.getByText(/no recovery question is set up/i)
    ).toBeVisible({ timeout: 20_000 });
    // stays on step 1 — no question was revealed
    await expect(page.getByRole('button', { name: /find my question/i })).toBeVisible();
  });

  test('settings: change password requires the CURRENT password', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const username = mkUsername(testInfo.retry);
    const password = 'SettingsPass1!';

    await page.goto('/register');
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Display name').fill(DISPLAY);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page.getByText(DISPLAY).first()).toBeVisible({ timeout: 20_000 });

    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: /change password/i })).toBeVisible();

    // Wrong current password → error, no crash
    await page.getByLabel('Current password').fill('wrong-current-pw');
    await page.getByLabel('New password', { exact: true }).fill('NextPass1!');
    await page.getByLabel('Confirm new password').fill('NextPass1!');
    await page.getByRole('button', { name: /change password/i }).click();
    await expect(page.getByText(/current password is not correct/i).first()).toBeVisible({ timeout: 20_000 });

    // Correct current password → success
    await page.getByLabel('Current password').fill(password);
    await page.getByLabel('New password', { exact: true }).fill('NextPass1!');
    await page.getByLabel('Confirm new password').fill('NextPass1!');
    await page.getByRole('button', { name: /change password/i }).click();
    await expect(page.getByText(/^password changed\.$/i)).toBeVisible({ timeout: 20_000 });
  });
});
