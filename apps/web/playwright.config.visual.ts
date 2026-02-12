/**
 * Playwright Config — Visual Regression Tests
 * Sprint 12 (Team 06)
 *
 * Separate configuration for visual regression tests.
 * Uses only Chromium at a fixed viewport (1280x720) for consistent screenshots.
 *
 * Usage:
 *   npx playwright test --config playwright.config.visual.ts
 *
 * Update baselines:
 *   npx playwright test --config playwright.config.visual.ts --update-snapshots
 */

import { defineConfig, devices } from '@playwright/test';

/** Import values from base config for reuse */
const baseURL = process.env.BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'visual-regression.spec.ts',

  /* Run tests sequentially — screenshots depend on stable rendering order */
  fullyParallel: false,

  /* Forbid test.only in CI */
  forbidOnly: !!process.env.CI,

  /* Retry once in CI to handle flaky rendering */
  retries: process.env.CI ? 1 : 0,

  /* Single worker for deterministic screenshots */
  workers: 1,

  /* Reporter */
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',

  /* Snapshot configuration */
  snapshotDir: './e2e/__screenshots__',
  snapshotPathTemplate: '{snapshotDir}/{testFilePath}/{arg}{ext}',

  /* Update snapshots only when explicitly requested via --update-snapshots */
  updateSnapshots: 'none',

  /* Global timeout per test */
  timeout: 30_000,

  /* Expect configuration for screenshot comparison */
  expect: {
    toHaveScreenshot: {
      /* Allow 0.2% pixel difference to handle anti-aliasing */
      maxDiffPixelRatio: 0.002,

      /* Animations should be disabled for stable screenshots */
      animations: 'disabled',

      /* Use CSS to disable animations */
      caret: 'hide',
    },
  },

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',

    /* Fixed locale and timezone for consistent date/number formatting */
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',

    /* Force light color scheme for consistent rendering */
    colorScheme: 'light',

    /* Disable animations for deterministic screenshots */
    reducedMotion: 'reduce',

    /* Dev-mode headers for tenant context */
    extraHTTPHeaders: {
      'x-tenant-id': '00000000-0000-0000-0000-000000000002',
      'x-user-id': '00000000-0000-0000-0000-000000000004',
      'x-user-role': 'editor',
    },
  },

  projects: [
    {
      name: 'visual-regression',
      use: {
        ...devices['Desktop Chrome'],
        /* Fixed viewport for consistent screenshots */
        viewport: { width: 1280, height: 720 },
      },
    },
  ],

  /* Web server for local development (not used in CI) */
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 30_000,
      },
});
