/**
 * Contract API Routes — Sprint 5 (Team 04)
 *
 * Contract instance lifecycle with version pinning (ADR-002).
 * Auto-save of answers/slots, completion pins versions immutably.
 *
 * Endpoints:
 * - POST   /              — Create contract instance (E5.S1)
 * - GET    /              — List contracts
 * - GET    /:id           — Get contract detail
 * - PATCH  /:id           — Update answers / selectedSlots (auto-save)
 * - POST   /:id/complete  — Complete contract (ADR-002: immutable pins)
 * - POST   /:id/validate  — Validate rules (E4.S3)
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma, setTenantContext } from '../../shared/db';
import { getTenantContext } from '../../middleware/tenant-context';
import { auditService } from '../../services/audit.service';
import { NotFoundError, ConflictError } from '../../middleware/error-handler';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@servanda/shared';

export const contractRouter = Router();

// --- Create Contract Instance ---
const createContractSchema = z.object({
  title: z.string().min(1).max(500),
  templateVersionId: z.string().uuid(),
  clientReference: z.string().max(255).optional(),
  tags: z.array(z.string()).optional(),
});

contractRouter.post('/', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const input = createContractSchema.parse(req.body);

    const contract = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      // Load template version + resolve clause version IDs from structure
      const templateVersion = await tx.templateVersion.findUnique({
        where: { id: input.templateVersionId },
      });
      if (!templateVersion || templateVersion.status !== 'published') {
        throw new ConflictError('Template version not found or not published');
      }

      // Extract clause IDs from template structure and resolve to published versions
      const structure = templateVersion.structure as Array<{
        slots: Array<{ clauseId: string }>;
      }>;
      const clauseIds = structure.flatMap((s) => s.slots.map((slot) => slot.clauseId));

      const clauses = await tx.clause.findMany({
        where: { id: { in: clauseIds } },
        select: { id: true, currentPublishedVersionId: true },
      });

      const clauseVersionIds = clauses
        .map((c) => c.currentPublishedVersionId)
        .filter((id): id is string => id !== null);

      return tx.contractInstance.create({
        data: {
          tenantId: ctx.tenantId,
          creatorId: ctx.userId,
          title: input.title,
          clientReference: input.clientReference,
          tags: input.tags ?? [],
          templateVersionId: input.templateVersionId,
          clauseVersionIds,
          answers: {},
          selectedSlots: {},
          validationState: 'valid',
          status: 'draft',
        },
      });
    });

    await auditService.log(ctx, {
      action: 'contract.create',
      objectType: 'contract_instance',
      objectId: contract.id,
      details: { title: input.title, templateVersionId: input.templateVersionId },
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });

    res.status(201).json(formatContract(contract));
  } catch (err) {
    next(err);
  }
});

// --- List Contracts ---
contractRouter.get('/', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(Number(req.query.pageSize) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const skip = (page - 1) * pageSize;
    const status = req.query.status as string | undefined;

    const where: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (status) where.status = status;

    const [data, total] = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);
      return Promise.all([
        tx.contractInstance.findMany({ where, orderBy: { updatedAt: 'desc' }, skip, take: pageSize }),
        tx.contractInstance.count({ where }),
      ]);
    });

    res.json({
      data: data.map(formatContract),
      total,
      page,
      pageSize,
      hasMore: skip + pageSize < total,
    });
  } catch (err) {
    next(err);
  }
});

// --- Get Contract Detail ---
contractRouter.get('/:id', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);

    const contract = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);
      return tx.contractInstance.findFirst({
        where: { id: req.params.id, tenantId: ctx.tenantId },
      });
    });

    if (!contract) throw new NotFoundError('ContractInstance', req.params.id);
    res.json(formatContract(contract));
  } catch (err) {
    next(err);
  }
});

// --- Update Answers / Selected Slots (auto-save) ---
const updateContractSchema = z.object({
  answers: z.record(z.unknown()).optional(),
  selectedSlots: z.record(z.string()).optional(),
  title: z.string().min(1).max(500).optional(),
  clientReference: z.string().max(255).optional(),
  tags: z.array(z.string()).optional(),
});

contractRouter.patch('/:id', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const input = updateContractSchema.parse(req.body);

    const contract = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      const existing = await tx.contractInstance.findFirst({
        where: { id: req.params.id, tenantId: ctx.tenantId },
      });
      if (!existing) throw new NotFoundError('ContractInstance', req.params.id);
      if (existing.status !== 'draft') {
        throw new ConflictError('Cannot update a completed contract. Only drafts can be modified.');
      }

      const updateData: Record<string, unknown> = {};
      if (input.answers !== undefined) {
        updateData.answers = { ...(existing.answers as Record<string, unknown>), ...input.answers };
      }
      if (input.selectedSlots !== undefined) {
        updateData.selectedSlots = { ...(existing.selectedSlots as Record<string, string>), ...input.selectedSlots };
      }
      if (input.title !== undefined) updateData.title = input.title;
      if (input.clientReference !== undefined) updateData.clientReference = input.clientReference;
      if (input.tags !== undefined) updateData.tags = input.tags;

      return tx.contractInstance.update({
        where: { id: req.params.id },
        data: updateData,
      });
    });

    await auditService.log(ctx, {
      action: 'contract.update',
      objectType: 'contract_instance',
      objectId: contract.id,
      details: { updatedFields: Object.keys(input).filter((k) => input[k as keyof typeof input] !== undefined) },
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });

    res.json(formatContract(contract));
  } catch (err) {
    next(err);
  }
});

// --- Complete Contract (ADR-002: pins become immutable) ---
contractRouter.post('/:id/complete', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);

    const contract = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      const existing = await tx.contractInstance.findFirst({
        where: { id: req.params.id, tenantId: ctx.tenantId },
      });
      if (!existing) throw new NotFoundError('ContractInstance', req.params.id);
      if (existing.status !== 'draft') {
        throw new ConflictError('Contract is already completed.');
      }

      // Check for hard conflicts before completion
      if (existing.validationState === 'has_conflicts') {
        throw new ConflictError('Cannot complete contract with unresolved hard conflicts.');
      }

      return tx.contractInstance.update({
        where: { id: req.params.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
      });
    });

    await auditService.log(ctx, {
      action: 'contract.complete',
      objectType: 'contract_instance',
      objectId: contract.id,
      details: {
        templateVersionId: contract.templateVersionId,
        clauseVersionCount: contract.clauseVersionIds.length,
      },
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });

    res.json(formatContract(contract));
  } catch (err) {
    next(err);
  }
});

// --- Validate Rules (E4.S3) ---
contractRouter.post('/:id/validate', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);

    const result = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      const contract = await tx.contractInstance.findFirst({
        where: { id: req.params.id, tenantId: ctx.tenantId },
      });
      if (!contract) throw new NotFoundError('ContractInstance', req.params.id);

      // Load all pinned clause versions and their rules
      const clauseVersions = await tx.clauseVersion.findMany({
        where: { id: { in: contract.clauseVersionIds } },
      });

      const messages: Array<{
        ruleId: string;
        clauseId: string;
        severity: string;
        message: string;
      }> = [];

      const selectedClauseIds = new Set(clauseVersions.map((cv) => cv.clauseId));

      for (const cv of clauseVersions) {
        const rules = cv.rules as Array<{
          type: string;
          targetClauseId?: string;
          questionKey?: string;
          expectedAnswer?: unknown;
          severity: string;
          message: string;
        }>;

        for (const rule of rules) {
          let violated = false;

          switch (rule.type) {
            case 'requires':
              if (rule.targetClauseId && !selectedClauseIds.has(rule.targetClauseId)) {
                violated = true;
              }
              break;
            case 'forbids':
              if (rule.targetClauseId && selectedClauseIds.has(rule.targetClauseId)) {
                violated = true;
              }
              break;
            case 'incompatible_with':
              if (rule.targetClauseId && selectedClauseIds.has(rule.targetClauseId)) {
                violated = true;
              }
              break;
            case 'requires_answer': {
              const answers = contract.answers as Record<string, unknown>;
              if (rule.questionKey && answers[rule.questionKey] === undefined) {
                violated = true;
              }
              break;
            }
          }

          if (violated) {
            messages.push({
              ruleId: `${cv.id}:${rule.type}:${rule.targetClauseId ?? rule.questionKey ?? ''}`,
              clauseId: cv.clauseId,
              severity: rule.severity,
              message: rule.message,
            });
          }
        }
      }

      // Update validation state
      const hasHard = messages.some((m) => m.severity === 'hard');
      const hasWarnings = messages.some((m) => m.severity === 'soft');
      const validationState = hasHard ? 'has_conflicts' : hasWarnings ? 'has_warnings' : 'valid';

      await tx.contractInstance.update({
        where: { id: req.params.id },
        data: {
          validationState,
          validationMessages: messages.length > 0 ? messages : undefined,
        },
      });

      return { validationState, messages };
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// FORMATTER
// ============================================================

function formatContract(c: {
  id: string; tenantId: string; creatorId: string;
  title: string; clientReference: string | null; tags: string[];
  templateVersionId: string; clauseVersionIds: string[];
  answers: unknown; selectedSlots: unknown;
  validationState: string; validationMessages: unknown;
  status: string; completedAt: Date | null;
  createdAt: Date; updatedAt: Date;
}) {
  return {
    id: c.id,
    tenantId: c.tenantId,
    creatorId: c.creatorId,
    title: c.title,
    clientReference: c.clientReference,
    tags: c.tags,
    templateVersionId: c.templateVersionId,
    clauseVersionIds: c.clauseVersionIds,
    answers: c.answers,
    selectedSlots: c.selectedSlots,
    validationState: c.validationState,
    validationMessages: c.validationMessages,
    status: c.status,
    completedAt: c.completedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
