/**
 * Export Data Loader — Sprint 5 (Team 05)
 *
 * Loads all data needed for DOCX rendering from the database.
 * Uses pinned versions from ContractInstance (ADR-002).
 *
 * Flow:
 * 1. Load ContractInstance (answers, clauseVersionIds, templateVersionId)
 * 2. Load TemplateVersion.structure (sections + slots)
 * 3. Load each pinned ClauseVersion.content
 * 4. Load StyleTemplate if specified
 * 5. Resolve slot selections and build export structure
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ExportData {
  contractTitle: string;
  clientReference?: string;
  answers: Record<string, unknown>;
  sections: ExportSection[];
  styleTemplatePath?: string;
  /** Pinned TemplateVersion ID — used as cache key for template buffers (Sprint 11) */
  templateVersionId?: string;
}

export interface ExportSection {
  title: string;
  clauses: ExportClause[];
}

export interface ExportClause {
  content: string;
  parameters: Record<string, unknown>;
}

interface TemplateSlot {
  clauseId: string;
  type: 'required' | 'optional' | 'alternative';
  alternativeClauseIds?: string[];
}

interface TemplateSection {
  title: string;
  slots: TemplateSlot[];
}

export async function loadExportData(
  tenantId: string,
  contractInstanceId: string,
  styleTemplateId?: string,
): Promise<ExportData> {
  // Set RLS context
  await prisma.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`);

  // 1. Load ContractInstance
  const contract = await prisma.contractInstance.findFirst({
    where: { id: contractInstanceId, tenantId },
  });
  if (!contract) {
    throw new Error(`ContractInstance ${contractInstanceId} not found for tenant ${tenantId}`);
  }

  // 2. Load TemplateVersion structure
  const templateVersion = await prisma.templateVersion.findUnique({
    where: { id: contract.templateVersionId },
  });
  if (!templateVersion) {
    throw new Error(`TemplateVersion ${contract.templateVersionId} not found`);
  }

  const structure = templateVersion.structure as unknown as TemplateSection[];

  // 3. Load all pinned ClauseVersions
  const clauseVersions = await prisma.clauseVersion.findMany({
    where: { id: { in: contract.clauseVersionIds } },
  });

  // Build a lookup: clauseId -> ClauseVersion
  const cvByClauseId = new Map(clauseVersions.map((cv) => [cv.clauseId, cv]));

  // 4. Load StyleTemplate if specified
  let styleTemplatePath: string | undefined;
  const stId = styleTemplateId ?? undefined;
  if (stId) {
    const styleTemplate = await prisma.styleTemplate.findFirst({
      where: { id: stId },
    });
    if (styleTemplate) {
      styleTemplatePath = styleTemplate.templateFile ?? undefined;
    }
  }

  // 5. Build export sections from template structure + pinned clause versions
  const selectedSlots = (contract.selectedSlots ?? {}) as Record<string, string>;
  const answers = (contract.answers ?? {}) as Record<string, unknown>;

  const sections: ExportSection[] = structure.map((section) => {
    const clauses: ExportClause[] = [];

    for (const slot of section.slots) {
      // Determine which clause ID to use (may be overridden by selectedSlots)
      const effectiveClauseId = selectedSlots[slot.clauseId] ?? slot.clauseId;
      const cv = cvByClauseId.get(effectiveClauseId);

      if (!cv) {
        // Optional slot without selection — skip
        if (slot.type === 'optional') continue;
        // Required slot missing — include placeholder
        clauses.push({
          content: `[Klausel nicht gefunden: ${effectiveClauseId}]`,
          parameters: {},
        });
        continue;
      }

      clauses.push({
        content: cv.content,
        parameters: (cv.parameters ?? {}) as Record<string, unknown>,
      });
    }

    return { title: section.title, clauses };
  });

  return {
    contractTitle: contract.title,
    clientReference: contract.clientReference ?? undefined,
    answers,
    sections,
    styleTemplatePath,
    templateVersionId: contract.templateVersionId,
  };
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
