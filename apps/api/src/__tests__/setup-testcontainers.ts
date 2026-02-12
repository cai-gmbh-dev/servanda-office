/**
 * Testcontainers Setup for PostgreSQL — Sprint 9 (Team 06)
 *
 * Starts a real PostgreSQL container per test suite, pushes the Prisma schema,
 * and exports a configured PrismaClient instance for integration tests.
 *
 * Usage in test files:
 *   import { setupTestDb, teardownTestDb, cleanDb } from '../setup-testcontainers';
 *
 *   let prisma: PrismaClient;
 *   beforeAll(async () => { ({ prisma } = await setupTestDb()); }, 60_000);
 *   afterAll(async () => { await teardownTestDb(); });
 *   afterEach(async () => { await cleanDb(prisma); });
 */

import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import path from 'path';

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;

/** Schema path relative to project root (apps/api) */
const SCHEMA_PATH = path.resolve(__dirname, '../../prisma/schema.prisma');

/**
 * Starts a PostgreSQL testcontainer and pushes the Prisma schema.
 * Returns a connected PrismaClient and the raw connection URI.
 *
 * Call this in `beforeAll` with a generous timeout (60 s) to account for
 * image pull + container start + schema push.
 */
export async function setupTestDb(): Promise<{ prisma: PrismaClient; databaseUrl: string }> {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('servanda_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  const databaseUrl = container.getConnectionUri();

  // Use `db push` instead of `migrate deploy` — faster for tests and does not
  // require a migrations directory to be in sync.
  execSync(`npx prisma db push --schema="${SCHEMA_PATH}" --skip-generate --accept-data-loss`, {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe', // suppress noisy Prisma output in test runner
  });

  prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: [], // silent during tests
  });
  await prisma.$connect();

  return { prisma, databaseUrl };
}

/**
 * Disconnects the PrismaClient and stops the PostgreSQL container.
 * Call this in `afterAll`.
 */
export async function teardownTestDb(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
  }
  if (container) {
    await container.stop();
  }
}

/**
 * Truncates all application tables in the correct order (respecting FK constraints).
 * Uses TRUNCATE ... CASCADE for a clean slate between tests.
 *
 * Call this in `afterEach` to ensure test isolation.
 */
export async function cleanDb(client: PrismaClient): Promise<void> {
  // Truncate in dependency order: leaf tables first, then root.
  // CASCADE handles any remaining FK references.
  const tables = [
    'export_jobs',
    'contract_instances',
    'law_firm_templates',
    'template_versions',
    'interview_flows',
    'templates',
    'clause_versions',
    'clauses',
    'style_templates',
    'audit_events',
    'teams',
    'users',
    'tenants',
  ];

  // Execute as a single statement for atomicity
  await client.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(', ')} CASCADE`,
  );
}
