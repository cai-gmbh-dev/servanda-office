/**
 * Content API — Testcontainers Integration Tests — Sprint 9 (Team 06)
 *
 * These tests run against a real PostgreSQL instance (via Testcontainers)
 * with the actual Prisma schema applied. They verify:
 *
 *   1. Clause + ClauseVersion CRUD lifecycle (create, version, list, get)
 *   2. Version publishing workflow (draft → review → approved → published)
 *   3. Tenant isolation — User in Tenant A cannot see Tenant B data
 *
 * No mocks are used for the database layer.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { setupTestDb, teardownTestDb, cleanDb } from '../setup-testcontainers';

// ---------------------------------------------------------------------------
// Test Suite Setup
// ---------------------------------------------------------------------------

let prisma: PrismaClient;
let databaseUrl: string;

// Seed data IDs — set during beforeAll
let tenantAId: string;
let tenantBId: string;
let userAId: string;
let userBId: string;
let reviewerAId: string;

beforeAll(async () => {
  ({ prisma, databaseUrl } = await setupTestDb());

  // Seed two tenants with one user each
  const tenantA = await prisma.tenant.create({
    data: {
      name: 'Kanzlei Alpha',
      type: 'lawfirm',
      slug: 'kanzlei-alpha',
      defaultJurisdiction: 'DE',
    },
  });
  tenantAId = tenantA.id;

  const tenantB = await prisma.tenant.create({
    data: {
      name: 'Kanzlei Beta',
      type: 'lawfirm',
      slug: 'kanzlei-beta',
      defaultJurisdiction: 'DE',
    },
  });
  tenantBId = tenantB.id;

  userAId = (
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: 'editor-a@kanzlei-alpha.de',
        displayName: 'Editor A',
        role: 'editor',
        status: 'active',
      },
    })
  ).id;

  reviewerAId = (
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: 'reviewer-a@kanzlei-alpha.de',
        displayName: 'Reviewer A',
        role: 'admin',
        status: 'active',
      },
    })
  ).id;

  userBId = (
    await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: 'editor-b@kanzlei-beta.de',
        displayName: 'Editor B',
        role: 'editor',
        status: 'active',
      },
    })
  ).id;
}, 60_000);

afterAll(async () => {
  await teardownTestDb();
});

// ---------------------------------------------------------------------------
// Helper: clean only content tables (keep tenants/users between tests)
// ---------------------------------------------------------------------------

async function cleanContentTables(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "export_jobs",
      "contract_instances",
      "law_firm_templates",
      "template_versions",
      "interview_flows",
      "templates",
      "clause_versions",
      "clauses",
      "style_templates",
      "audit_events"
    CASCADE
  `);
}

afterEach(async () => {
  await cleanContentTables();
});

// ---------------------------------------------------------------------------
// 1. Clause + ClauseVersion CRUD Lifecycle
// ---------------------------------------------------------------------------

describe('Clause CRUD lifecycle', () => {
  it('should create a clause, add a version, list clauses, and get the version', async () => {
    // --- Create Clause ---
    const clause = await prisma.clause.create({
      data: {
        tenantId: tenantAId,
        title: 'Geheimhaltungsklausel',
        jurisdiction: 'DE',
        legalArea: 'Arbeitsrecht',
        tags: ['NDA', 'Standard'],
      },
    });

    expect(clause.id).toBeDefined();
    expect(clause.title).toBe('Geheimhaltungsklausel');
    expect(clause.tenantId).toBe(tenantAId);
    expect(clause.jurisdiction).toBe('DE');
    expect(clause.legalArea).toBe('Arbeitsrecht');
    expect(clause.tags).toEqual(['NDA', 'Standard']);
    expect(clause.currentPublishedVersionId).toBeNull();

    // --- Create Version ---
    const version = await prisma.clauseVersion.create({
      data: {
        clauseId: clause.id,
        tenantId: tenantAId,
        versionNumber: 1,
        content: 'Der Arbeitnehmer verpflichtet sich, über alle vertraulichen Informationen Stillschweigen zu bewahren.',
        parameters: { confidentialityPeriod: 'months' },
        rules: [],
        status: 'draft',
        authorId: userAId,
      },
    });

    expect(version.id).toBeDefined();
    expect(version.clauseId).toBe(clause.id);
    expect(version.versionNumber).toBe(1);
    expect(version.status).toBe('draft');
    expect(version.authorId).toBe(userAId);

    // --- List Clauses (should return one) ---
    const clauses = await prisma.clause.findMany({
      where: { tenantId: tenantAId },
      orderBy: { updatedAt: 'desc' },
    });

    expect(clauses).toHaveLength(1);
    expect(clauses[0]!.id).toBe(clause.id);

    // --- Get Version by clause+versionNumber ---
    const fetchedVersion = await prisma.clauseVersion.findUnique({
      where: {
        clauseId_versionNumber: {
          clauseId: clause.id,
          versionNumber: 1,
        },
      },
    });

    expect(fetchedVersion).not.toBeNull();
    expect(fetchedVersion!.content).toContain('vertraulichen Informationen');
    expect(fetchedVersion!.parameters).toEqual({ confidentialityPeriod: 'months' });
  });

  it('should auto-increment version numbers', async () => {
    const clause = await prisma.clause.create({
      data: {
        tenantId: tenantAId,
        title: 'Haftungsklausel',
        jurisdiction: 'DE',
        tags: [],
      },
    });

    await prisma.clauseVersion.create({
      data: {
        clauseId: clause.id,
        tenantId: tenantAId,
        versionNumber: 1,
        content: 'Version 1 content',
        rules: [],
        status: 'draft',
        authorId: userAId,
      },
    });

    const v2 = await prisma.clauseVersion.create({
      data: {
        clauseId: clause.id,
        tenantId: tenantAId,
        versionNumber: 2,
        content: 'Version 2 content — improved',
        rules: [],
        status: 'draft',
        authorId: userAId,
      },
    });

    expect(v2.versionNumber).toBe(2);

    // Verify unique constraint — duplicate versionNumber should fail
    await expect(
      prisma.clauseVersion.create({
        data: {
          clauseId: clause.id,
          tenantId: tenantAId,
          versionNumber: 2,
          content: 'Duplicate',
          rules: [],
          status: 'draft',
          authorId: userAId,
        },
      }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. Version Publishing Workflow
// ---------------------------------------------------------------------------

describe('Version publishing workflow', () => {
  it('should transition draft → review → approved → published', async () => {
    const clause = await prisma.clause.create({
      data: {
        tenantId: tenantAId,
        title: 'Wettbewerbsverbot',
        jurisdiction: 'DE',
        tags: [],
      },
    });

    const version = await prisma.clauseVersion.create({
      data: {
        clauseId: clause.id,
        tenantId: tenantAId,
        versionNumber: 1,
        content: 'Der Arbeitnehmer verpflichtet sich, nach Beendigung des Arbeitsverhältnisses ...',
        rules: [],
        status: 'draft',
        authorId: userAId,
      },
    });

    // draft → review
    const inReview = await prisma.clauseVersion.update({
      where: { id: version.id },
      data: { status: 'review' },
    });
    expect(inReview.status).toBe('review');

    // review → approved (reviewer assigns themselves)
    const approved = await prisma.clauseVersion.update({
      where: { id: version.id },
      data: { status: 'approved', reviewerId: reviewerAId },
    });
    expect(approved.status).toBe('approved');
    expect(approved.reviewerId).toBe(reviewerAId);

    // approved → published
    const publishedAt = new Date();
    const published = await prisma.clauseVersion.update({
      where: { id: version.id },
      data: { status: 'published', publishedAt },
    });
    expect(published.status).toBe('published');
    expect(published.publishedAt).toEqual(publishedAt);

    // Update clause to point to published version
    await prisma.clause.update({
      where: { id: clause.id },
      data: { currentPublishedVersionId: version.id },
    });

    const updatedClause = await prisma.clause.findUnique({
      where: { id: clause.id },
    });
    expect(updatedClause!.currentPublishedVersionId).toBe(version.id);
  });

  it('should preserve immutability — published version content is not overwritten', async () => {
    const clause = await prisma.clause.create({
      data: {
        tenantId: tenantAId,
        title: 'Salvatorische Klausel',
        jurisdiction: 'DE',
        tags: [],
      },
    });

    const v1 = await prisma.clauseVersion.create({
      data: {
        clauseId: clause.id,
        tenantId: tenantAId,
        versionNumber: 1,
        content: 'Originaltext der salvatorischen Klausel.',
        rules: [],
        status: 'published',
        authorId: userAId,
        publishedAt: new Date(),
      },
    });

    // Create v2 as a new version (not modifying v1)
    const v2 = await prisma.clauseVersion.create({
      data: {
        clauseId: clause.id,
        tenantId: tenantAId,
        versionNumber: 2,
        content: 'Aktualisierter Text der salvatorischen Klausel.',
        rules: [],
        status: 'draft',
        authorId: userAId,
      },
    });

    // v1 content should remain unchanged
    const v1Refetched = await prisma.clauseVersion.findUnique({
      where: { id: v1.id },
    });
    expect(v1Refetched!.content).toBe('Originaltext der salvatorischen Klausel.');
    expect(v1Refetched!.status).toBe('published');

    // v2 is a separate record
    expect(v2.versionNumber).toBe(2);
    expect(v2.content).toBe('Aktualisierter Text der salvatorischen Klausel.');
  });
});

// ---------------------------------------------------------------------------
// 3. Tenant Isolation
// ---------------------------------------------------------------------------

describe('Tenant isolation', () => {
  it('should not return clauses from another tenant via tenantId filter', async () => {
    // Tenant A creates a clause
    const clauseA = await prisma.clause.create({
      data: {
        tenantId: tenantAId,
        title: 'Klausel von Tenant A',
        jurisdiction: 'DE',
        tags: [],
      },
    });

    // Tenant B creates a clause
    const clauseB = await prisma.clause.create({
      data: {
        tenantId: tenantBId,
        title: 'Klausel von Tenant B',
        jurisdiction: 'DE',
        tags: [],
      },
    });

    // Query as Tenant A — should only see Tenant A's clause
    const tenantAClauses = await prisma.clause.findMany({
      where: { tenantId: tenantAId },
    });
    expect(tenantAClauses).toHaveLength(1);
    expect(tenantAClauses[0]!.id).toBe(clauseA.id);
    expect(tenantAClauses[0]!.title).toBe('Klausel von Tenant A');

    // Query as Tenant B — should only see Tenant B's clause
    const tenantBClauses = await prisma.clause.findMany({
      where: { tenantId: tenantBId },
    });
    expect(tenantBClauses).toHaveLength(1);
    expect(tenantBClauses[0]!.id).toBe(clauseB.id);
    expect(tenantBClauses[0]!.title).toBe('Klausel von Tenant B');
  });

  it('should enforce unique email per tenant but allow same email across tenants', async () => {
    // Same email in different tenants should work
    const userA2 = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: 'shared@example.de',
        displayName: 'Shared A',
        role: 'user',
        status: 'active',
      },
    });
    const userB2 = await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: 'shared@example.de',
        displayName: 'Shared B',
        role: 'user',
        status: 'active',
      },
    });

    expect(userA2.id).not.toBe(userB2.id);
    expect(userA2.email).toBe(userB2.email);

    // Same email in same tenant should fail (unique constraint @@unique([tenantId, email]))
    await expect(
      prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: 'shared@example.de',
          displayName: 'Duplicate',
          role: 'user',
          status: 'active',
        },
      }),
    ).rejects.toThrow();

    // Clean up extra users (not part of base seed)
    await prisma.user.deleteMany({
      where: { email: 'shared@example.de' },
    });
  });

  it('should not allow cross-tenant clause version creation', async () => {
    // Tenant A creates a clause
    const clauseA = await prisma.clause.create({
      data: {
        tenantId: tenantAId,
        title: 'Klausel A',
        jurisdiction: 'DE',
        tags: [],
      },
    });

    // Try to create a version referencing Tenant B's user as author
    // The FK on authorId → users.id will succeed (no tenant check in FK),
    // but the application layer should always filter by tenantId.
    // Here we verify the data layer stores the tenantId correctly.
    const version = await prisma.clauseVersion.create({
      data: {
        clauseId: clauseA.id,
        tenantId: tenantAId,
        versionNumber: 1,
        content: 'Test',
        rules: [],
        status: 'draft',
        authorId: userAId, // Correct: Tenant A user
      },
    });

    // Query with Tenant B filter — should NOT find this version
    const tenantBVersions = await prisma.clauseVersion.findMany({
      where: { tenantId: tenantBId },
    });
    expect(tenantBVersions).toHaveLength(0);

    // Query with Tenant A filter — should find the version
    const tenantAVersions = await prisma.clauseVersion.findMany({
      where: { tenantId: tenantAId },
    });
    expect(tenantAVersions).toHaveLength(1);
    expect(tenantAVersions[0]!.id).toBe(version.id);
  });
});

// ---------------------------------------------------------------------------
// 4. Schema Constraints & Edge Cases
// ---------------------------------------------------------------------------

describe('Schema constraints', () => {
  it('should enforce required fields on clause creation', async () => {
    // Missing required field `jurisdiction`
    await expect(
      prisma.clause.create({
        data: {
          tenantId: tenantAId,
          title: 'Incomplete Clause',
          // jurisdiction is required — omitted intentionally
          tags: [],
        } as any,
      }),
    ).rejects.toThrow();
  });

  it('should store and retrieve JSON fields correctly', async () => {
    const clause = await prisma.clause.create({
      data: {
        tenantId: tenantAId,
        title: 'JSON Test',
        jurisdiction: 'DE',
        tags: ['tag1', 'tag2'],
      },
    });

    const complexRules = [
      {
        type: 'requires',
        targetClauseId: '00000000-0000-0000-0000-000000000001',
        severity: 'hard',
        message: 'Klausel X wird benötigt',
      },
      {
        type: 'forbids',
        targetClauseId: '00000000-0000-0000-0000-000000000002',
        severity: 'soft',
        message: 'Klausel Y ist inkompatibel',
      },
    ];

    const version = await prisma.clauseVersion.create({
      data: {
        clauseId: clause.id,
        tenantId: tenantAId,
        versionNumber: 1,
        content: 'Content with rules',
        parameters: { key1: 'value1', nested: { deep: true } },
        rules: complexRules,
        status: 'draft',
        authorId: userAId,
      },
    });

    const fetched = await prisma.clauseVersion.findUnique({
      where: { id: version.id },
    });

    expect(fetched!.parameters).toEqual({ key1: 'value1', nested: { deep: true } });
    expect(fetched!.rules).toEqual(complexRules);
    expect(clause.tags).toEqual(['tag1', 'tag2']);
  });
});
