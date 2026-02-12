/**
 * Export Pipeline Test Fixtures — Sprint 9 (Team 05)
 *
 * Deterministic fixtures based on seed.ts UUIDs.
 * Provides typed test data for DataLoader, DocxRenderer, and pipeline tests.
 */

import type { ExportData } from '../../data/data-loader';

// ============================================================================
// Deterministic UUIDs (from apps/api/prisma/seed.ts)
// ============================================================================

export const SEED_IDS = {
  // Tenants
  vendorTenantId: '00000000-0000-0000-0000-000000000001',
  lawfirmTenantId: '00000000-0000-0000-0000-000000000002',

  // Users
  vendorAuthorId: '00000000-0000-0000-0001-000000000001',
  vendorReviewerId: '00000000-0000-0000-0001-000000000002',
  lawfirmAdminId: '00000000-0000-0000-0002-000000000001',
  lawfirmEditorId: '00000000-0000-0000-0002-000000000002',
  lawfirmUserId: '00000000-0000-0000-0002-000000000003',

  // Clauses
  clauseVertragsgegenstandId: '00000000-0000-0000-0010-000000000001',
  clauseGewaehrleistungId: '00000000-0000-0000-0010-000000000002',
  clauseHaftungsbeschraenkungId: '00000000-0000-0000-0010-000000000003',
  clauseGerichtsstandId: '00000000-0000-0000-0010-000000000004',

  // ClauseVersions
  cvVertragsgegenstandId: '00000000-0000-0000-0011-000000000001',
  cvGewaehrleistungId: '00000000-0000-0000-0011-000000000002',
  cvHaftungsbeschraenkungId: '00000000-0000-0000-0011-000000000003',
  cvGerichtsstandId: '00000000-0000-0000-0011-000000000004',

  // InterviewFlow
  interviewFlowId: '00000000-0000-0000-0020-000000000001',

  // Template + Version
  templateId: '00000000-0000-0000-0030-000000000001',
  templateVersionId: '00000000-0000-0000-0031-000000000001',

  // ContractInstance
  contractInstanceId: '00000000-0000-0000-0040-000000000001',

  // StyleTemplate
  styleTemplateId: '00000000-0000-0000-0050-000000000001',

  // Non-existent (for error tests)
  nonExistentContractId: '99999999-9999-9999-9999-999999999999',
  nonExistentTenantId: '88888888-8888-8888-8888-888888888888',
} as const;

// ============================================================================
// Clause Content (mirrors seed.ts)
// ============================================================================

export const CLAUSE_CONTENT = {
  vertragsgegenstand:
    'Der Verkäufer verkauft dem Käufer den in Anlage 1 näher bezeichneten Gegenstand zum vereinbarten Kaufpreis von {kaufpreis} EUR.',
  gewaehrleistung:
    'Die Gewährleistungsfrist beträgt {gewaehrleistungsfrist} Monate ab Übergabe des Kaufgegenstandes. Die gesetzlichen Regelungen der §§ 434 ff. BGB finden Anwendung.',
  haftungsbeschraenkung:
    'Die Haftung des Verkäufers ist auf Vorsatz und grobe Fahrlässigkeit beschränkt. Die Haftung für leichte Fahrlässigkeit ist ausgeschlossen, soweit gesetzlich zulässig.',
  gerichtsstand:
    'Gerichtsstand für alle Streitigkeiten aus oder im Zusammenhang mit diesem Vertrag ist {gerichtsort}.',
} as const;

// ============================================================================
// Clause Parameters (mirrors seed.ts)
// ============================================================================

export const CLAUSE_PARAMETERS = {
  vertragsgegenstand: {
    kaufpreis: { type: 'currency', label: 'Kaufpreis (EUR)', required: true },
  },
  gewaehrleistung: {
    gewaehrleistungsfrist: {
      type: 'number',
      label: 'Gewährleistungsfrist (Monate)',
      required: true,
      default: 24,
    },
  },
  haftungsbeschraenkung: {},
  gerichtsstand: {
    gerichtsort: { type: 'text', label: 'Gerichtsort', required: true, default: 'Berlin' },
  },
} as const;

