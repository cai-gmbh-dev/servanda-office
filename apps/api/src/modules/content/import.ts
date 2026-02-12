/**
 * Content Import Service — Sprint 11 (Team 03)
 *
 * Bulk-import of publisher content (clauses, templates, interview flows) via JSON.
 *
 * Features:
 * - Zod-validated import format
 * - Transactional import (all-or-nothing)
 * - Tenant-scoped via RLS context
 * - Duplicate detection (by clause title within tenant)
 * - Import report: created / skipped / errors
 */

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import type { TenantContext } from '@servanda/shared';
import { prisma, setTenantContext } from '../../shared/db';

// ============================================================
// IMPORT FORMAT SCHEMA (Zod)
// ============================================================

const importQuestionSchema = z.object({
  key: z.string().min(1),
  type: z.enum(['single_choice', 'multiple_choice', 'text', 'number', 'date', 'currency', 'yes_no']),
  label: z.string().min(1),
  required: z.boolean().optional().default(true),
  default: z.unknown().optional(),
  helpText: z.string().optional(),
  options: z.array(z.object({
    value: z.string(),
    label: z.string(),
  })).optional(),
  conditions: z.array(z.object({
    questionKey: z.string(),
    operator: z.enum(['equals', 'not_equals', 'greater_than', 'less_than', 'contains', 'in']),
    value: z.unknown(),
    logic: z.enum(['show', 'hide', 'skip']),
  })).optional(),
});

const importClauseVersionSchema = z.object({
  content: z.string().min(1),
  changeNote: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
  rules: z.array(z.object({
    type: z.enum(['requires', 'forbids', 'incompatible_with', 'scoped_to', 'requires_answer']),
    targetClauseTitle: z.string().optional(),
    questionKey: z.string().optional(),
    expectedAnswer: z.unknown().optional(),
    severity: z.enum(['hard', 'soft']),
    message: z.string(),
  })).optional(),
});

const importClauseSchema = z.object({
  title: z.string().min(1).max(500),
  jurisdiction: z.string().min(2).max(10),
  legalArea: z.string().max(100).optional(),
  tags: z.array(z.string()).optional(),
  versions: z.array(importClauseVersionSchema).min(1),
});

const importSlotSchema = z.object({
  clauseTitle: z.string().min(1),
  type: z.enum(['required', 'optional', 'alternative']),
  alternativeClauseTitles: z.array(z.string()).optional(),
});

const importSectionSchema = z.object({
  title: z.string().min(1),
  slots: z.array(importSlotSchema).min(1),
});

const importInterviewFlowSchema = z.object({
  title: z.string().min(1).max(500),
  questions: z.array(importQuestionSchema).min(1),
});

const importTemplateSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  category: z.string().max(100).optional(),
  jurisdiction: z.string().min(2).max(10),
  legalArea: z.string().max(100).optional(),
  tags: z.array(z.string()).optional(),
  sections: z.array(importSectionSchema).min(1),
  interviewFlow: importInterviewFlowSchema.optional(),
});

export const contentImportSchema = z.object({
  clauses: z.array(importClauseSchema).optional().default([]),
  templates: z.array(importTemplateSchema).optional().default([]),
});

export type ContentImportInput = z.infer<typeof contentImportSchema>;

// ============================================================
// IMPORT REPORT
// ============================================================

export interface ImportReportItem {
  type: 'clause' | 'template' | 'interviewFlow';
  title: string;
  status: 'created' | 'skipped' | 'error';
  reason?: string;
  id?: string;
}

export interface ImportReport {
  summary: {
    clauses: { created: number; skipped: number; errors: number };
    templates: { created: number; skipped: number; errors: number };
    interviewFlows: { created: number; skipped: number; errors: number };
  };
  items: ImportReportItem[];
}

// ============================================================
// IMPORT SERVICE
// ============================================================

