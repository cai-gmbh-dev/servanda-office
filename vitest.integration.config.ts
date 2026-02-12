/**
 * Vitest Configuration for Integration Tests (Testcontainers)
 *
 * Run with:  npm run test:integration
 *
 * These tests start real PostgreSQL containers via Testcontainers and require
 * Docker to be running. They are intentionally separated from unit tests to
 * avoid slowing down the fast feedback loop.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['apps/api/src/**/*.integration.test.ts'],
    testTimeout: 60_000, // Container start + schema push can take a while
    hookTimeout: 60_000, // beforeAll with container setup
    pool: 'forks',       // Isolate test suites to avoid port conflicts
    reporters: ['verbose'],
  },
});
