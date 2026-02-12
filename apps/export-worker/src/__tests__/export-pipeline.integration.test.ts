/**
 * Export Pipeline Integration Tests — Sprint 9 (Team 05)
 *
 * Validates the entire export pipeline end-to-end:
 *   ContractInstance → DataLoader → DocxRenderer → Buffer
 *
 * Tests cover:
 * 1.  DataLoader: Seed-Contract laden, gepinnte Versionen korrekt
 * 2.  DataLoader: Slot-Resolution (richtige Klauseln fuer aktive Slots)
 * 3.  DocxRenderer: RenderContext korrekt aufgebaut
 * 4.  DocxRenderer: Parameter-Substitution (Antworten in Klausel-Text)
 * 5.  DocxRenderer: Leere Antworten → Platzhalter
 * 6.  DocxRenderer: Multi-Section-Template Reihenfolge
 * 7.  Feature-Flag: ODT disabled → Export abgelehnt
 * 8.  Feature-Flag: ODT enabled → Konvertierung aufgerufen
 * 9.  Pipeline komplett: Contract → DataLoader → Renderer → Buffer (nicht leer)
 * 10. Error-Handling: Nicht-existenter Contract → sinnvoller Fehler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SEED_IDS,
  CLAUSE_CONTENT,
  SEED_ANSWERS,
  MOCK_CONTRACT_INSTANCE,
  MOCK_TEMPLATE_VERSION,
  MOCK_CLAUSE_VERSIONS,
  MOCK_CLAUSE_VERSION_HAFTUNG,
  MOCK_STYLE_TEMPLATE,
  TEMPLATE_STRUCTURE,
  buildExpectedExportData,
  buildFullExportData,
} from './fixtures/seed-contract';

// ============================================================================
// Mock: @prisma/client
// ============================================================================

const mockExecuteRawUnsafe = vi.fn().mockResolvedValue(undefined);
const mockContractInstanceFindFirst = vi.fn();
const mockTemplateVersionFindUnique = vi.fn();
const mockClauseVersionFindMany = vi.fn();
const mockStyleTemplateFindFirst = vi.fn();
const mockExportJobUpdate = vi.fn();
const mockDisconnect = vi.fn().mockResolvedValue(undefined);

vi.mock('@prisma/client', () => {
  const MockPrismaClient = vi.fn().mockImplementation(() => ({
    $executeRawUnsafe: mockExecuteRawUnsafe,
    $disconnect: mockDisconnect,
    contractInstance: { findFirst: mockContractInstanceFindFirst },
    templateVersion: { findUnique: mockTemplateVersionFindUnique },
    clauseVersion: { findMany: mockClauseVersionFindMany },
    styleTemplate: { findFirst: mockStyleTemplateFindFirst },
    exportJob: { update: mockExportJobUpdate },
  }));
  return { PrismaClient: MockPrismaClient };
});

// ============================================================================
// Mock: fs (for template loading in docx-renderer)
// ============================================================================

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    readFileSync: vi.fn().mockReturnValue(Buffer.from('PK-mock-docx-template')),
  };
});

// ============================================================================
// Mock: docxtemplater + pizzip (for DOCX generation)
// ============================================================================

const mockDocRender = vi.fn().mockReturnThis();
const mockGenerate = vi.fn().mockReturnValue(Buffer.from('PK-rendered-docx-output'));

vi.mock('docxtemplater', () => {
  const MockDocxtemplater = vi.fn().mockImplementation(() => ({
    render: mockDocRender,
    getZip: vi.fn().mockReturnValue({
      generate: mockGenerate,
    }),
  }));
  return { default: MockDocxtemplater };
});

vi.mock('pizzip', () => {
  const MockPizZip = vi.fn().mockImplementation(() => ({ files: {} }));
  return { default: MockPizZip };
});

// ============================================================================
// Mock: ODT converter
// ============================================================================

const mockConvertToOdt = vi.fn().mockResolvedValue(Buffer.from('PK-mock-odt-output'));

vi.mock('../renderers/odt-converter', () => ({
  convertToOdt: (...args: unknown[]) => mockConvertToOdt(...args),
}));

// ============================================================================
// Mock: S3 upload
// ============================================================================

const mockUploadToStorage = vi.fn().mockResolvedValue(undefined);

vi.mock('../storage/s3-client', () => ({
  uploadToStorage: (...args: unknown[]) => mockUploadToStorage(...args),
}));

// ============================================================================
// Mock: Logger
// ============================================================================

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ============================================================================
// Import SUT after mocks are in place
// ============================================================================

import { loadExportData } from '../data/data-loader';
import { renderDocx } from '../renderers/docx-renderer';
import { handleExportJob } from '../handlers/export-handler';
import { isOdtExportEnabled } from '../config/feature-flags';

// ============================================================================
// Helper: Configure Prisma mocks for seed contract
// ============================================================================

function setupPrismaMocksForSeedContract(): void {
  mockContractInstanceFindFirst.mockResolvedValue({ ...MOCK_CONTRACT_INSTANCE });
  mockTemplateVersionFindUnique.mockResolvedValue({ ...MOCK_TEMPLATE_VERSION });
  mockClauseVersionFindMany.mockResolvedValue([...MOCK_CLAUSE_VERSIONS]);
  mockStyleTemplateFindFirst.mockResolvedValue(null);
}

function setupPrismaMocksWithAllClauses(): void {
  // Contract that pins ALL 4 clause versions including the optional Haftungsbeschraenkung
  const contractWithAll = {
    ...MOCK_CONTRACT_INSTANCE,
    clauseVersionIds: [
      SEED_IDS.cvVertragsgegenstandId,
      SEED_IDS.cvGewaehrleistungId,
      SEED_IDS.cvHaftungsbeschraenkungId,
      SEED_IDS.cvGerichtsstandId,
    ],
  };
  mockContractInstanceFindFirst.mockResolvedValue(contractWithAll);
  mockTemplateVersionFindUnique.mockResolvedValue({ ...MOCK_TEMPLATE_VERSION });
  mockClauseVersionFindMany.mockResolvedValue([
    ...MOCK_CLAUSE_VERSIONS,
    { ...MOCK_CLAUSE_VERSION_HAFTUNG },
  ]);
  mockStyleTemplateFindFirst.mockResolvedValue(null);
}

// ============================================================================
// Tests
// ============================================================================

describe('Export Pipeline Integration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.FEATURE_ODT_EXPORT;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // --------------------------------------------------------------------------
  // 1. DataLoader: Seed-Contract laden, gepinnte Versionen korrekt
  // --------------------------------------------------------------------------
  describe('1. DataLoader: Seed-Contract mit gepinnten Versionen', () => {
    it('should load seed contract and return correct pinned clause versions', async () => {
      setupPrismaMocksForSeedContract();

      const exportData = await loadExportData(
        SEED_IDS.lawfirmTenantId,
        SEED_IDS.contractInstanceId,
      );

      // Contract metadata
      expect(exportData.contractTitle).toBe('Kaufvertrag Mandant Müller');
      expect(exportData.clientReference).toBe('AZ-2026-001');

      // Answers preserved from contract instance
      expect(exportData.answers).toEqual(SEED_ANSWERS);

      // Pinned versions: 3 clause versions (Vertragsgegenstand, Gewaehrleistung, Gerichtsstand)
      // Haftungsbeschraenkung is optional and NOT pinned
      const allClauses = exportData.sections.flatMap((s) => s.clauses);
      expect(allClauses).toHaveLength(3);

      // Verify RLS context was set
      expect(mockExecuteRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL app.current_tenant_id = '${SEED_IDS.lawfirmTenantId}'`,
      );

      // Verify contract was loaded with correct tenant isolation
      expect(mockContractInstanceFindFirst).toHaveBeenCalledWith({
        where: { id: SEED_IDS.contractInstanceId, tenantId: SEED_IDS.lawfirmTenantId },
      });

      // Verify clause versions were loaded by pinned IDs
      expect(mockClauseVersionFindMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: [
              SEED_IDS.cvVertragsgegenstandId,
              SEED_IDS.cvGewaehrleistungId,
              SEED_IDS.cvGerichtsstandId,
            ],
          },
        },
      });
    });

    it('should preserve clause content from pinned versions unchanged', async () => {
      setupPrismaMocksForSeedContract();

      const exportData = await loadExportData(
        SEED_IDS.lawfirmTenantId,
        SEED_IDS.contractInstanceId,
      );

      // Section 0 (Vertragsgegenstand) should have the exact clause content
      expect(exportData.sections[0].clauses[0].content).toBe(
        CLAUSE_CONTENT.vertragsgegenstand,
      );

      // Section 1 (Gewaehrleistung) should have the exact clause content
      expect(exportData.sections[1].clauses[0].content).toBe(
        CLAUSE_CONTENT.gewaehrleistung,
      );

      // Section 3 (Schlussbestimmungen / Gerichtsstand) should have the exact clause content
      expect(exportData.sections[3].clauses[0].content).toBe(
        CLAUSE_CONTENT.gerichtsstand,
      );
    });
  });

  // --------------------------------------------------------------------------
  // 2. DataLoader: Slot-Resolution
  // --------------------------------------------------------------------------
  describe('2. DataLoader: Slot-Resolution', () => {
    it('should skip optional slots when clause version is not pinned', async () => {
      setupPrismaMocksForSeedContract();

      const exportData = await loadExportData(
        SEED_IDS.lawfirmTenantId,
        SEED_IDS.contractInstanceId,
      );

      // Section 2 = "Haftung" with optional Haftungsbeschraenkung
      // Since the clause version is NOT in clauseVersionIds, the optional slot is skipped
      const haftungSection = exportData.sections[2];
      expect(haftungSection.title).toBe('Haftung');
      expect(haftungSection.clauses).toHaveLength(0);
    });

    it('should include optional slot when clause version IS pinned', async () => {
      setupPrismaMocksWithAllClauses();

      const exportData = await loadExportData(
        SEED_IDS.lawfirmTenantId,
        SEED_IDS.contractInstanceId,
      );

      // Now all 4 sections have clauses
      const haftungSection = exportData.sections[2];
      expect(haftungSection.title).toBe('Haftung');
      expect(haftungSection.clauses).toHaveLength(1);
      expect(haftungSection.clauses[0].content).toBe(
        CLAUSE_CONTENT.haftungsbeschraenkung,
      );
    });

    it('should resolve selectedSlots override for alternative clauses', async () => {
      const alternativeClauseId = '00000000-0000-0000-0010-000000000099';
      const alternativeClauseVersionContent = 'Alternativer Gerichtsstand: Hamburg.';

      const contractWithOverride = {
        ...MOCK_CONTRACT_INSTANCE,
        // selectedSlots overrides the Gerichtsstand slot with an alternative
        selectedSlots: {
          [SEED_IDS.clauseGerichtsstandId]: alternativeClauseId,
        },
        clauseVersionIds: [
          SEED_IDS.cvVertragsgegenstandId,
          SEED_IDS.cvGewaehrleistungId,
          // The alternative clause version is pinned instead
          '00000000-0000-0000-0011-000000000099',
        ],
      };

      mockContractInstanceFindFirst.mockResolvedValue(contractWithOverride);
      mockTemplateVersionFindUnique.mockResolvedValue({ ...MOCK_TEMPLATE_VERSION });
      mockClauseVersionFindMany.mockResolvedValue([
        MOCK_CLAUSE_VERSIONS[0], // Vertragsgegenstand
        MOCK_CLAUSE_VERSIONS[1], // Gewaehrleistung
        {
          id: '00000000-0000-0000-0011-000000000099',
          clauseId: alternativeClauseId,
          tenantId: SEED_IDS.vendorTenantId,
          versionNumber: 1,
          content: alternativeClauseVersionContent,
          parameters: {},
          rules: [],
          status: 'published',
        },
      ]);
      mockStyleTemplateFindFirst.mockResolvedValue(null);

      const exportData = await loadExportData(
        SEED_IDS.lawfirmTenantId,
        SEED_IDS.contractInstanceId,
      );

      // Schlussbestimmungen should now use the alternative clause
      const schlussSection = exportData.sections[3];
      expect(schlussSection.title).toBe('Schlussbestimmungen');
      expect(schlussSection.clauses[0].content).toBe(alternativeClauseVersionContent);
    });

    it('should load style template path when styleTemplateId is provided', async () => {
      setupPrismaMocksForSeedContract();
      mockStyleTemplateFindFirst.mockResolvedValue({ ...MOCK_STYLE_TEMPLATE });

      const exportData = await loadExportData(
        SEED_IDS.lawfirmTenantId,
        SEED_IDS.contractInstanceId,
        SEED_IDS.styleTemplateId,
      );

      expect(exportData.styleTemplatePath).toBe('templates/default-style.docx');
      expect(mockStyleTemplateFindFirst).toHaveBeenCalledWith({
        where: { id: SEED_IDS.styleTemplateId },
      });
    });
  });

  // --------------------------------------------------------------------------
  // 3. DocxRenderer: RenderContext korrekt aufgebaut
  // --------------------------------------------------------------------------
  describe('3. DocxRenderer: RenderContext-Aufbau', () => {
    it('should pass correct render context to docxtemplater', async () => {
      setupPrismaMocksForSeedContract();

      const exportData = await loadExportData(
        SEED_IDS.lawfirmTenantId,
        SEED_IDS.contractInstanceId,
      );

      await renderDocx(exportData);

      // Verify that docxtemplater.render() was called
      expect(mockDocRender).toHaveBeenCalledTimes(1);

      // Extract the render context passed to doc.render()
      const renderContext = mockDocRender.mock.calls[0][0] as Record<string, unknown>;

      // Contract metadata
      expect(renderContext.contractTitle).toBe('Kaufvertrag Mandant Müller');
      expect(renderContext.clientReference).toBe('AZ-2026-001');
      expect(renderContext.createdDate).toBeDefined();

      // Sections structure
      const sections = renderContext.sections as Array<{
        sectionNumber: number;
        sectionTitle: string;
        clauses: Array<{ clauseNumber: string; clauseContent: string }>;
      }>;
      expect(sections).toHaveLength(4);

      // Section numbering starts at 1
      expect(sections[0].sectionNumber).toBe(1);
      expect(sections[0].sectionTitle).toBe('Vertragsgegenstand');
      expect(sections[1].sectionNumber).toBe(2);
      expect(sections[1].sectionTitle).toBe('Gewährleistung');
      expect(sections[2].sectionNumber).toBe(3);
      expect(sections[2].sectionTitle).toBe('Haftung');
      expect(sections[3].sectionNumber).toBe(4);
      expect(sections[3].sectionTitle).toBe('Schlussbestimmungen');

      // Clause numbering format: "sectionNum.clauseNum"
      expect(sections[0].clauses[0].clauseNumber).toBe('1.1');
      expect(sections[1].clauses[0].clauseNumber).toBe('2.1');
    });

    it('should flatten answers with answer_ prefix', async () => {
      setupPrismaMocksForSeedContract();

      const exportData = await loadExportData(
        SEED_IDS.lawfirmTenantId,
        SEED_IDS.contractInstanceId,
      );

      await renderDocx(exportData);

      const renderContext = mockDocRender.mock.calls[0][0] as Record<string, unknown>;

      // Flattened answers
      expect(renderContext.answer_kaufpreis).toBe(50000);
      expect(renderContext.answer_gewaehrleistungsfrist).toBe(24);
      expect(renderContext.answer_haftungsbeschraenkung).toBe(false);
      expect(renderContext.answer_gerichtsort).toBe('Berlin');
    });
  });

  // --------------------------------------------------------------------------
  // 4. DocxRenderer: Parameter-Substitution
  // --------------------------------------------------------------------------
  describe('4. DocxRenderer: Parameter-Substitution', () => {
    it('should substitute {{param}} tags in clause content with answer values', async () => {
      // Create export data with double-brace parameters in clause content
      const exportDataWithDoubleBraces = {
        contractTitle: 'Test Vertrag',
        clientReference: 'TEST-001',
        answers: { kaufpreis: 50000, gerichtsort: 'Berlin' } as Record<string, unknown>,
        sections: [
          {
            title: 'Vertragsgegenstand',
            clauses: [
              {
                content: 'Kaufpreis: {{kaufpreis}} EUR',
                parameters: {},
              },
            ],
          },
          {
            title: 'Schlussbestimmungen',
            clauses: [
              {
                content: 'Gerichtsstand: {{gerichtsort}}',
                parameters: {},
              },
            ],
          },
        ],
      };

      await renderDocx(exportDataWithDoubleBraces);

      const renderContext = mockDocRender.mock.calls[0][0] as Record<string, unknown>;
      const sections = renderContext.sections as Array<{
        clauses: Array<{ clauseContent: string }>;
      }>;

      // {{kaufpreis}} should be replaced with 50000
      expect(sections[0].clauses[0].clauseContent).toBe('Kaufpreis: 50000 EUR');

      // {{gerichtsort}} should be replaced with Berlin
      expect(sections[1].clauses[0].clauseContent).toBe('Gerichtsstand: Berlin');
    });

    it('should preserve single-brace {param} markers without substitution', async () => {
      // Seed data uses single-brace {kaufpreis} — these should NOT be substituted
      // by the renderer's substituteParameters (which targets {{...}})
      setupPrismaMocksForSeedContract();

      const exportData = await loadExportData(
        SEED_IDS.lawfirmTenantId,
        SEED_IDS.contractInstanceId,
      );

      await renderDocx(exportData);

      const renderContext = mockDocRender.mock.calls[0][0] as Record<string, unknown>;
      const sections = renderContext.sections as Array<{
        clauses: Array<{ clauseContent: string }>;
      }>;

      // Content still has {kaufpreis} (single brace) — not substituted by substituteParameters
      expect(sections[0].clauses[0].clauseContent).toContain('{kaufpreis}');
    });
  });

  // --------------------------------------------------------------------------
  // 5. DocxRenderer: Leere Antworten → Platzhalter
  // --------------------------------------------------------------------------
  describe('5. DocxRenderer: Leere Antworten und Platzhalter', () => {
    it('should replace {{param}} with [___] placeholder when answer is empty string', async () => {
      const exportDataEmptyAnswers = {
        contractTitle: 'Vertrag ohne Antworten',
        answers: { kaufpreis: '', gerichtsort: '' } as Record<string, unknown>,
        sections: [
          {
            title: 'Vertragsgegenstand',
            clauses: [
              { content: 'Kaufpreis: {{kaufpreis}} EUR', parameters: {} },
            ],
          },
          {
            title: 'Schlussbestimmungen',
            clauses: [
              { content: 'Gerichtsstand: {{gerichtsort}}', parameters: {} },
            ],
          },
        ],
      };

      await renderDocx(exportDataEmptyAnswers);

      const renderContext = mockDocRender.mock.calls[0][0] as Record<string, unknown>;
      const sections = renderContext.sections as Array<{
        clauses: Array<{ clauseContent: string }>;
      }>;

      expect(sections[0].clauses[0].clauseContent).toBe('Kaufpreis: [___] EUR');
      expect(sections[1].clauses[0].clauseContent).toBe('Gerichtsstand: [___]');
    });

    it('should replace {{param}} with [___] when answer is null', async () => {
      const exportDataNull = {
        contractTitle: 'Vertrag Null-Werte',
        answers: { kaufpreis: null } as Record<string, unknown>,
        sections: [
          {
            title: 'Test',
            clauses: [
              { content: 'Preis: {{kaufpreis}} EUR', parameters: {} },
            ],
          },
        ],
      };

      await renderDocx(exportDataNull);

      const renderContext = mockDocRender.mock.calls[0][0] as Record<string, unknown>;
      const sections = renderContext.sections as Array<{
        clauses: Array<{ clauseContent: string }>;
      }>;

      expect(sections[0].clauses[0].clauseContent).toBe('Preis: [___] EUR');
    });

    it('should replace {{param}} with [___] when answer key does not exist', async () => {
      const exportDataMissing = {
        contractTitle: 'Vertrag fehlende Antworten',
        answers: {} as Record<string, unknown>,
        sections: [
          {
            title: 'Test',
            clauses: [
              { content: 'Ort: {{gerichtsort}}, Preis: {{kaufpreis}}', parameters: {} },
            ],
          },
        ],
      };

      await renderDocx(exportDataMissing);

      const renderContext = mockDocRender.mock.calls[0][0] as Record<string, unknown>;
      const sections = renderContext.sections as Array<{
        clauses: Array<{ clauseContent: string }>;
      }>;

      expect(sections[0].clauses[0].clauseContent).toBe('Ort: [___], Preis: [___]');
    });
  });

  // --------------------------------------------------------------------------
  // 6. DocxRenderer: Multi-Section-Template Reihenfolge
  // --------------------------------------------------------------------------
  describe('6. DocxRenderer: Multi-Section-Template Reihenfolge', () => {
    it('should preserve section order from template structure (4 sections)', async () => {
      setupPrismaMocksWithAllClauses();

      const exportData = await loadExportData(
        SEED_IDS.lawfirmTenantId,
        SEED_IDS.contractInstanceId,
      );

      await renderDocx(exportData);

      const renderContext = mockDocRender.mock.calls[0][0] as Record<string, unknown>;
      const sections = renderContext.sections as Array<{
        sectionNumber: number;
        sectionTitle: string;
        clauses: Array<{ clauseNumber: string; clauseContent: string }>;
      }>;

      expect(sections).toHaveLength(4);

      // Strict order from TEMPLATE_STRUCTURE
      const sectionTitles = sections.map((s) => s.sectionTitle);
      expect(sectionTitles).toEqual([
        'Vertragsgegenstand',
        'Gewährleistung',
        'Haftung',
        'Schlussbestimmungen',
      ]);

      // Section numbers must be sequential
      expect(sections.map((s) => s.sectionNumber)).toEqual([1, 2, 3, 4]);
    });

    it('should produce correct clause numbering across multiple sections', async () => {
      // Use export data that has multiple clauses per section
      const multiClauseData = {
        contractTitle: 'Multi-Klausel-Vertrag',
        answers: {} as Record<string, unknown>,
        sections: [
          {
            title: 'Abschnitt A',
            clauses: [
              { content: 'Klausel A1', parameters: {} },
              { content: 'Klausel A2', parameters: {} },
            ],
          },
          {
            title: 'Abschnitt B',
            clauses: [
              { content: 'Klausel B1', parameters: {} },
              { content: 'Klausel B2', parameters: {} },
              { content: 'Klausel B3', parameters: {} },
            ],
          },
        ],
      };

      await renderDocx(multiClauseData);

      const renderContext = mockDocRender.mock.calls[0][0] as Record<string, unknown>;
      const sections = renderContext.sections as Array<{
        clauses: Array<{ clauseNumber: string }>;
      }>;

      // Section 1 clauses: 1.1, 1.2
      expect(sections[0].clauses[0].clauseNumber).toBe('1.1');
      expect(sections[0].clauses[1].clauseNumber).toBe('1.2');

      // Section 2 clauses: 2.1, 2.2, 2.3
      expect(sections[1].clauses[0].clauseNumber).toBe('2.1');
      expect(sections[1].clauses[1].clauseNumber).toBe('2.2');
      expect(sections[1].clauses[2].clauseNumber).toBe('2.3');
    });

    it('should handle empty sections (optional slot skipped) in section order', async () => {
      setupPrismaMocksForSeedContract();

      const exportData = await loadExportData(
        SEED_IDS.lawfirmTenantId,
        SEED_IDS.contractInstanceId,
      );

      await renderDocx(exportData);

      const renderContext = mockDocRender.mock.calls[0][0] as Record<string, unknown>;
      const sections = renderContext.sections as Array<{
        sectionNumber: number;
        sectionTitle: string;
        clauses: Array<{ clauseNumber: string }>;
      }>;

      // Haftung section exists but has 0 clauses (optional slot skipped)
      expect(sections[2].sectionTitle).toBe('Haftung');
      expect(sections[2].clauses).toHaveLength(0);
      expect(sections[2].sectionNumber).toBe(3);

      // Schlussbestimmungen still comes after Haftung at index 3
      expect(sections[3].sectionTitle).toBe('Schlussbestimmungen');
      expect(sections[3].sectionNumber).toBe(4);
    });
  });

  // --------------------------------------------------------------------------
  // 7. Feature-Flag: ODT disabled → Export abgelehnt
  // --------------------------------------------------------------------------
  describe('7. Feature-Flag: ODT disabled', () => {
    it('should reject ODT export when feature flag is disabled (default)', () => {
      delete process.env.FEATURE_ODT_EXPORT;

      const result = isOdtExportEnabled(null);
      expect(result).toBe(false);
    });

    it('should reject ODT export when tenant disables it explicitly', () => {
      const settings = { features: { odt_export_enabled: false } };
      expect(isOdtExportEnabled(settings)).toBe(false);
    });

    it('should reject ODT when env var is set to false even with no tenant settings', () => {
      process.env.FEATURE_ODT_EXPORT = 'false';
      expect(isOdtExportEnabled(null)).toBe(false);
    });

    it('should not call ODT converter in handleExportJob when format is docx', async () => {
      setupPrismaMocksForSeedContract();
      mockExportJobUpdate.mockResolvedValue({});

      await handleExportJob({
        exportJobId: 'job-001',
        tenantId: SEED_IDS.lawfirmTenantId,
        contractInstanceId: SEED_IDS.contractInstanceId,
        format: 'docx',
      });

      // ODT converter should NOT have been called
      expect(mockConvertToOdt).not.toHaveBeenCalled();

      // But DOCX render should have completed
      expect(mockDocRender).toHaveBeenCalledTimes(1);
      expect(mockUploadToStorage).toHaveBeenCalledTimes(1);

      // Storage path should end with .docx
      const storagePath = mockUploadToStorage.mock.calls[0][0] as string;
      expect(storagePath).toMatch(/\.docx$/);
    });
  });

  // --------------------------------------------------------------------------
  // 8. Feature-Flag: ODT enabled → Konvertierung aufgerufen
  // --------------------------------------------------------------------------
  describe('8. Feature-Flag: ODT enabled', () => {
    it('should allow ODT export when tenant enables it', () => {
      const settings = { features: { odt_export_enabled: true } };
      expect(isOdtExportEnabled(settings)).toBe(true);
    });

    it('should allow ODT export when env var is true', () => {
      process.env.FEATURE_ODT_EXPORT = 'true';
      expect(isOdtExportEnabled(null)).toBe(true);
    });

    it('should call ODT converter in handleExportJob when format is odt', async () => {
      setupPrismaMocksForSeedContract();
      mockExportJobUpdate.mockResolvedValue({});

      await handleExportJob({
        exportJobId: 'job-odt-001',
        tenantId: SEED_IDS.lawfirmTenantId,
        contractInstanceId: SEED_IDS.contractInstanceId,
        format: 'odt',
      });

      // ODT converter should have been called with the DOCX buffer and job ID
      expect(mockConvertToOdt).toHaveBeenCalledTimes(1);
      expect(mockConvertToOdt).toHaveBeenCalledWith(
        expect.any(Buffer),
        'job-odt-001',
      );

      // Storage path should end with .odt
      const storagePath = mockUploadToStorage.mock.calls[0][0] as string;
      expect(storagePath).toMatch(/\.odt$/);
      expect(storagePath).toContain(SEED_IDS.lawfirmTenantId);
    });

    it('should pass DOCX buffer to ODT converter (not raw template)', async () => {
      setupPrismaMocksForSeedContract();
      mockExportJobUpdate.mockResolvedValue({});

      await handleExportJob({
        exportJobId: 'job-odt-002',
        tenantId: SEED_IDS.lawfirmTenantId,
        contractInstanceId: SEED_IDS.contractInstanceId,
        format: 'odt',
      });

      // The buffer passed to convertToOdt should be the rendered DOCX output
      const convertedBuffer = mockConvertToOdt.mock.calls[0][0] as Buffer;
      expect(convertedBuffer).toBeInstanceOf(Buffer);
      expect(convertedBuffer.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // 9. Pipeline komplett: Contract → DataLoader → Renderer → Buffer
  // --------------------------------------------------------------------------
  describe('9. Pipeline komplett: End-to-End', () => {
    it('should produce a non-empty DOCX buffer from seed contract data', async () => {
      setupPrismaMocksForSeedContract();
      mockExportJobUpdate.mockResolvedValue({});

      await handleExportJob({
        exportJobId: 'job-e2e-001',
        tenantId: SEED_IDS.lawfirmTenantId,
        contractInstanceId: SEED_IDS.contractInstanceId,
        format: 'docx',
      });

      // 1. DataLoader was called (Prisma mocks)
      expect(mockContractInstanceFindFirst).toHaveBeenCalledTimes(1);
      expect(mockTemplateVersionFindUnique).toHaveBeenCalledTimes(1);
      expect(mockClauseVersionFindMany).toHaveBeenCalledTimes(1);

      // 2. DOCX was rendered
      expect(mockDocRender).toHaveBeenCalledTimes(1);
      expect(mockGenerate).toHaveBeenCalledTimes(1);

      // 3. Buffer was uploaded to storage
      expect(mockUploadToStorage).toHaveBeenCalledTimes(1);
      const uploadedBuffer = mockUploadToStorage.mock.calls[0][1] as Buffer;
      expect(uploadedBuffer).toBeInstanceOf(Buffer);
      expect(uploadedBuffer.length).toBeGreaterThan(0);

      // 4. Job status was updated to 'done'
      expect(mockExportJobUpdate).toHaveBeenCalledWith({
        where: { id: 'job-e2e-001' },
        data: expect.objectContaining({
          status: 'done',
          resultStoragePath: expect.stringContaining('job-e2e-001.docx'),
          resultFileSize: expect.any(Number),
          completedAt: expect.any(Date),
        }),
      });
    });

    it('should construct correct storage path: {tenantId}/exports/{jobId}.{format}', async () => {
      setupPrismaMocksForSeedContract();
      mockExportJobUpdate.mockResolvedValue({});

      await handleExportJob({
        exportJobId: 'job-path-001',
        tenantId: SEED_IDS.lawfirmTenantId,
        contractInstanceId: SEED_IDS.contractInstanceId,
        format: 'docx',
      });

      const expectedPath = `${SEED_IDS.lawfirmTenantId}/exports/job-path-001.docx`;
      expect(mockUploadToStorage).toHaveBeenCalledWith(expectedPath, expect.any(Buffer));
    });

    it('should record file size in export job update', async () => {
      setupPrismaMocksForSeedContract();
      mockExportJobUpdate.mockResolvedValue({});

      await handleExportJob({
        exportJobId: 'job-size-001',
        tenantId: SEED_IDS.lawfirmTenantId,
        contractInstanceId: SEED_IDS.contractInstanceId,
        format: 'docx',
      });

      const updateCall = mockExportJobUpdate.mock.calls[0][0] as {
        data: { resultFileSize: number };
      };
      expect(updateCall.data.resultFileSize).toBeGreaterThan(0);
      // File size should match the buffer length from the mock
      expect(updateCall.data.resultFileSize).toBe(
        Buffer.from('PK-rendered-docx-output').length,
      );
    });

    it('should handle style template in full pipeline', async () => {
      setupPrismaMocksForSeedContract();
      mockStyleTemplateFindFirst.mockResolvedValue({ ...MOCK_STYLE_TEMPLATE });
      mockExportJobUpdate.mockResolvedValue({});

      await handleExportJob({
        exportJobId: 'job-style-001',
        tenantId: SEED_IDS.lawfirmTenantId,
        contractInstanceId: SEED_IDS.contractInstanceId,
        format: 'docx',
        styleTemplateId: SEED_IDS.styleTemplateId,
      });

      // Style template should have been looked up
      expect(mockStyleTemplateFindFirst).toHaveBeenCalledWith({
        where: { id: SEED_IDS.styleTemplateId },
      });

      // Full pipeline completed successfully
      expect(mockExportJobUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'done' }),
        }),
      );
    });
  });

  // --------------------------------------------------------------------------
  // 10. Error-Handling: Nicht-existenter Contract → sinnvoller Fehler
  // --------------------------------------------------------------------------
  describe('10. Error-Handling', () => {
    it('should throw descriptive error for non-existent contract instance', async () => {
      mockContractInstanceFindFirst.mockResolvedValue(null);

      await expect(
        loadExportData(
          SEED_IDS.lawfirmTenantId,
          SEED_IDS.nonExistentContractId,
        ),
      ).rejects.toThrow(
        `ContractInstance ${SEED_IDS.nonExistentContractId} not found for tenant ${SEED_IDS.lawfirmTenantId}`,
      );
    });

    it('should throw descriptive error for non-existent template version', async () => {
      mockContractInstanceFindFirst.mockResolvedValue({
        ...MOCK_CONTRACT_INSTANCE,
        templateVersionId: 'non-existent-template-version',
      });
      mockTemplateVersionFindUnique.mockResolvedValue(null);

      await expect(
        loadExportData(
          SEED_IDS.lawfirmTenantId,
          SEED_IDS.contractInstanceId,
        ),
      ).rejects.toThrow('TemplateVersion non-existent-template-version not found');
    });

    it('should include placeholder for required slot when clause version is missing', async () => {
      // Contract pins clause versions but one is missing from the DB
      mockContractInstanceFindFirst.mockResolvedValue({ ...MOCK_CONTRACT_INSTANCE });
      mockTemplateVersionFindUnique.mockResolvedValue({ ...MOCK_TEMPLATE_VERSION });
      // Return only Vertragsgegenstand — Gewaehrleistung and Gerichtsstand are missing
      mockClauseVersionFindMany.mockResolvedValue([MOCK_CLAUSE_VERSIONS[0]]);
      mockStyleTemplateFindFirst.mockResolvedValue(null);

      const exportData = await loadExportData(
        SEED_IDS.lawfirmTenantId,
        SEED_IDS.contractInstanceId,
      );

      // Section 0 (Vertragsgegenstand) — found
      expect(exportData.sections[0].clauses[0].content).toBe(
        CLAUSE_CONTENT.vertragsgegenstand,
      );

      // Section 1 (Gewaehrleistung) — required but missing → placeholder
      expect(exportData.sections[1].clauses[0].content).toMatch(
        /\[Klausel nicht gefunden:.*\]/,
      );

      // Section 2 (Haftung) — optional and missing → skipped (0 clauses)
      expect(exportData.sections[2].clauses).toHaveLength(0);

      // Section 3 (Schlussbestimmungen / Gerichtsstand) — required but missing → placeholder
      expect(exportData.sections[3].clauses[0].content).toMatch(
        /\[Klausel nicht gefunden:.*\]/,
      );
    });

    it('should propagate DataLoader errors through handleExportJob', async () => {
      mockContractInstanceFindFirst.mockResolvedValue(null);

      await expect(
        handleExportJob({
          exportJobId: 'job-error-001',
          tenantId: SEED_IDS.lawfirmTenantId,
          contractInstanceId: SEED_IDS.nonExistentContractId,
          format: 'docx',
        }),
      ).rejects.toThrow(/not found/);

      // Upload and job update should NOT have been called
      expect(mockUploadToStorage).not.toHaveBeenCalled();
      expect(mockExportJobUpdate).not.toHaveBeenCalled();
    });

    it('should set RLS context before any query to enforce tenant isolation', async () => {
      setupPrismaMocksForSeedContract();

      await loadExportData(
        SEED_IDS.lawfirmTenantId,
        SEED_IDS.contractInstanceId,
      );

      // RLS context must be the FIRST call to prisma
      expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(1);
      expect(mockExecuteRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL app.current_tenant_id = '${SEED_IDS.lawfirmTenantId}'`,
      );

      // Ensure RLS was set before contract query
      const rlsCallOrder = mockExecuteRawUnsafe.mock.invocationCallOrder[0];
      const contractCallOrder =
        mockContractInstanceFindFirst.mock.invocationCallOrder[0];
      expect(rlsCallOrder).toBeLessThan(contractCallOrder);
    });
  });
});
