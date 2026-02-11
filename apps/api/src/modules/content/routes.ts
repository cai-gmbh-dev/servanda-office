/**
 * Content API Routes — Sprint 5 (Team 03)
 *
 * Clause and Template CRUD with immutable versioning (ADR-002).
 * Status workflow: draft → review → approved → published → deprecated.
 *
 * Endpoints:
 * - POST   /clauses                          — Create clause (E2.S1)
 * - GET    /clauses                          — List clauses
 * - GET    /clauses/:id                      — Get clause with versions
 * - POST   /clauses/:id/versions             — Create new version
 * - PATCH  /clauses/:id/versions/:vid/status — Transition status (E2.S3)
 * - POST   /templates                        — Create template (E2.S2)
 * - GET    /templates                        — List templates
 * - GET    /templates/:id                    — Get template with versions
 * - POST   /templates/:id/versions           — Create new template version
 * - PATCH  /templates/:id/versions/:vid/status — Transition status
 * - GET    /catalog/templates                — Published catalog (E2.S5)
 */

import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma, setTenantContext } from '../../shared/db';
import { getTenantContext } from '../../middleware/tenant-context';
import { requireRole } from '../../middleware/auth';
import { auditService } from '../../services/audit.service';
import { NotFoundError, ConflictError } from '../../middleware/error-handler';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@servanda/shared';
import { validateClausePublishingGates, validateTemplatePublishingGates } from './publishing-gates';

export const contentRouter = Router();

// ============================================================
// CLAUSE ENDPOINTS
// ============================================================

const createClauseSchema = z.object({
  title: z.string().min(1).max(500),
  jurisdiction: z.string().min(2).max(10),
  legalArea: z.string().max(100).optional(),
  tags: z.array(z.string()).optional(),
});

contentRouter.post('/clauses', requireRole('admin', 'editor'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const input = createClauseSchema.parse(req.body);

    const clause = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);
      return tx.clause.create({
        data: {
          tenantId: ctx.tenantId,
          title: input.title,
          jurisdiction: input.jurisdiction,
          legalArea: input.legalArea,
          tags: input.tags ?? [],
        },
      });
    });

    await auditService.log(ctx, {
      action: 'clause.create',
      objectType: 'clause',
      objectId: clause.id,
      details: { title: input.title },
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });

    res.status(201).json(formatClause(clause));
  } catch (err) {
    next(err);
  }
});

contentRouter.get('/clauses', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(Number(req.query.pageSize) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const skip = (page - 1) * pageSize;

    const [data, total] = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);
      const where = { tenantId: ctx.tenantId };
      return Promise.all([
        tx.clause.findMany({ where, orderBy: { updatedAt: 'desc' }, skip, take: pageSize }),
        tx.clause.count({ where }),
      ]);
    });

    res.json({
      data: data.map(formatClause),
      total,
      page,
      pageSize,
      hasMore: skip + pageSize < total,
    });
  } catch (err) {
    next(err);
  }
});

contentRouter.get('/clauses/:id', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);

    const clause = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);
      return tx.clause.findFirst({
        where: { id: req.params.id, tenantId: ctx.tenantId },
        include: { versions: { orderBy: { versionNumber: 'desc' } } },
      });
    });

    if (!clause) throw new NotFoundError('Clause', req.params.id!);

    res.json({
      ...formatClause(clause),
      versions: clause.versions.map(formatClauseVersion),
    });
  } catch (err) {
    next(err);
  }
});

// --- Clause Versions ---

const createClauseVersionSchema = z.object({
  content: z.string().min(1),
  parameters: z.record(z.unknown()).optional(),
  rules: z.array(z.object({
    type: z.enum(['requires', 'forbids', 'incompatible_with', 'scoped_to', 'requires_answer']),
    targetClauseId: z.string().uuid().optional(),
    questionKey: z.string().optional(),
    expectedAnswer: z.unknown().optional(),
    severity: z.enum(['hard', 'soft']),
    message: z.string(),
  })).optional(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
});

contentRouter.post('/clauses/:id/versions', requireRole('admin', 'editor'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const input = createClauseVersionSchema.parse(req.body);

    const version = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      const clause = await tx.clause.findFirst({
        where: { id: req.params.id, tenantId: ctx.tenantId },
        include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
      });
      if (!clause) throw new NotFoundError('Clause', req.params.id!);

      const nextVersion = (clause.versions[0]?.versionNumber ?? 0) + 1;

      return tx.clauseVersion.create({
        data: {
          clauseId: clause.id,
          tenantId: ctx.tenantId,
          versionNumber: nextVersion,
          content: input.content,
          parameters: (input.parameters ?? undefined) as Prisma.InputJsonValue | undefined,
          rules: (input.rules ?? []) as Prisma.InputJsonValue,
          status: 'draft',
          authorId: ctx.userId,
          validFrom: input.validFrom ? new Date(input.validFrom) : undefined,
          validUntil: input.validUntil ? new Date(input.validUntil) : undefined,
        },
      });
    });

    res.status(201).json(formatClauseVersion(version));
  } catch (err) {
    next(err);
  }
});

