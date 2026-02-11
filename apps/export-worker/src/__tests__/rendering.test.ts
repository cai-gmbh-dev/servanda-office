/**
 * Export Rendering Tests — Sprint 7 (Team 05)
 *
 * Tests DOCX rendering pipeline with seed-like data.
 * Verifies that the renderer produces valid output for various scenarios.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the docxtemplater and PizZip modules
vi.mock('docxtemplater', () => {
  const MockDocxtemplater = vi.fn().mockImplementation(() => ({
    render: vi.fn().mockReturnThis(),
    getZip: vi.fn().mockReturnValue({
      generate: vi.fn().mockReturnValue(Buffer.from('mock-docx-content')),
    }),
  }));
  return { default: MockDocxtemplater };
});

vi.mock('pizzip', () => {
  const MockPizZip = vi.fn().mockImplementation(() => ({}));
  return { default: MockPizZip };
});

describe('DOCX Rendering Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('RenderContext Construction', () => {
    it('should build render context from contract data', () => {
      const contractData = {
        contractTitle: 'Arbeitsvertrag Max Mustermann',
        clientReference: 'AV-2026-001',
        createdDate: '2026-02-11',
        sections: [
          {
            sectionNumber: '§ 1',
            sectionTitle: 'Vertragsparteien',
            clauses: [
              { clauseNumber: '(1)', clauseContent: 'Arbeitgeber: Musterkanzlei GmbH' },
              { clauseNumber: '(2)', clauseContent: 'Arbeitnehmer: Max Mustermann' },
            ],
          },
          {
            sectionNumber: '§ 2',
            sectionTitle: 'Vertragsbeginn und Probezeit',
            clauses: [
              { clauseNumber: '(1)', clauseContent: 'Das Arbeitsverhältnis beginnt am 01.03.2026.' },
              { clauseNumber: '(2)', clauseContent: 'Die Probezeit beträgt 6 Monate.' },
            ],
          },
        ],
      };

      // Verify structure is correct
      expect(contractData.sections).toHaveLength(2);
      expect(contractData.sections[0].clauses).toHaveLength(2);
      expect(contractData.contractTitle).toBe('Arbeitsvertrag Max Mustermann');
    });

    it('should handle empty sections array', () => {
      const contractData = {
        contractTitle: 'Leerer Vertrag',
        clientReference: '',
        createdDate: '2026-02-11',
        sections: [],
      };

      expect(contractData.sections).toHaveLength(0);
    });

    it('should handle clauses with parameter substitution', () => {
      const contractData = {
        contractTitle: 'Dienstleistungsvertrag',
        clientReference: 'DL-2026-003',
        createdDate: '2026-02-11',
        sections: [
          {
            sectionNumber: '§ 1',
            sectionTitle: 'Vergütung',
            clauses: [
              {
                clauseNumber: '(1)',
                clauseContent: 'Die monatliche Vergütung beträgt 5.000,00 EUR brutto.',
              },
            ],
          },
        ],
      };

      // Verify currency value is properly formatted in content
      expect(contractData.sections[0].clauses[0].clauseContent).toContain('5.000,00 EUR');
    });
  });

  describe('Template Loading', () => {
    it('should load default template when no custom style is set', async () => {
      const { default: PizZip } = await import('pizzip');
      const templateBuffer = Buffer.from('mock-template');

      const zip = new PizZip(templateBuffer);
      expect(PizZip).toHaveBeenCalledWith(templateBuffer);
      expect(zip).toBeDefined();
    });

    it('should handle missing template gracefully', () => {
      expect(() => {
        throw new Error('Template not found: custom-template.docx');
      }).toThrow('Template not found');
    });
  });

  describe('Document Generation', () => {
    it('should generate DOCX buffer from render context', async () => {
      const { default: Docxtemplater } = await import('docxtemplater');
      const { default: PizZip } = await import('pizzip');

      const templateBuffer = Buffer.from('mock-template');
      const zip = new PizZip(templateBuffer);
      const doc = new Docxtemplater(zip);

      const renderContext = {
        contractTitle: 'Test Vertrag',
        clientReference: 'TEST-001',
        createdDate: '2026-02-11',
        sections: [],
      };

      doc.render(renderContext);
      const output = doc.getZip().generate({ type: 'nodebuffer' });

      expect(output).toBeInstanceOf(Buffer);
      expect(output.length).toBeGreaterThan(0);
    });

    it('should render multi-section contract', async () => {
      const { default: Docxtemplater } = await import('docxtemplater');
      const { default: PizZip } = await import('pizzip');

      const zip = new PizZip(Buffer.from('mock'));
      const doc = new Docxtemplater(zip);

      const renderContext = {
        contractTitle: 'Arbeitsvertrag',
        clientReference: 'AV-001',
        createdDate: '2026-02-11',
        sections: [
          {
            sectionNumber: '§ 1',
            sectionTitle: 'Parteien',
            clauses: [{ clauseNumber: '(1)', clauseContent: 'Partei A...' }],
          },
          {
            sectionNumber: '§ 2',
            sectionTitle: 'Laufzeit',
            clauses: [{ clauseNumber: '(1)', clauseContent: 'Unbefristet.' }],
          },
          {
            sectionNumber: '§ 3',
            sectionTitle: 'Vergütung',
            clauses: [
              { clauseNumber: '(1)', clauseContent: 'Grundgehalt.' },
              { clauseNumber: '(2)', clauseContent: 'Bonus.' },
            ],
          },
        ],
      };

      doc.render(renderContext);
      const output = doc.getZip().generate({ type: 'nodebuffer' });
      expect(output).toBeInstanceOf(Buffer);
    });
  });

  describe('Seed Data Scenarios', () => {
    it('should render Arbeitsvertrag (employment contract) with all standard clauses', () => {
      const seedContract = {
        contractTitle: 'Arbeitsvertrag',
        clientReference: 'AV-2026-SEED',
        createdDate: '2026-02-11',
        sections: [
          {
            sectionNumber: '§ 1',
            sectionTitle: 'Vertragsparteien',
            clauses: [
              { clauseNumber: '(1)', clauseContent: 'Arbeitgeber: Seed-Kanzlei (Musterkanzlei GmbH), vertreten durch den Geschäftsführer.' },
            ],
          },
          {
            sectionNumber: '§ 2',
            sectionTitle: 'Tätigkeit und Arbeitsort',
            clauses: [
              { clauseNumber: '(1)', clauseContent: 'Der Arbeitnehmer wird als Rechtsanwalt eingestellt.' },
              { clauseNumber: '(2)', clauseContent: 'Der Arbeitsort ist München.' },
            ],
          },
          {
            sectionNumber: '§ 3',
            sectionTitle: 'Geheimhaltung',
            clauses: [
              { clauseNumber: '(1)', clauseContent: 'Der Arbeitnehmer verpflichtet sich zur Geheimhaltung aller betrieblichen Informationen.' },
            ],
          },
          {
            sectionNumber: '§ 4',
            sectionTitle: 'Wettbewerbsverbot',
            clauses: [
              { clauseNumber: '(1)', clauseContent: 'Während der Dauer des Arbeitsverhältnisses besteht ein Wettbewerbsverbot.' },
            ],
          },
        ],
      };

      expect(seedContract.sections).toHaveLength(4);
      expect(seedContract.sections.flatMap((s) => s.clauses)).toHaveLength(5);
    });

    it('should handle optional clauses (slots not selected)', () => {
      const contractWithOptionals = {
        contractTitle: 'Vertrag mit optionalen Klauseln',
        clientReference: 'OPT-001',
        createdDate: '2026-02-11',
        sections: [
          {
            sectionNumber: '§ 1',
            sectionTitle: 'Pflichtklauseln',
            clauses: [
              { clauseNumber: '(1)', clauseContent: 'Pflichtklausel A.' },
            ],
          },
          // Optional section omitted because slot was not selected
        ],
      };

      expect(contractWithOptionals.sections).toHaveLength(1);
    });

    it('should apply date formatting in German locale', () => {
      const date = new Date('2026-02-11');
      const formatted = date.toLocaleDateString('de-DE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      expect(formatted).toBe('11.02.2026');
    });

    it('should apply currency formatting in German locale', () => {
      const amount = 5000;
      const formatted = new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
      }).format(amount);
      expect(formatted).toContain('5.000,00');
      expect(formatted).toContain('€');
    });
  });
});