// ============================================================================
// Contract Instance Answers (mirrors seed.ts)
// ============================================================================

export const SEED_ANSWERS: Record<string, unknown> = {
  kaufpreis: 50000,
  gewaehrleistungsfrist: 24,
  haftungsbeschraenkung: false,
  gerichtsort: 'Berlin',
};

// ============================================================================
// Template Structure (mirrors seed.ts)
// ============================================================================

export const TEMPLATE_STRUCTURE = [
  {
    title: 'Vertragsgegenstand',
    slots: [
      { clauseId: SEED_IDS.clauseVertragsgegenstandId, type: 'required' as const },
    ],
  },
  {
    title: 'Gewährleistung',
    slots: [
      { clauseId: SEED_IDS.clauseGewaehrleistungId, type: 'required' as const },
    ],
  },
  {
    title: 'Haftung',
    slots: [
      { clauseId: SEED_IDS.clauseHaftungsbeschraenkungId, type: 'optional' as const },
    ],
  },
  {
    title: 'Schlussbestimmungen',
    slots: [
      { clauseId: SEED_IDS.clauseGerichtsstandId, type: 'required' as const },
    ],
  },
];

// ============================================================================
// Mock Prisma ContractInstance (as returned by DB)
// ============================================================================

export const MOCK_CONTRACT_INSTANCE = {
  id: SEED_IDS.contractInstanceId,
  tenantId: SEED_IDS.lawfirmTenantId,
  creatorId: SEED_IDS.lawfirmEditorId,
  title: 'Kaufvertrag Mandant Müller',
  clientReference: 'AZ-2026-001',
  tags: ['mueller', 'kaufvertrag'],
  templateVersionId: SEED_IDS.templateVersionId,
  clauseVersionIds: [
    SEED_IDS.cvVertragsgegenstandId,
    SEED_IDS.cvGewaehrleistungId,
    SEED_IDS.cvGerichtsstandId,
  ],
  answers: SEED_ANSWERS,
  selectedSlots: {},
  validationState: 'valid',
  status: 'draft',
  createdAt: new Date('2026-01-15T10:00:00Z'),
  updatedAt: new Date('2026-01-15T10:00:00Z'),
};

// ============================================================================
// Mock Prisma TemplateVersion (as returned by DB)
// ============================================================================