// --- Version Status Transitions ---

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['review'],
  review: ['approved', 'draft'],
  approved: ['published', 'draft'],
  published: ['deprecated'],
};

const statusTransitionSchema = z.object({
  status: z.enum(['draft', 'review', 'approved', 'published', 'deprecated']),
  reviewerId: z.string().uuid().optional(),
});

contentRouter.patch('/clauses/:id/versions/:vid/status', requireRole('admin', 'editor'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const input = statusTransitionSchema.parse(req.body);

    const version = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      const existing = await tx.clauseVersion.findFirst({
        where: { id: req.params.vid, clauseId: req.params.id },
      });
      if (!existing) throw new NotFoundError('ClauseVersion', req.params.vid!);

      const allowed = VALID_TRANSITIONS[existing.status] ?? [];
      if (!allowed.includes(input.status)) {
        throw new ConflictError(
          `Cannot transition from '${existing.status}' to '${input.status}'. Allowed: ${allowed.join(', ')}`,
        );
      }

      // Publishing-Gate-Validierung vor Publish
      if (input.status === 'published') {
        const gateResult = await validateClausePublishingGates(tx as any, req.params.vid!, req.params.id!);
        if (!gateResult.canPublish) {
          const failedGates = gateResult.gates.filter((g) => !g.passed && g.severity === 'error');
          throw new ConflictError(
            `Publishing-Gates nicht bestanden: ${failedGates.map((g) => `${g.gate}: ${g.message}`).join('; ')}`,
          );
        }
      }

      const updateData: Record<string, unknown> = { status: input.status };
      if (input.status === 'published') {
        updateData.publishedAt = new Date();
        updateData.reviewerId = input.reviewerId ?? ctx.userId;
      }

      const updated = await tx.clauseVersion.update({
        where: { id: req.params.vid },
        data: updateData,
      });

      // Update currentPublishedVersionId on publish
      if (input.status === 'published') {
        await tx.clause.update({
          where: { id: req.params.id },
          data: { currentPublishedVersionId: updated.id },
        });
      }

      return { updated, gateWarnings: input.status === 'published' ? [] : undefined };
    });

    if (input.status === 'published') {
      await auditService.log(ctx, {
        action: 'clause.publish',
        objectType: 'clause_version',
        objectId: version.updated.id,
        details: { clauseId: req.params.id, versionNumber: version.updated.versionNumber },
      }, { ip: req.ip, userAgent: req.headers['user-agent'] });
    }

    res.json(formatClauseVersion(version.updated));
  } catch (err) {
    next(err);
  }
});

// ============================================================
// TEMPLATE ENDPOINTS
// ============================================================

const createTemplateSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  category: z.string().max(100).optional(),
  jurisdiction: z.string().min(2).max(10),
  legalArea: z.string().max(100).optional(),
  tags: z.array(z.string()).optional(),
});

contentRouter.post('/templates', requireRole('admin', 'editor'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const input = createTemplateSchema.parse(req.body);

    const template = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);
      return tx.template.create({
        data: {
          tenantId: ctx.tenantId,
          title: input.title,
          description: input.description,
          category: input.category,
          jurisdiction: input.jurisdiction,
          legalArea: input.legalArea,
          tags: input.tags ?? [],
        },
      });
    });

    await auditService.log(ctx, {
      action: 'template.create',
      objectType: 'template',
      objectId: template.id,
      details: { title: input.title },
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });

    res.status(201).json(formatTemplate(template));
  } catch (err) {
    next(err);
  }
});

