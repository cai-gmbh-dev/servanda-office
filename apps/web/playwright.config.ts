/**
 * Playwright E2E Config — Sprint 6 (Team 06)
 *
 * Happy-path tests for the Servanda Office web app.
 * Requires: docker-compose --profile app up (API + Web)
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'html' : 'list',

  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    // Dev mode headers for tenant context
    extraHTTPHeaders: {
      'x-tenant-id': '00000000-0000-0000-0000-000000000002',
      'x-user-id': '00000000-0000-0000-0000-000000000004',
      'x-user-role': 'editor',
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 30_000,
      },
});