export const MOCK_TEMPLATE_VERSION = {
  id: SEED_IDS.templateVersionId,
  templateId: SEED_IDS.templateId,
  tenantId: SEED_IDS.vendorTenantId,
  versionNumber: 1,
  structure: TEMPLATE_STRUCTURE,
  interviewFlowId: SEED_IDS.interviewFlowId,
  status: 'published',
  authorId: SEED_IDS.vendorAuthorId,
  reviewerId: SEED_IDS.vendorReviewerId,
  publishedAt: new Date('2026-01-01T00:00:00Z'),
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

// ============================================================================
// Mock Prisma ClauseVersions (as returned by DB)
// ============================================================================

export const MOCK_CLAUSE_VERSIONS = [
  {
    id: SEED_IDS.cvVertragsgegenstandId,
    clauseId: SEED_IDS.clauseVertragsgegenstandId,
    tenantId: SEED_IDS.vendorTenantId,
    versionNumber: 1,
    content: CLAUSE_CONTENT.vertragsgegenstand,
    parameters: CLAUSE_PARAMETERS.vertragsgegenstand,
    rules: [],
    status: 'published',
    authorId: SEED_IDS.vendorAuthorId,
    reviewerId: SEED_IDS.vendorReviewerId,
    publishedAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: SEED_IDS.cvGewaehrleistungId,
    clauseId: SEED_IDS.clauseGewaehrleistungId,
    tenantId: SEED_IDS.vendorTenantId,
    versionNumber: 1,
    content: CLAUSE_CONTENT.gewaehrleistung,
    parameters: CLAUSE_PARAMETERS.gewaehrleistung,
    rules: [
      {
        type: 'requires',
        targetClauseId: SEED_IDS.clauseVertragsgegenstandId,
        severity: 'hard',
        message: 'Gewährleistung erfordert Vertragsgegenstand-Klausel.',
      },
    ],
    status: 'published',
    authorId: SEED_IDS.vendorAuthorId,
    reviewerId: SEED_IDS.vendorReviewerId,
    publishedAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: SEED_IDS.cvGerichtsstandId,
    clauseId: SEED_IDS.clauseGerichtsstandId,
    tenantId: SEED_IDS.vendorTenantId,
    versionNumber: 1,
    content: CLAUSE_CONTENT.gerichtsstand,
    parameters: CLAUSE_PARAMETERS.gerichtsstand,
    rules: [],
    status: 'published',
    authorId: SEED_IDS.vendorAuthorId,
    reviewerId: SEED_IDS.vendorReviewerId,
    publishedAt: new Date('2026-01-01T00:00:00Z'),
  },
];

// Haftungsbeschraenkung is NOT in the contract's clauseVersionIds (optional, not selected)
export const MOCK_CLAUSE_VERSION_HAFTUNG = {
  id: SEED_IDS.cvHaftungsbeschraenkungId,
  clauseId: SEED_IDS.clauseHaftungsbeschraenkungId,
  tenantId: SEED_IDS.vendorTenantId,
  versionNumber: 1,
  content: CLAUSE_CONTENT.haftungsbeschraenkung,
  parameters: CLAUSE_PARAMETERS.haftungsbeschraenkung,
  rules: [
    {
      type: 'incompatible_with',
      targetClauseId: '00000000-0000-0000-0010-000000000004',
      severity: 'hard',
      message: 'Haftungsbeschränkung ist unvereinbar mit Vollhaftungsklausel.',
    },
  ],
  status: 'published',
  authorId: SEED_IDS.vendorAuthorId,
  reviewerId: SEED_IDS.vendorReviewerId,
  publishedAt: new Date('2026-01-01T00:00:00Z'),
};

// ============================================================================
// Mock StyleTemplate (as returned by DB)
// ============================================================================

export const MOCK_STYLE_TEMPLATE = {
  id: SEED_IDS.styleTemplateId,
  tenantId: SEED_IDS.vendorTenantId,
  name: 'Standard (Servanda)',
  description: 'Standard-Formatvorlage des Servanda Verlags.',
  type: 'system',
  templateFile: 'templates/default-style.docx',
  headerConfig: { showLogo: false, showTenantName: true },
  footerConfig: { showPageNumbers: true, showDate: true },
  isDefault: true,
};

// ============================================================================
// Expected ExportData (output of DataLoader for seed contract)
// ============================================================================

export function buildExpectedExportData(): ExportData {
  return {
    contractTitle: 'Kaufvertrag Mandant Müller',
    clientReference: 'AZ-2026-001',
    answers: SEED_ANSWERS,
    sections: [
      {
        title: 'Vertragsgegenstand',
        clauses: [
          {
            content: CLAUSE_CONTENT.vertragsgegenstand,
            parameters: CLAUSE_PARAMETERS.vertragsgegenstand as unknown as Record<string, unknown>,
          },
        ],
      },
      {
        title: 'Gewährleistung',
        clauses: [
          {
            content: CLAUSE_CONTENT.gewaehrleistung,
            parameters: CLAUSE_PARAMETERS.gewaehrleistung as unknown as Record<string, unknown>,
          },
        ],
      },
      {
        title: 'Haftung',
        // Optional slot — Haftungsbeschraenkung NOT in clauseVersionIds → skipped
        clauses: [],
      },
      {
        title: 'Schlussbestimmungen',
        clauses: [
          {
            content: CLAUSE_CONTENT.gerichtsstand,
            parameters: CLAUSE_PARAMETERS.gerichtsstand as unknown as Record<string, unknown>,
          },
        ],
      },
    ],
  };
}

// ============================================================================
// RenderContext objects (as built by docx-renderer.buildRenderContext)
// ============================================================================

export function buildSeedRenderContext(): Record<string, unknown> {
  const exportData = buildExpectedExportData();
  return {
    contractTitle: exportData.contractTitle,
    clientReference: exportData.clientReference ?? '',
    // createdDate is dynamic — tests should use expect.stringMatching for this
    sections: exportData.sections.map((section, sIdx) => ({
      sectionNumber: sIdx + 1,
      sectionTitle: section.title,
      clauses: section.clauses.map((clause, cIdx) => ({
        clauseNumber: `${sIdx + 1}.${cIdx + 1}`,
        clauseContent: substituteParametersForFixture(clause.content, exportData.answers),
      })),
    })),
    // Flattened answers with answer_ prefix
    answer_kaufpreis: 50000,
    answer_gewaehrleistungsfrist: 24,
    answer_haftungsbeschraenkung: false,
    answer_gerichtsort: 'Berlin',
  };
}

/**
 * Mirrors docx-renderer.substituteParameters for fixture generation.
 */
function substituteParametersForFixture(
  content: string,
  answers: Record<string, unknown>,
): string {
  return content.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = answers[key];
    if (value === undefined || value === null || value === '') {
      return '[___]';
    }
    return String(value);
  });
}