contentRouter.get('/templates', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(Number(req.query.pageSize) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const skip = (page - 1) * pageSize;

    const [data, total] = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);
      const where = { tenantId: ctx.tenantId };
      return Promise.all([
        tx.template.findMany({ where, orderBy: { updatedAt: 'desc' }, skip, take: pageSize }),
        tx.template.count({ where }),
      ]);
    });

    res.json({
      data: data.map(formatTemplate),
      total,
      page,
      pageSize,
      hasMore: skip + pageSize < total,
    });
  } catch (err) {
    next(err);
  }
});

contentRouter.get('/templates/:id', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);

    const template = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);
      return tx.template.findFirst({
        where: { id: req.params.id, tenantId: ctx.tenantId },
        include: { versions: { orderBy: { versionNumber: 'desc' } } },
      });
    });

    if (!template) throw new NotFoundError('Template', req.params.id!);

    res.json({
      ...formatTemplate(template),
      versions: template.versions.map(formatTemplateVersion),
    });
  } catch (err) {
    next(err);
  }
});

// --- Template Versions ---

const createTemplateVersionSchema = z.object({
  structure: z.array(z.object({
    title: z.string(),
    slots: z.array(z.object({
      clauseId: z.string().uuid(),
      type: z.enum(['required', 'optional', 'alternative']),
      alternativeClauseIds: z.array(z.string().uuid()).optional(),
    })),
  })),
  interviewFlowId: z.string().uuid().optional(),
  defaultStyleTemplateId: z.string().uuid().optional(),
});

contentRouter.post('/templates/:id/versions', requireRole('admin', 'editor'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const input = createTemplateVersionSchema.parse(req.body);

    const version = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      const template = await tx.template.findFirst({
        where: { id: req.params.id, tenantId: ctx.tenantId },
        include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
      });
      if (!template) throw new NotFoundError('Template', req.params.id!);

      const nextVersion = (template.versions[0]?.versionNumber ?? 0) + 1;

      return tx.templateVersion.create({
        data: {
          templateId: template.id,
          tenantId: ctx.tenantId,
          versionNumber: nextVersion,
          structure: input.structure,
          interviewFlowId: input.interviewFlowId,
          defaultStyleTemplateId: input.defaultStyleTemplateId,
          status: 'draft',
          authorId: ctx.userId,
        },
      });
    });

    res.status(201).json(formatTemplateVersion(version));
  } catch (err) {
    next(err);
  }
});

contentRouter.patch('/templates/:id/versions/:vid/status', requireRole('admin', 'editor'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const input = statusTransitionSchema.parse(req.body);

    const version = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      const existing = await tx.templateVersion.findFirst({
        where: { id: req.params.vid, templateId: req.params.id },
      });
      if (!existing) throw new NotFoundError('TemplateVersion', req.params.vid!);

      const allowed = VALID_TRANSITIONS[existing.status] ?? [];
      if (!allowed.includes(input.status)) {
        throw new ConflictError(
          `Cannot transition from '${existing.status}' to '${input.status}'. Allowed: ${allowed.join(', ')}`,
        );
      }

      // Publishing-Gate-Validierung vor Publish
      if (input.status === 'published') {
        const gateResult = await validateTemplatePublishingGates(tx as any, req.params.vid!, req.params.id!);
        if (!gateResult.canPublish) {
          const failedGates = gateResult.gates.filter((g) => !g.passed && g.severity === 'error');
          throw new ConflictError(
            `Publishing-Gates nicht bestanden: ${failedGates.map((g) => `${g.gate}: ${g.message}`).join('; ')}`,
          );
        }
      }

      const updateData: Record<string, unknown> = { status: input.status };
      if (input.status === 'published') {
        updateData.publishedAt = new Date();
        updateData.reviewerId = input.reviewerId ?? ctx.userId;
      }

      const updated = await tx.templateVersion.update({
        where: { id: req.params.vid },
        data: updateData,
      });

      if (input.status === 'published') {
        await tx.template.update({
          where: { id: req.params.id },
          data: { currentPublishedVersionId: updated.id },
        });
      }

      return updated;
    });

    if (input.status === 'published') {
      await auditService.log(ctx, {
        action: 'template.publish',
        objectType: 'template_version',
        objectId: version.id,
        details: { templateId: req.params.id, versionNumber: version.versionNumber },
      }, { ip: req.ip, userAgent: req.headers['user-agent'] });
    }

    res.json(formatTemplateVersion(version));
  } catch (err) {
    next(err);
  }
});

