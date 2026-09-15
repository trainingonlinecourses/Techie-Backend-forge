// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E — register → login → complete lesson → persistence.
 *
 * webServer starts the Vite dev server (frontend/), which proxies /api to the
 * local backend on :8080. Start the backend before running:
 *   cd backend && mvn -B spring-boot:run        (or run the packaged jar)
 *
 * CI runs the same config — see .github/workflows/ci.yml (e2e job), where the
 * backend jar is booted before the webServer spins up.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // one worker: the spec relies on sequential state
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  outputDir: './test-results',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    cwd: '.',
  },
});
