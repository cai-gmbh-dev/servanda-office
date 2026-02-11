import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { ExportData } from '../data/data-loader';

const DEFAULT_TEMPLATE_PATH = resolve(__dirname, '../../templates/default.docx');

/**
 * Renders a DOCX document from contract data using docxtemplater.
 *
 * Based on: docx-export-spec-v1.md
 * - Parameter substitution (date, currency, empty handling)
 * - Hierarchical numbering (§/Abs/lit)
 * - Style templates
 */
export async function renderDocx(data: ExportData): Promise<Buffer> {
  // Load the DOCX template
  const templatePath = data.styleTemplatePath ?? DEFAULT_TEMPLATE_PATH;
  const templateContent = readFileSync(templatePath);
  const zip = new PizZip(templateContent);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
  });

  // Build render context from contract data
  const renderContext = buildRenderContext(data);

  // Render
  doc.render(renderContext);

  // Generate output buffer
  const buf = doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return buf;
}

function buildRenderContext(data: ExportData): Record<string, unknown> {
  return {
    // Contract metadata
    contractTitle: data.contractTitle,
    clientReference: data.clientReference ?? '',
    createdDate: formatDate(new Date()),

    // Sections with clauses
    sections: data.sections.map((section, sIdx) => ({
      sectionNumber: sIdx + 1,
      sectionTitle: section.title,
      clauses: section.clauses.map((clause, cIdx) => ({
        clauseNumber: `${sIdx + 1}.${cIdx + 1}`,
        clauseContent: substituteParameters(clause.content, data.answers),
      })),
    })),

    // Global parameters from answers
    ...flattenAnswers(data.answers),
  };
}

function substituteParameters(content: string, answers: Record<string, unknown>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = answers[key];
    if (value === undefined || value === null || value === '') {
      return '[___]'; // Empty field placeholder
    }
    return String(value);
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function flattenAnswers(answers: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(answers)) {
    flat[`answer_${key}`] = value;
  }
  return flat;
}