// ============================================================
// PUBLISHING-GATE VALIDATION (pre-flight check — Sprint 7)
// ============================================================

contentRouter.get('/clauses/:id/versions/:vid/publishing-gates', requireRole('admin', 'editor'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);

    const result = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);
      return validateClausePublishingGates(tx as any, req.params.vid!, req.params.id!);
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

contentRouter.get('/templates/:id/versions/:vid/publishing-gates', requireRole('admin', 'editor'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);

    const result = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);
      return validateTemplatePublishingGates(tx as any, req.params.vid!, req.params.id!);
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// PUBLISHED CATALOG (cross-tenant read for lawfirms — E2.S5)
// ============================================================

contentRouter.get('/catalog/templates', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(Number(req.query.pageSize) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const skip = (page - 1) * pageSize;

    // Catalog shows published templates from vendor tenants.
    // RLS allows cross-tenant reads for published content.
    const where = {
      currentPublishedVersionId: { not: null },
      tenant: { type: 'vendor' },
    };

    const [data, total] = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);
      return Promise.all([
        tx.template.findMany({
          where,
          include: {
            versions: {
              where: { status: 'published' },
              orderBy: { versionNumber: 'desc' },
              take: 1,
            },
          },
          orderBy: { updatedAt: 'desc' },
          skip,
          take: pageSize,
        }),
        tx.template.count({ where }),
      ]);
    });

    res.json({
      data: data.map((t) => ({
        ...formatTemplate(t),
        latestVersion: t.versions[0] ? formatTemplateVersion(t.versions[0]) : null,
      })),
      total,
      page,
      pageSize,
      hasMore: skip + pageSize < total,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// FORMATTERS
// ============================================================

function formatClause(c: {
  id: string; tenantId: string; title: string; tags: string[];
  jurisdiction: string; legalArea: string | null;
  currentPublishedVersionId: string | null;
  createdAt: Date; updatedAt: Date;
}) {
  return {
    id: c.id,
    tenantId: c.tenantId,
    title: c.title,
    tags: c.tags,
    jurisdiction: c.jurisdiction,
    legalArea: c.legalArea,
    currentPublishedVersionId: c.currentPublishedVersionId,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function formatClauseVersion(v: {
  id: string; clauseId: string; versionNumber: number;
  content: string; parameters: unknown; rules: unknown;
  status: string; authorId: string; reviewerId: string | null;
  publishedAt: Date | null; createdAt: Date;
}) {
  return {
    id: v.id,
    clauseId: v.clauseId,
    versionNumber: v.versionNumber,
    content: v.content,
    parameters: v.parameters,
    rules: v.rules,
    status: v.status,
    authorId: v.authorId,
    reviewerId: v.reviewerId,
    publishedAt: v.publishedAt?.toISOString() ?? null,
    createdAt: v.createdAt.toISOString(),
  };
}

function formatTemplate(t: {
  id: string; tenantId: string; title: string; description: string | null;
  category: string | null; jurisdiction: string; legalArea: string | null;
  tags: string[]; currentPublishedVersionId: string | null;
  createdAt: Date; updatedAt: Date;
}) {
  return {
    id: t.id,
    tenantId: t.tenantId,
    title: t.title,
    description: t.description,
    category: t.category,
    jurisdiction: t.jurisdiction,
    legalArea: t.legalArea,
    tags: t.tags,
    currentPublishedVersionId: t.currentPublishedVersionId,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

function formatTemplateVersion(v: {
  id: string; templateId: string; versionNumber: number;
  structure: unknown; interviewFlowId: string | null;
  defaultStyleTemplateId: string | null; status: string;
  authorId: string; reviewerId: string | null;
  publishedAt: Date | null; createdAt: Date;
}) {
  return {
    id: v.id,
    templateId: v.templateId,
    versionNumber: v.versionNumber,
    structure: v.structure,
    interviewFlowId: v.interviewFlowId,
    defaultStyleTemplateId: v.defaultStyleTemplateId,
    status: v.status,
    authorId: v.authorId,
    reviewerId: v.reviewerId,
    publishedAt: v.publishedAt?.toISOString() ?? null,
    createdAt: v.createdAt.toISOString(),
  };
}
