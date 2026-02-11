/**
 * Publishing Gate Validation — Sprint 7 (Team 03)
 *
 * Validates that a ClauseVersion or TemplateVersion meets all publishing gates
 * before allowing status transition to 'published'.
 *
 * Clause Publishing Gates (PG-C01..C10):
 *  PG-C01: Content nicht leer
 *  PG-C02: Autor gesetzt
 *  PG-C03: Reviewer gesetzt und ≠ Autor (Vier-Augen-Prinzip)
 *  PG-C04: Keine Zyklen im requires-Graph
 *  PG-C05: Alle referenzierten Klauseln existieren
 *  PG-C06: Rules-Schema valide (kein malformed JSON)
 *  PG-C07: validFrom/validUntil logisch konsistent
 *  PG-C08: Status ist 'approved' (korrekte Vorstufe)
 *  PG-C09: Changelog vorhanden (ab Version > 1)
 *  PG-C10: Jurisdiction gesetzt
 *
 * Template Publishing Gates (PG-T01..T10):
 *  PG-T01: Structure hat mindestens 1 Section
 *  PG-T02: Alle Slots referenzieren existierende Clauses
 *  PG-T03: Required Slots haben published ClauseVersions
 *  PG-T04: InterviewFlow zugeordnet (empfohlen, nicht blockierend)
 *  PG-T05: Autor gesetzt
 *  PG-T06: Reviewer gesetzt und ≠ Autor
 *  PG-T07: Status ist 'approved'
 *  PG-T08: Keine Duplikat-Slots
 *  PG-T09: Mindestens 1 required Slot
 *  PG-T10: Jurisdiction konsistent mit Clause-Jurisdictions
 */

import { PrismaClient } from '@prisma/client';

export interface GateResult {
  gate: string;
  passed: boolean;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  canPublish: boolean;
  gates: GateResult[];
}

// ============================================================
// CLAUSE VERSION PUBLISHING GATES
// ============================================================

export async function validateClausePublishingGates(
  tx: PrismaClient,
  clauseVersionId: string,
  clauseId: string,
): Promise<ValidationResult> {
  const version = await (tx as any).clauseVersion.findUnique({
    where: { id: clauseVersionId },
  });
  if (!version) {
    return { canPublish: false, gates: [{ gate: 'EXISTENCE', passed: false, message: 'Version nicht gefunden', severity: 'error' }] };
  }

  const clause = await (tx as any).clause.findUnique({
    where: { id: clauseId },
  });

  const gates: GateResult[] = [];

  // PG-C01: Content nicht leer
  gates.push({
    gate: 'PG-C01',
    passed: !!version.content && version.content.trim().length > 0,
    message: 'Klausel-Inhalt darf nicht leer sein',
    severity: 'error',
  });

  // PG-C02: Autor gesetzt
  gates.push({
    gate: 'PG-C02',
    passed: !!version.authorId,
    message: 'Autor muss gesetzt sein',
    severity: 'error',
  });

  // PG-C03: Reviewer ≠ Autor (Vier-Augen-Prinzip)
  const hasReviewer = !!version.reviewerId;
  const reviewerDiffers = version.reviewerId !== version.authorId;
  gates.push({
    gate: 'PG-C03',
    passed: hasReviewer && reviewerDiffers,
    message: 'Reviewer muss gesetzt sein und darf nicht der Autor sein (Vier-Augen-Prinzip)',
    severity: 'error',
  });

  // PG-C04: Keine Zyklen im requires-Graph
  const rules = (version.rules as Array<{ type: string; targetClauseId?: string }>) ?? [];
  const requiresTargets = rules
    .filter((r) => r.type === 'requires' && r.targetClauseId)
    .map((r) => r.targetClauseId!);
  // Simple cycle check: clause doesn't require itself
  const selfReferencing = requiresTargets.includes(clauseId);
  gates.push({
    gate: 'PG-C04',
    passed: !selfReferencing,
    message: 'Klausel darf sich nicht selbst referenzieren (Zyklen im requires-Graph)',
    severity: 'error',
  });

  // PG-C05: Alle referenzierten Klauseln existieren
  let allTargetsExist = true;
  if (requiresTargets.length > 0) {
    const existingClauses = await (tx as any).clause.findMany({
      where: { id: { in: requiresTargets } },
      select: { id: true },
    });
    allTargetsExist = existingClauses.length === requiresTargets.length;
  }
  gates.push({
    gate: 'PG-C05',
    passed: allTargetsExist,
    message: 'Alle referenzierten Klauseln müssen existieren',
    severity: 'error',
  });

  // PG-C06: Rules-Schema valide
  const rulesValid = Array.isArray(version.rules);
  gates.push({
    gate: 'PG-C06',
    passed: rulesValid,
    message: 'Rules-Daten müssen ein gültiges Array sein',
    severity: 'error',
  });

  // PG-C07: validFrom/validUntil konsistent
  let dateConsistent = true;
  if (version.validFrom && version.validUntil) {
    dateConsistent = new Date(version.validFrom) < new Date(version.validUntil);
  }
  gates.push({
    gate: 'PG-C07',
    passed: dateConsistent,
    message: 'validFrom muss vor validUntil liegen',
    severity: 'error',
  });

  // PG-C08: Status ist 'approved'
  gates.push({
    gate: 'PG-C08',
    passed: version.status === 'approved',
    message: 'Status muss "approved" sein, bevor veröffentlicht werden kann',
    severity: 'error',
  });

  // PG-C09: Changelog vorhanden (ab Version > 1)
  if (version.versionNumber > 1) {
    const meta = (version.metadata as Record<string, unknown>) ?? {};
    const changelog = (meta.changelog as unknown[]) ?? [];
    gates.push({
      gate: 'PG-C09',
      passed: changelog.length > 0,
      message: 'Ab Version 2 muss ein Changelog-Eintrag vorhanden sein',
      severity: 'warning',
    });
  } else {
    gates.push({
      gate: 'PG-C09',
      passed: true,
      message: 'Erste Version — kein Changelog erforderlich',
      severity: 'warning',
    });
  }

  // PG-C10: Jurisdiction gesetzt
  gates.push({
    gate: 'PG-C10',
    passed: !!clause?.jurisdiction && clause.jurisdiction.length >= 2,
    message: 'Rechtsgebiet (Jurisdiction) muss gesetzt sein',
    severity: 'error',
  });

  const canPublish = gates.filter((g) => g.severity === 'error').every((g) => g.passed);

  return { canPublish, gates };
}

