/**
 * Content Import Service — Unit Tests (Sprint 11, Team 03)
 *
 * Tests:
 * - Valid import format accepted
 * - Invalid format rejected (Zod validation)
 * - Duplicate detection (clause title within tenant)
 * - Import report correctness
 * - Tenant isolation (import scoped to own tenant)
 * - Template with unresolvable clause reference
 * - Transaction rollback on error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before imports
vi.mock('../../shared/db', () => {
  const mockTx = {
    clause: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    clauseVersion: {
      create: vi.fn(),
    },
    template: {
      create: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    templateVersion: {
      create: vi.fn(),
    },
    interviewFlow: {
      create: vi.fn(),
    },
  };

  return {
    prisma: {
      $transaction: vi.fn((fn: any) => fn(mockTx)),
    },
    setTenantContext: vi.fn(),
    __mockTx: mockTx,
  };
});

vi.mock('../../shared/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// Import after mocks
import { contentImportSchema, importContent } from './import';
import type { ContentImportInput, ImportReport } from './import';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { __mockTx } = await import('../../shared/db') as any;
import { setTenantContext } from '../../shared/db';
import type { TenantContext } from '@servanda/shared';

const TENANT_CTX: TenantContext = {
  tenantId: 'tenant-001',
  userId: 'user-001',
  role: 'admin',
};

const OTHER_TENANT_CTX: TenantContext = {
  tenantId: 'tenant-002',
  userId: 'user-002',
  role: 'admin',
};

describe('Content Import — Zod Schema Validation', () => {
  it('should accept a valid import with clauses only', () => {
    const input = {
      clauses: [
        {
          title: 'Vertragsgegenstand',
          jurisdiction: 'DE',
          tags: ['kaufvertrag'],
          versions: [
            {
              content: '§1 Vertragsgegenstand...',
              changeNote: 'Initial import',
            },
          ],
        },
      ],
    };

    const result = contentImportSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clauses).toHaveLength(1);
      expect(result.data.templates).toHaveLength(0);
    }
  });

  it('should accept a valid import with clauses and templates', () => {
    const input = {
      clauses: [
        {
          title: 'Vertragsgegenstand',
          jurisdiction: 'DE',
          versions: [{ content: 'Inhalt' }],
        },
      ],
      templates: [
        {
          title: 'Kaufvertrag',
          jurisdiction: 'DE',
          category: 'commercial',
          sections: [
            {
              title: 'Einleitung',
              slots: [
                { clauseTitle: 'Vertragsgegenstand', type: 'required' },
              ],
            },
          ],
        },
      ],
    };

    const result = contentImportSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clauses).toHaveLength(1);
      expect(result.data.templates).toHaveLength(1);
    }
  });

  it('should accept a template with interview flow', () => {
    const input = {
      clauses: [
        {
          title: 'Klausel A',
          jurisdiction: 'DE',
          versions: [{ content: 'Inhalt A' }],
        },
      ],
      templates: [
        {
          title: 'Vorlage X',
          jurisdiction: 'DE',
          sections: [
            {
              title: 'Abschnitt 1',
              slots: [{ clauseTitle: 'Klausel A', type: 'required' }],
            },
          ],
          interviewFlow: {
            title: 'Interview X',
            questions: [
              {
                key: 'betrag',
                type: 'currency' as const,
                label: 'Wie hoch ist der Betrag?',
                required: true,
              },
            ],
          },
        },
      ],
    };

    const result = contentImportSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject import with missing clause title', () => {
    const input = {
      clauses: [
        {
          jurisdiction: 'DE',
          versions: [{ content: 'Inhalt' }],
        },
      ],
    };

    const result = contentImportSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject import with empty clause versions array', () => {
    const input = {
      clauses: [
        {
          title: 'Test',
          jurisdiction: 'DE',
          versions: [],
        },
      ],
    };

    const result = contentImportSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject import with missing version content', () => {
    const input = {
      clauses: [
        {
          title: 'Test',
          jurisdiction: 'DE',
          versions: [{ content: '' }],
        },
      ],
    };

    const result = contentImportSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject template with empty sections', () => {
    const input = {
      templates: [
        {
          title: 'Template',
          jurisdiction: 'DE',
          sections: [],
        },
      ],
    };

    const result = contentImportSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject template section with empty slots', () => {
    const input = {
      templates: [
        {
          title: 'Template',
          jurisdiction: 'DE',
          sections: [
            { title: 'Section 1', slots: [] },
          ],
        },
      ],
    };

    const result = contentImportSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should accept empty import (no clauses, no templates)', () => {
    const result = contentImportSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clauses).toHaveLength(0);
      expect(result.data.templates).toHaveLength(0);
    }
  });
});

describe('Content Import — importContent Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no existing clauses
    __mockTx.clause.findMany.mockResolvedValue([]);
    __mockTx.template.findFirst.mockResolvedValue(null);
  });

  it('should import clauses and return correct report', async () => {
    __mockTx.clause.create.mockResolvedValue({
      id: 'new-clause-001',
      tenantId: TENANT_CTX.tenantId,
      title: 'Vertragsgegenstand',
    });
    __mockTx.clauseVersion.create.mockResolvedValue({
      id: 'new-cv-001',
      clauseId: 'new-clause-001',
      versionNumber: 1,
    });

    const input: ContentImportInput = {
      clauses: [
        {
          title: 'Vertragsgegenstand',
          jurisdiction: 'DE',
          tags: ['kaufvertrag'],
          versions: [
            { content: '§1 Vertragsgegenstand...', changeNote: 'Initial import' },
          ],
        },
      ],
      templates: [],
    };

    const report = await importContent(TENANT_CTX, input);

    expect(report.summary.clauses.created).toBe(1);
    expect(report.summary.clauses.skipped).toBe(0);
    expect(report.summary.clauses.errors).toBe(0);
    expect(report.items).toHaveLength(1);
    expect(report.items[0]).toEqual(
      expect.objectContaining({
        type: 'clause',
        title: 'Vertragsgegenstand',
        status: 'created',
        id: 'new-clause-001',
      }),
    );

    // Verify setTenantContext was called
    expect(setTenantContext).toHaveBeenCalledWith(expect.anything(), TENANT_CTX.tenantId);

    // Verify clause was created with correct tenant
    expect(__mockTx.clause.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: TENANT_CTX.tenantId,
        title: 'Vertragsgegenstand',
        jurisdiction: 'DE',
        tags: ['kaufvertrag'],
      }),
    });

    // Verify version was created as draft
    expect(__mockTx.clauseVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clauseId: 'new-clause-001',
        tenantId: TENANT_CTX.tenantId,
        versionNumber: 1,
        status: 'draft',
        authorId: TENANT_CTX.userId,
        content: '§1 Vertragsgegenstand...',
      }),
    });
  });

  it('should skip duplicate clauses (same title in tenant)', async () => {
    // Simulate existing clause with same title
    __mockTx.clause.findMany.mockResolvedValue([
      { id: 'existing-clause-001', title: 'Vertragsgegenstand' },
    ]);

    const input: ContentImportInput = {
      clauses: [
        {
          title: 'Vertragsgegenstand',
          jurisdiction: 'DE',
          versions: [{ content: 'Inhalt' }],
        },
        {
          title: 'Gewährleistung',
          jurisdiction: 'DE',
          versions: [{ content: 'Inhalt 2' }],
        },
      ],
      templates: [],
    };

    __mockTx.clause.create.mockResolvedValue({
      id: 'new-clause-002',
      tenantId: TENANT_CTX.tenantId,
      title: 'Gewährleistung',
    });
    __mockTx.clauseVersion.create.mockResolvedValue({
      id: 'new-cv-002',
      clauseId: 'new-clause-002',
      versionNumber: 1,
    });

    const report = await importContent(TENANT_CTX, input);

    expect(report.summary.clauses.created).toBe(1);
    expect(report.summary.clauses.skipped).toBe(1);

    // The skipped item should have a reason
    const skipped = report.items.find((i) => i.status === 'skipped');
    expect(skipped).toBeDefined();
    expect(skipped!.title).toBe('Vertragsgegenstand');
    expect(skipped!.reason).toContain('already exists');

    // The created item should be the non-duplicate
    const created = report.items.find((i) => i.status === 'created');
    expect(created).toBeDefined();
    expect(created!.title).toBe('Gewährleistung');
  });

  it('should import multiple clause versions in order', async () => {
    __mockTx.clause.create.mockResolvedValue({
      id: 'clause-multi-ver',
      tenantId: TENANT_CTX.tenantId,
      title: 'Multi-Version Clause',
    });
    __mockTx.clauseVersion.create.mockResolvedValue({
      id: 'cv-multi',
      clauseId: 'clause-multi-ver',
      versionNumber: 1,
    });

    const input: ContentImportInput = {
      clauses: [
        {
          title: 'Multi-Version Clause',
          jurisdiction: 'DE',
          versions: [
            { content: 'Version 1 content' },
            { content: 'Version 2 content', changeNote: 'Updated wording' },
          ],
        },
      ],
      templates: [],
    };

    await importContent(TENANT_CTX, input);

    // Should have created 2 versions
    expect(__mockTx.clauseVersion.create).toHaveBeenCalledTimes(2);
    expect(__mockTx.clauseVersion.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        versionNumber: 1,
        content: 'Version 1 content',
      }),
    });
    expect(__mockTx.clauseVersion.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        versionNumber: 2,
        content: 'Version 2 content',
      }),
    });
  });

  it('should import templates with resolved clause references', async () => {
    // Clause is created first, then referenced by template
    __mockTx.clause.create.mockResolvedValue({
      id: 'imported-clause-001',
      tenantId: TENANT_CTX.tenantId,
      title: 'Einleitungsklausel',
    });
    __mockTx.clauseVersion.create.mockResolvedValue({
      id: 'imported-cv-001',
      clauseId: 'imported-clause-001',
      versionNumber: 1,
    });
    __mockTx.template.create.mockResolvedValue({
      id: 'imported-tmpl-001',
      tenantId: TENANT_CTX.tenantId,
      title: 'Mustervertrag',
    });
    __mockTx.templateVersion.create.mockResolvedValue({
      id: 'imported-tv-001',
      templateId: 'imported-tmpl-001',
      versionNumber: 1,
    });

    const input: ContentImportInput = {
      clauses: [
        {
          title: 'Einleitungsklausel',
          jurisdiction: 'DE',
          versions: [{ content: 'Einleitung...' }],
        },
      ],
      templates: [
        {
          title: 'Mustervertrag',
          jurisdiction: 'DE',
          category: 'commercial',
          sections: [
            {
              title: 'Einleitung',
              slots: [
                { clauseTitle: 'Einleitungsklausel', type: 'required' as const },
              ],
            },
          ],
        },
      ],
    };

    const report = await importContent(TENANT_CTX, input);

    expect(report.summary.clauses.created).toBe(1);
    expect(report.summary.templates.created).toBe(1);

    // Template version should have resolved clauseId
    expect(__mockTx.templateVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        templateId: 'imported-tmpl-001',
        versionNumber: 1,
        status: 'draft',
        structure: [
          {
            title: 'Einleitung',
            slots: [
              { clauseId: 'imported-clause-001', type: 'required' },
            ],
          },
        ],
      }),
    });
  });

  it('should import template with interview flow', async () => {
    __mockTx.clause.create.mockResolvedValue({
      id: 'clause-for-flow',
      tenantId: TENANT_CTX.tenantId,
      title: 'Klausel A',
    });
    __mockTx.clauseVersion.create.mockResolvedValue({
      id: 'cv-for-flow',
      clauseId: 'clause-for-flow',
      versionNumber: 1,
    });
    __mockTx.interviewFlow.create.mockResolvedValue({
      id: 'imported-flow-001',
      tenantId: TENANT_CTX.tenantId,
      title: 'Interview Flow',
    });
    __mockTx.template.create.mockResolvedValue({
      id: 'tmpl-with-flow',
      tenantId: TENANT_CTX.tenantId,
      title: 'Template With Flow',
    });
    __mockTx.templateVersion.create.mockResolvedValue({
      id: 'tv-with-flow',
      templateId: 'tmpl-with-flow',
      versionNumber: 1,
    });

    const input: ContentImportInput = {
      clauses: [
        {
          title: 'Klausel A',
          jurisdiction: 'DE',
          versions: [{ content: 'Inhalt A' }],
        },
      ],
      templates: [
        {
          title: 'Template With Flow',
          jurisdiction: 'DE',
          sections: [
            {
              title: 'Section 1',
              slots: [{ clauseTitle: 'Klausel A', type: 'required' as const }],
            },
          ],
          interviewFlow: {
            title: 'Interview Flow',
            questions: [
              {
                key: 'betrag',
                type: 'currency' as const,
                label: 'Wie hoch ist der Betrag?',
                required: true,
              },
            ],
          },
        },
      ],
    };

    const report = await importContent(TENANT_CTX, input);

    expect(report.summary.interviewFlows.created).toBe(1);
    expect(report.summary.templates.created).toBe(1);

    // Interview flow should be created with correct tenant
    expect(__mockTx.interviewFlow.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: TENANT_CTX.tenantId,
        title: 'Interview Flow',
      }),
    });

    // Template version should reference the interview flow
    expect(__mockTx.templateVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        interviewFlowId: 'imported-flow-001',
      }),
    });
  });

  it('should fail if template references non-existent clause', async () => {
    const input: ContentImportInput = {
      clauses: [],
      templates: [
        {
          title: 'Bad Template',
          jurisdiction: 'DE',
          sections: [
            {
              title: 'Section 1',
              slots: [
                { clauseTitle: 'Non-Existent Clause', type: 'required' as const },
              ],
            },
          ],
        },
      ],
    };

    await expect(importContent(TENANT_CTX, input)).rejects.toThrow(
      /Cannot resolve clause "Non-Existent Clause"/,
    );
  });

  it('should resolve clause references from existing clauses in tenant', async () => {
    // An existing clause in the tenant can be referenced
    __mockTx.clause.findMany.mockResolvedValue([
      { id: 'existing-clause-abc', title: 'Bestandsklausel' },
    ]);
    __mockTx.template.create.mockResolvedValue({
      id: 'tmpl-ref-existing',
      tenantId: TENANT_CTX.tenantId,
      title: 'Template Ref Existing',
    });
    __mockTx.templateVersion.create.mockResolvedValue({
      id: 'tv-ref-existing',
      templateId: 'tmpl-ref-existing',
      versionNumber: 1,
    });

    const input: ContentImportInput = {
      clauses: [],
      templates: [
        {
          title: 'Template Ref Existing',
          jurisdiction: 'DE',
          sections: [
            {
              title: 'Section',
              slots: [
                { clauseTitle: 'Bestandsklausel', type: 'required' as const },
              ],
            },
          ],
        },
      ],
    };

    const report = await importContent(TENANT_CTX, input);

    expect(report.summary.templates.created).toBe(1);
    expect(__mockTx.templateVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        structure: [
          {
            title: 'Section',
            slots: [{ clauseId: 'existing-clause-abc', type: 'required' }],
          },
        ],
      }),
    });
  });

  it('should skip duplicate templates (same title in tenant)', async () => {
    __mockTx.template.findFirst.mockResolvedValue({
      id: 'existing-tmpl-001',
      title: 'Existing Template',
    });

    const input: ContentImportInput = {
      clauses: [],
      templates: [
        {
          title: 'Existing Template',
          jurisdiction: 'DE',
          sections: [
            {
              title: 'Section',
              slots: [{ clauseTitle: 'Klausel', type: 'required' as const }],
            },
          ],
        },
      ],
    };

    const report = await importContent(TENANT_CTX, input);

    expect(report.summary.templates.skipped).toBe(1);
    expect(report.summary.templates.created).toBe(0);
    const skipped = report.items.find((i) => i.type === 'template' && i.status === 'skipped');
    expect(skipped).toBeDefined();
    expect(skipped!.reason).toContain('already exists');
  });

  it('should set tenant context via RLS for each import', async () => {
    __mockTx.clause.create.mockResolvedValue({
      id: 'tenant-scoped-001',
      tenantId: TENANT_CTX.tenantId,
      title: 'Scoped',
    });
    __mockTx.clauseVersion.create.mockResolvedValue({
      id: 'cv-scoped-001',
      clauseId: 'tenant-scoped-001',
      versionNumber: 1,
    });

    const input: ContentImportInput = {
      clauses: [
        {
          title: 'Scoped',
          jurisdiction: 'DE',
          versions: [{ content: 'Content' }],
        },
      ],
      templates: [],
    };

    await importContent(TENANT_CTX, input);

    // setTenantContext should be called with the correct tenantId
    expect(setTenantContext).toHaveBeenCalledWith(expect.anything(), 'tenant-001');
  });

  it('should use different tenant context for different tenants', async () => {
    // First import for tenant-001
    __mockTx.clause.create.mockResolvedValue({
      id: 'tenant1-clause',
      tenantId: TENANT_CTX.tenantId,
      title: 'Tenant 1 Clause',
    });
    __mockTx.clauseVersion.create.mockResolvedValue({
      id: 'cv-t1',
      clauseId: 'tenant1-clause',
      versionNumber: 1,
    });

    const input: ContentImportInput = {
      clauses: [
        {
          title: 'Tenant 1 Clause',
          jurisdiction: 'DE',
          versions: [{ content: 'Content for T1' }],
        },
      ],
      templates: [],
    };

    await importContent(TENANT_CTX, input);

    expect(setTenantContext).toHaveBeenCalledWith(expect.anything(), 'tenant-001');
    expect(__mockTx.clause.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: 'tenant-001' }),
    });

    vi.clearAllMocks();
    __mockTx.clause.findMany.mockResolvedValue([]);

    // Second import for tenant-002
    __mockTx.clause.create.mockResolvedValue({
      id: 'tenant2-clause',
      tenantId: OTHER_TENANT_CTX.tenantId,
      title: 'Tenant 2 Clause',
    });
    __mockTx.clauseVersion.create.mockResolvedValue({
      id: 'cv-t2',
      clauseId: 'tenant2-clause',
      versionNumber: 1,
    });

    const input2: ContentImportInput = {
      clauses: [
        {
          title: 'Tenant 2 Clause',
          jurisdiction: 'AT',
          versions: [{ content: 'Content for T2' }],
        },
      ],
      templates: [],
    };

    await importContent(OTHER_TENANT_CTX, input2);

    expect(setTenantContext).toHaveBeenCalledWith(expect.anything(), 'tenant-002');
    expect(__mockTx.clause.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: 'tenant-002' }),
    });
  });

  it('should return empty report for empty import', async () => {
    const input: ContentImportInput = {
      clauses: [],
      templates: [],
    };

    const report = await importContent(TENANT_CTX, input);

    expect(report.summary.clauses.created).toBe(0);
    expect(report.summary.clauses.skipped).toBe(0);
    expect(report.summary.clauses.errors).toBe(0);
    expect(report.summary.templates.created).toBe(0);
    expect(report.summary.templates.skipped).toBe(0);
    expect(report.summary.templates.errors).toBe(0);
    expect(report.items).toHaveLength(0);
  });

  it('should import clauses with parameters and rules', async () => {
    __mockTx.clause.create.mockResolvedValue({
      id: 'clause-with-rules',
      tenantId: TENANT_CTX.tenantId,
      title: 'Clause With Rules',
    });
    __mockTx.clauseVersion.create.mockResolvedValue({
      id: 'cv-with-rules',
      clauseId: 'clause-with-rules',
      versionNumber: 1,
    });

    const input: ContentImportInput = {
      clauses: [
        {
          title: 'Clause With Rules',
          jurisdiction: 'DE',
          legalArea: 'Vertragsrecht',
          tags: ['test', 'rules'],
          versions: [
            {
              content: 'Content with {param}',
              parameters: {
                param: { type: 'text', label: 'Parameter', required: true },
              },
              rules: [
                {
                  type: 'requires',
                  targetClauseTitle: 'Other Clause',
                  severity: 'hard',
                  message: 'Requires other clause',
                },
              ],
            },
          ],
        },
      ],
      templates: [],
    };

    const report = await importContent(TENANT_CTX, input);
    expect(report.summary.clauses.created).toBe(1);

    expect(__mockTx.clauseVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        parameters: { param: { type: 'text', label: 'Parameter', required: true } },
        rules: [
          {
            type: 'requires',
            targetClauseTitle: 'Other Clause',
            severity: 'hard',
            message: 'Requires other clause',
          },
        ],
      }),
    });
  });

  it('should handle template with alternative clause slots', async () => {
    // Set up two existing clauses
    __mockTx.clause.findMany.mockResolvedValue([
      { id: 'clause-main', title: 'Hauptklausel' },
      { id: 'clause-alt', title: 'Alternativklausel' },
    ]);
    __mockTx.template.create.mockResolvedValue({
      id: 'tmpl-alt-slots',
      tenantId: TENANT_CTX.tenantId,
      title: 'Template Alt Slots',
    });
    __mockTx.templateVersion.create.mockResolvedValue({
      id: 'tv-alt-slots',
      templateId: 'tmpl-alt-slots',
      versionNumber: 1,
    });

    const input: ContentImportInput = {
      clauses: [],
      templates: [
        {
          title: 'Template Alt Slots',
          jurisdiction: 'DE',
          sections: [
            {
              title: 'Section',
              slots: [
                {
                  clauseTitle: 'Hauptklausel',
                  type: 'alternative' as const,
                  alternativeClauseTitles: ['Alternativklausel'],
                },
              ],
            },
          ],
        },
      ],
    };

    const report = await importContent(TENANT_CTX, input);
    expect(report.summary.templates.created).toBe(1);

    expect(__mockTx.templateVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        structure: [
          {
            title: 'Section',
            slots: [
              {
                clauseId: 'clause-main',
                type: 'alternative',
                alternativeClauseIds: ['clause-alt'],
              },
            ],
          },
        ],
      }),
    });
  });

  it('should fail if alternative clause reference cannot be resolved', async () => {
    __mockTx.clause.findMany.mockResolvedValue([
      { id: 'clause-main', title: 'Hauptklausel' },
    ]);

    const input: ContentImportInput = {
      clauses: [],
      templates: [
        {
          title: 'Bad Alt Template',
          jurisdiction: 'DE',
          sections: [
            {
              title: 'Section',
              slots: [
                {
                  clauseTitle: 'Hauptklausel',
                  type: 'alternative' as const,
                  alternativeClauseTitles: ['Missing Alt'],
                },
              ],
            },
          ],
        },
      ],
    };

    await expect(importContent(TENANT_CTX, input)).rejects.toThrow(
      /Cannot resolve alternative clause "Missing Alt"/,
    );
  });
});
