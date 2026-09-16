// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * Production smoke — runs against the DEPLOYED app, not localhost.
 *
 *   npx playwright test --config=playwright.prod.config.js
 *
 * Targets the live Vercel frontend (baseURL). API calls go through Vercel's
 * /api proxy, so Render cold starts hit the same warmup logic users see.
 *
 * CI (ci.yml → smoke-prod job) runs this after every push and fails the build
 * if signup, login, lesson load, or the prereq gate break in production.
 */
const FRONTEND_URL = process.env.PROD_FRONTEND_URL || 'https://techie-backend-forge.vercel.app';

export default defineConfig({
  testDir: './e2e-prod',
  timeout: 150_000, // Render free tier cold starts can eat 60s+ on their own
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-prod' }]]
    : 'list',
  use: {
    baseURL: FRONTEND_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
  },
  outputDir: './test-results-prod',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