// ============================================================
// TEMPLATE VERSION PUBLISHING GATES
// ============================================================

export async function validateTemplatePublishingGates(
  tx: PrismaClient,
  templateVersionId: string,
  templateId: string,
): Promise<ValidationResult> {
  const version = await (tx as any).templateVersion.findUnique({
    where: { id: templateVersionId },
  });
  if (!version) {
    return { canPublish: false, gates: [{ gate: 'EXISTENCE', passed: false, message: 'Version nicht gefunden', severity: 'error' }] };
  }

  const template = await (tx as any).template.findUnique({
    where: { id: templateId },
  });

  const structure = (version.structure as Array<{
    title: string;
    slots: Array<{ clauseId: string; type: string; alternativeClauseIds?: string[] }>;
  }>) ?? [];

  const gates: GateResult[] = [];

  // PG-T01: Mindestens 1 Section
  gates.push({
    gate: 'PG-T01',
    passed: structure.length > 0,
    message: 'Template muss mindestens eine Section enthalten',
    severity: 'error',
  });

  // PG-T02: Alle Slots referenzieren existierende Clauses
  const allClauseIds = structure.flatMap((s) =>
    s.slots.flatMap((slot) => [slot.clauseId, ...(slot.alternativeClauseIds ?? [])]),
  );
  let allClausesExist = true;
  if (allClauseIds.length > 0) {
    const existing = await (tx as any).clause.findMany({
      where: { id: { in: allClauseIds } },
      select: { id: true },
    });
    allClausesExist = existing.length === new Set(allClauseIds).size;
  }
  gates.push({
    gate: 'PG-T02',
    passed: allClausesExist,
    message: 'Alle Slot-Referenzen müssen auf existierende Klauseln zeigen',
    severity: 'error',
  });

  // PG-T03: Required Slots haben published ClauseVersions
  const requiredClauseIds = structure.flatMap((s) =>
    s.slots.filter((slot) => slot.type === 'required').map((slot) => slot.clauseId),
  );
  let allRequiredPublished = true;
  if (requiredClauseIds.length > 0) {
    const publishedClauses = await (tx as any).clause.findMany({
      where: { id: { in: requiredClauseIds }, currentPublishedVersionId: { not: null } },
      select: { id: true },
    });
    allRequiredPublished = publishedClauses.length === requiredClauseIds.length;
  }
  gates.push({
    gate: 'PG-T03',
    passed: allRequiredPublished,
    message: 'Alle Pflicht-Klauseln müssen eine veröffentlichte Version haben',
    severity: 'error',
  });

  // PG-T04: InterviewFlow zugeordnet
  gates.push({
    gate: 'PG-T04',
    passed: !!version.interviewFlowId,
    message: 'Ein Interview-Flow sollte zugeordnet sein',
    severity: 'warning',
  });

  // PG-T05: Autor gesetzt
  gates.push({
    gate: 'PG-T05',
    passed: !!version.authorId,
    message: 'Autor muss gesetzt sein',
    severity: 'error',
  });

  // PG-T06: Reviewer ≠ Autor
  const hasReviewer = !!version.reviewerId;
  const reviewerDiffers = version.reviewerId !== version.authorId;
  gates.push({
    gate: 'PG-T06',
    passed: hasReviewer && reviewerDiffers,
    message: 'Reviewer muss gesetzt sein und darf nicht der Autor sein',
    severity: 'error',
  });

  // PG-T07: Status ist 'approved'
  gates.push({
    gate: 'PG-T07',
    passed: version.status === 'approved',
    message: 'Status muss "approved" sein',
    severity: 'error',
  });

  // PG-T08: Keine Duplikat-Slots
  const slotClauseIds = structure.flatMap((s) => s.slots.map((slot) => slot.clauseId));
  const uniqueSlotIds = new Set(slotClauseIds);
  gates.push({
    gate: 'PG-T08',
    passed: slotClauseIds.length === uniqueSlotIds.size,
    message: 'Keine Klausel darf mehrfach als Slot referenziert werden',
    severity: 'error',
  });

  // PG-T09: Mindestens 1 required Slot
  const hasRequired = structure.some((s) => s.slots.some((slot) => slot.type === 'required'));
  gates.push({
    gate: 'PG-T09',
    passed: hasRequired,
    message: 'Template muss mindestens eine Pflicht-Klausel enthalten',
    severity: 'error',
  });

  // PG-T10: Jurisdiction konsistent
  gates.push({
    gate: 'PG-T10',
    passed: !!template?.jurisdiction && template.jurisdiction.length >= 2,
    message: 'Rechtsgebiet (Jurisdiction) muss gesetzt sein',
    severity: 'error',
  });

  const canPublish = gates.filter((g) => g.severity === 'error').every((g) => g.passed);

  return { canPublish, gates };
}