// ============================================================================
// RenderContext with empty answers (for placeholder test)
// ============================================================================

export function buildRenderContextWithEmptyAnswers(): Record<string, unknown> {
  const exportData = buildExpectedExportData();
  const emptyAnswers: Record<string, unknown> = {
    kaufpreis: '',
    gewaehrleistungsfrist: '',
    haftungsbeschraenkung: '',
    gerichtsort: '',
  };

  return {
    contractTitle: exportData.contractTitle,
    clientReference: exportData.clientReference ?? '',
    sections: exportData.sections.map((section, sIdx) => ({
      sectionNumber: sIdx + 1,
      sectionTitle: section.title,
      clauses: section.clauses.map((clause, cIdx) => ({
        clauseNumber: `${sIdx + 1}.${cIdx + 1}`,
        clauseContent: substituteParametersForFixture(clause.content, emptyAnswers),
      })),
    })),
    answer_kaufpreis: '',
    answer_gewaehrleistungsfrist: '',
    answer_haftungsbeschraenkung: '',
    answer_gerichtsort: '',
  };
}

// ============================================================================
// Multi-section ExportData (all 4 clauses including optional)
// ============================================================================

export function buildFullExportData(): ExportData {
  return {
    contractTitle: 'Kaufvertrag Vollständig',
    clientReference: 'AZ-2026-FULL',
    answers: SEED_ANSWERS,
    sections: [
      {
        title: 'Vertragsgegenstand',
        clauses: [
          {
            content: CLAUSE_CONTENT.vertragsgegenstand,
            parameters: CLAUSE_PARAMETERS.vertragsgegenstand as unknown as Record<string, unknown>,
          },
        ],
      },
      {
        title: 'Gewährleistung',
        clauses: [
          {
            content: CLAUSE_CONTENT.gewaehrleistung,
            parameters: CLAUSE_PARAMETERS.gewaehrleistung as unknown as Record<string, unknown>,
          },
        ],
      },
      {
        title: 'Haftung',
        clauses: [
          {
            content: CLAUSE_CONTENT.haftungsbeschraenkung,
            parameters: CLAUSE_PARAMETERS.haftungsbeschraenkung as unknown as Record<string, unknown>,
          },
        ],
      },
      {
        title: 'Schlussbestimmungen',
        clauses: [
          {
            content: CLAUSE_CONTENT.gerichtsstand,
            parameters: CLAUSE_PARAMETERS.gerichtsstand as unknown as Record<string, unknown>,
          },
        ],
      },
    ],
  };
}
