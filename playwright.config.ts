import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the web app on this computer.
 *
 * The app runs on http://localhost:8081 against the STAGING database
 * (.env.development.local, see docs/STAGING.md), so the tests may create
 * records; they name everything they create "E2E …".
 *
 * Signing in is yours, once: `npm run e2e:login` opens a browser, you sign in
 * as usual, close it, and the session is kept in playwright/.auth/owner.json
 * (git-ignored). Every test then starts signed in.
 */
const AUTH_FILE = 'playwright/.auth/owner.json';
export const hasSavedLogin = existsSync(AUTH_FILE);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:8081',
    storageState: hasSavedLogin ? AUTH_FILE : undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1366, height: 800 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 800 } } }],
  // The Expo dev server takes a few minutes to bundle the first page. A server
  // already running (the usual case while developing) is reused as it is.
  webServer: {
    command: 'npx expo start --web --port 8081',
    url: 'http://localhost:8081',
    reuseExistingServer: true,
    timeout: 6 * 60_000,
  },
});