export async function importContent(
  ctx: TenantContext,
  input: ContentImportInput,
): Promise<ImportReport> {
  const report: ImportReport = {
    summary: {
      clauses: { created: 0, skipped: 0, errors: 0 },
      templates: { created: 0, skipped: 0, errors: 0 },
      interviewFlows: { created: 0, skipped: 0, errors: 0 },
    },
    items: [],
  };

  await prisma.$transaction(async (tx) => {
    await setTenantContext(tx, ctx.tenantId);

    // --- Phase 1: Import Clauses ---
    // Build a title-to-id map for resolving template slot references later
    const clauseTitleToId = new Map<string, string>();

    // Fetch existing clause titles for duplicate detection
    const existingClauses = await tx.clause.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, title: true },
    });
    const existingClauseTitles = new Set(existingClauses.map((c) => c.title));

    // Also index existing by title for slot resolution
    for (const ec of existingClauses) {
      clauseTitleToId.set(ec.title, ec.id);
    }

    for (const clauseInput of input.clauses) {
      // Duplicate detection: skip if title already exists in tenant
      if (existingClauseTitles.has(clauseInput.title)) {
        report.items.push({
          type: 'clause',
          title: clauseInput.title,
          status: 'skipped',
          reason: `Clause with title "${clauseInput.title}" already exists in tenant`,
        });
        report.summary.clauses.skipped++;
        continue;
      }

      try {
        const clause = await tx.clause.create({
          data: {
            tenantId: ctx.tenantId,
            title: clauseInput.title,
            jurisdiction: clauseInput.jurisdiction,
            legalArea: clauseInput.legalArea,
            tags: clauseInput.tags ?? [],
          },
        });

        clauseTitleToId.set(clauseInput.title, clause.id);

        // Create versions (all as draft)
        for (let i = 0; i < clauseInput.versions.length; i++) {
          const versionInput = clauseInput.versions[i]!;
          await tx.clauseVersion.create({
            data: {
              clauseId: clause.id,
              tenantId: ctx.tenantId,
              versionNumber: i + 1,
              content: versionInput.content,
              parameters: (versionInput.parameters ?? undefined) as Prisma.InputJsonValue | undefined,
              rules: (versionInput.rules ?? []) as unknown as Prisma.InputJsonValue,
              status: 'draft',
              authorId: ctx.userId,
            },
          });
        }

        report.items.push({
          type: 'clause',
          title: clauseInput.title,
          status: 'created',
          id: clause.id,
        });
        report.summary.clauses.created++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        report.items.push({
          type: 'clause',
          title: clauseInput.title,
          status: 'error',
          reason: message,
        });
        report.summary.clauses.errors++;
        // Re-throw to trigger transaction rollback
        throw err;
      }
    }

    // --- Phase 2: Import Templates (with InterviewFlows) ---
    for (const templateInput of input.templates) {
      // Duplicate detection: check if template title already exists in tenant
      const existingTemplate = await tx.template.findFirst({
        where: { tenantId: ctx.tenantId, title: templateInput.title },
        select: { id: true },
      });

      if (existingTemplate) {
        report.items.push({
          type: 'template',
          title: templateInput.title,
          status: 'skipped',
          reason: `Template with title "${templateInput.title}" already exists in tenant`,
        });
        report.summary.templates.skipped++;
        continue;
      }

      try {
        // Resolve section slots: map clauseTitle -> clauseId
        const resolvedSections: Array<{
          title: string;
          slots: Array<{
            clauseId: string;
            type: string;
            alternativeClauseIds?: string[];
          }>;
        }> = [];

        for (const section of templateInput.sections) {
          const resolvedSlots: Array<{
            clauseId: string;
            type: string;
            alternativeClauseIds?: string[];
          }> = [];

          for (const slot of section.slots) {
            const clauseId = clauseTitleToId.get(slot.clauseTitle);
            if (!clauseId) {
              throw new Error(
                `Cannot resolve clause "${slot.clauseTitle}" in template "${templateInput.title}" section "${section.title}". ` +
                `Clause must be included in the import or already exist in the tenant.`,
              );
            }

            const alternativeClauseIds = slot.alternativeClauseTitles?.map((title) => {
              const altId = clauseTitleToId.get(title);
              if (!altId) {
                throw new Error(
                  `Cannot resolve alternative clause "${title}" in template "${templateInput.title}". ` +
                  `Clause must be included in the import or already exist in the tenant.`,
                );
              }
              return altId;
            });

            resolvedSlots.push({
              clauseId,
              type: slot.type,
              ...(alternativeClauseIds ? { alternativeClauseIds } : {}),
            });
          }

          resolvedSections.push({
            title: section.title,
            slots: resolvedSlots,
          });
        }

        // Create interview flow if provided
        let interviewFlowId: string | undefined;
        if (templateInput.interviewFlow) {
          const flow = await tx.interviewFlow.create({
            data: {
              tenantId: ctx.tenantId,
              title: templateInput.interviewFlow.title,
              questions: templateInput.interviewFlow.questions as unknown as Prisma.InputJsonValue,
            },
          });
          interviewFlowId = flow.id;

          report.items.push({
            type: 'interviewFlow',
            title: templateInput.interviewFlow.title,
            status: 'created',
            id: flow.id,
          });
          report.summary.interviewFlows.created++;
        }

        // Create template
        const template = await tx.template.create({
          data: {
            tenantId: ctx.tenantId,
            title: templateInput.title,
            description: templateInput.description,
            category: templateInput.category,
            jurisdiction: templateInput.jurisdiction,
            legalArea: templateInput.legalArea,
            tags: templateInput.tags ?? [],
          },
        });

        // Create initial template version (draft)
        await tx.templateVersion.create({
          data: {
            templateId: template.id,
            tenantId: ctx.tenantId,
            versionNumber: 1,
            structure: resolvedSections as unknown as Prisma.InputJsonValue,
            interviewFlowId,
            status: 'draft',
            authorId: ctx.userId,
          },
        });

        report.items.push({
          type: 'template',
          title: templateInput.title,
          status: 'created',
          id: template.id,
        });
        report.summary.templates.created++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        report.items.push({
          type: 'template',
          title: templateInput.title,
          status: 'error',
          reason: message,
        });
        report.summary.templates.errors++;
        // Re-throw to trigger transaction rollback
        throw err;
      }
    }
  });

  return report;
}
