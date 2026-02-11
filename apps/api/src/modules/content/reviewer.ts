/**
 * Reviewer Workflow Routes — Sprint 8 (Team 03)
 *
 * Manages review assignments and status transitions for clause/template versions.
 * Implements the four-eyes principle (PG-C04/PG-T04): reviewer must differ from author.
 *
 * Endpoints:
 * - POST   /clauses/:id/versions/:vid/assign-reviewer  — Assign reviewer
 * - POST   /clauses/:id/versions/:vid/approve           — Approve version
 * - POST   /clauses/:id/versions/:vid/reject             — Reject version (back to draft)
 * - POST   /clauses/:id/versions/:vid/request-changes    — Request changes (back to draft with comment)
 * - GET    /clauses/:id/versions/:vid/reviews             — Get review history
 * - POST   /templates/:id/versions/:vid/assign-reviewer
 * - POST   /templates/:id/versions/:vid/approve
 * - POST   /templates/:id/versions/:vid/reject
 * - POST   /templates/:id/versions/:vid/request-changes
 * - GET    /templates/:id/versions/:vid/reviews
 */

import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma, setTenantContext } from '../../shared/db';
import { getTenantContext } from '../../middleware/tenant-context';
import { requireRole } from '../../middleware/auth';
import { auditService } from '../../services/audit.service';
import { NotFoundError, ConflictError, AppError } from '../../middleware/error-handler';

export const reviewerRouter = Router();

const assignReviewerSchema = z.object({
  reviewerId: z.string().uuid(),
});

const rejectSchema = z.object({
  comment: z.string().min(1).max(2000),
});

const requestChangesSchema = z.object({
  comment: z.string().min(1).max(2000),
  affectedSections: z.array(z.string()).optional(),
});

// ============================================================
// CLAUSE VERSION REVIEW
// ============================================================

reviewerRouter.post('/clauses/:id/versions/:vid/assign-reviewer', requireRole('admin', 'editor'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const input = assignReviewerSchema.parse(req.body);

    const version = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      const existing = await tx.clauseVersion.findFirst({
        where: { id: req.params.vid, clauseId: req.params.id },
      });
      if (!existing) throw new NotFoundError('ClauseVersion', req.params.vid!);

      if (existing.status !== 'draft' && existing.status !== 'review') {
        throw new ConflictError(`Cannot assign reviewer in status '${existing.status}'. Must be draft or review.`);
      }

      // Four-eyes principle: reviewer must differ from author
      if (existing.authorId === input.reviewerId) {
        throw new AppError(400, 'Reviewer must differ from author (four-eyes principle)', 'FOUR_EYES_VIOLATION');
      }

      // Store reviewer assignment in metadata
      const metadata = (existing.metadata as Record<string, unknown>) ?? {};
      metadata.assignedReviewerId = input.reviewerId;
      metadata.assignedAt = new Date().toISOString();

      return tx.clauseVersion.update({
        where: { id: req.params.vid },
        data: { reviewerId: input.reviewerId, metadata: metadata as Prisma.InputJsonValue },
      });
    });

    await auditService.log(ctx, {
      action: 'clause.assign_reviewer',
      objectType: 'clause_version',
      objectId: version.id,
      details: { reviewerId: input.reviewerId, clauseId: req.params.id },
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });

    res.json({ message: 'Reviewer assigned', versionId: version.id, reviewerId: input.reviewerId });
  } catch (err) {
    next(err);
  }
});

reviewerRouter.post('/clauses/:id/versions/:vid/approve', requireRole('admin', 'editor'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);

    const version = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      const existing = await tx.clauseVersion.findFirst({
        where: { id: req.params.vid, clauseId: req.params.id },
      });
      if (!existing) throw new NotFoundError('ClauseVersion', req.params.vid!);

      if (existing.status !== 'review') {
        throw new ConflictError(`Cannot approve version in status '${existing.status}'. Must be in review.`);
      }

      if (existing.authorId === ctx.userId) {
        throw new AppError(400, 'Author cannot approve their own version', 'FOUR_EYES_VIOLATION');
      }

      const metadata = (existing.metadata as Record<string, unknown>) ?? {};
      const reviewHistory = (metadata.reviewHistory as Array<unknown>) ?? [];
      reviewHistory.push({
        action: 'approved',
        reviewerId: ctx.userId,
        timestamp: new Date().toISOString(),
      });
      metadata.reviewHistory = reviewHistory;

      return tx.clauseVersion.update({
        where: { id: req.params.vid },
        data: { status: 'approved', reviewerId: ctx.userId, metadata: metadata as Prisma.InputJsonValue },
      });
    });

    await auditService.log(ctx, {
      action: 'clause.approve',
      objectType: 'clause_version',
      objectId: version.id,
      details: { clauseId: req.params.id },
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });

    res.json({ message: 'Version approved', versionId: version.id, status: 'approved' });
  } catch (err) {
    next(err);
  }
});

reviewerRouter.post('/clauses/:id/versions/:vid/reject', requireRole('admin', 'editor'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const input = rejectSchema.parse(req.body);

    const version = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      const existing = await tx.clauseVersion.findFirst({
        where: { id: req.params.vid, clauseId: req.params.id },
      });
      if (!existing) throw new NotFoundError('ClauseVersion', req.params.vid!);

      if (existing.status !== 'review') {
        throw new ConflictError(`Cannot reject version in status '${existing.status}'. Must be in review.`);
      }

      const metadata = (existing.metadata as Record<string, unknown>) ?? {};
      const reviewHistory = (metadata.reviewHistory as Array<unknown>) ?? [];
      reviewHistory.push({
        action: 'rejected',
        reviewerId: ctx.userId,
        comment: input.comment,
        timestamp: new Date().toISOString(),
      });
      metadata.reviewHistory = reviewHistory;

      return tx.clauseVersion.update({
        where: { id: req.params.vid },
        data: { status: 'draft', metadata: metadata as Prisma.InputJsonValue },
      });
    });

    await auditService.log(ctx, {
      action: 'clause.reject',
      objectType: 'clause_version',
      objectId: version.id,
      details: { clauseId: req.params.id, comment: input.comment },
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });

    res.json({ message: 'Version rejected', versionId: version.id, status: 'draft' });
  } catch (err) {
    next(err);
  }
});

reviewerRouter.post('/clauses/:id/versions/:vid/request-changes', requireRole('admin', 'editor'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const input = requestChangesSchema.parse(req.body);

    const version = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      const existing = await tx.clauseVersion.findFirst({
        where: { id: req.params.vid, clauseId: req.params.id },
      });
      if (!existing) throw new NotFoundError('ClauseVersion', req.params.vid!);

      if (existing.status !== 'review') {
        throw new ConflictError(`Cannot request changes in status '${existing.status}'. Must be in review.`);
      }

      const metadata = (existing.metadata as Record<string, unknown>) ?? {};
      const reviewHistory = (metadata.reviewHistory as Array<unknown>) ?? [];
      reviewHistory.push({
        action: 'changes_requested',
        reviewerId: ctx.userId,
        comment: input.comment,
        affectedSections: input.affectedSections,
        timestamp: new Date().toISOString(),
      });
      metadata.reviewHistory = reviewHistory;

      return tx.clauseVersion.update({
        where: { id: req.params.vid },
        data: { status: 'draft', metadata: metadata as Prisma.InputJsonValue },
      });
    });

    await auditService.log(ctx, {
      action: 'clause.request_changes',
      objectType: 'clause_version',
      objectId: version.id,
      details: { clauseId: req.params.id, comment: input.comment },
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });

    res.json({ message: 'Changes requested', versionId: version.id, status: 'draft' });
  } catch (err) {
    next(err);
  }
});

reviewerRouter.get('/clauses/:id/versions/:vid/reviews', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);

    const version = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);
      return tx.clauseVersion.findFirst({
        where: { id: req.params.vid, clauseId: req.params.id },
      });
    });

    if (!version) throw new NotFoundError('ClauseVersion', req.params.vid!);

    const metadata = (version.metadata as Record<string, unknown>) ?? {};
    const reviewHistory = (metadata.reviewHistory as Array<unknown>) ?? [];

    res.json({
      versionId: version.id,
      status: version.status,
      authorId: version.authorId,
      reviewerId: version.reviewerId,
      assignedReviewerId: metadata.assignedReviewerId ?? null,
      history: reviewHistory,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// TEMPLATE VERSION REVIEW (same pattern as clause)
// ============================================================

reviewerRouter.post('/templates/:id/versions/:vid/assign-reviewer', requireRole('admin', 'editor'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const input = assignReviewerSchema.parse(req.body);

    const version = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      const existing = await tx.templateVersion.findFirst({
        where: { id: req.params.vid, templateId: req.params.id },
      });
      if (!existing) throw new NotFoundError('TemplateVersion', req.params.vid!);

      if (existing.status !== 'draft' && existing.status !== 'review') {
        throw new ConflictError(`Cannot assign reviewer in status '${existing.status}'.`);
      }

      if (existing.authorId === input.reviewerId) {
        throw new AppError(400, 'Reviewer must differ from author (four-eyes principle)', 'FOUR_EYES_VIOLATION');
      }

      const metadata = (existing.metadata as Record<string, unknown>) ?? {};
      metadata.assignedReviewerId = input.reviewerId;
      metadata.assignedAt = new Date().toISOString();

      return tx.templateVersion.update({
        where: { id: req.params.vid },
        data: { reviewerId: input.reviewerId, metadata: metadata as Prisma.InputJsonValue },
      });
    });

    await auditService.log(ctx, {
      action: 'template.assign_reviewer',
      objectType: 'template_version',
      objectId: version.id,
      details: { reviewerId: input.reviewerId, templateId: req.params.id },
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });

    res.json({ message: 'Reviewer assigned', versionId: version.id, reviewerId: input.reviewerId });
  } catch (err) {
    next(err);
  }
});

reviewerRouter.post('/templates/:id/versions/:vid/approve', requireRole('admin', 'editor'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);

    const version = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      const existing = await tx.templateVersion.findFirst({
        where: { id: req.params.vid, templateId: req.params.id },
      });
      if (!existing) throw new NotFoundError('TemplateVersion', req.params.vid!);

      if (existing.status !== 'review') {
        throw new ConflictError(`Cannot approve version in status '${existing.status}'.`);
      }

      if (existing.authorId === ctx.userId) {
        throw new AppError(400, 'Author cannot approve their own version', 'FOUR_EYES_VIOLATION');
      }

      const metadata = (existing.metadata as Record<string, unknown>) ?? {};
      const reviewHistory = (metadata.reviewHistory as Array<unknown>) ?? [];
      reviewHistory.push({
        action: 'approved',
        reviewerId: ctx.userId,
        timestamp: new Date().toISOString(),
      });
      metadata.reviewHistory = reviewHistory;

      return tx.templateVersion.update({
        where: { id: req.params.vid },
        data: { status: 'approved', reviewerId: ctx.userId, metadata: metadata as Prisma.InputJsonValue },
      });
    });

    await auditService.log(ctx, {
      action: 'template.approve',
      objectType: 'template_version',
      objectId: version.id,
      details: { templateId: req.params.id },
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });

    res.json({ message: 'Version approved', versionId: version.id, status: 'approved' });
  } catch (err) {
    next(err);
  }
});

reviewerRouter.post('/templates/:id/versions/:vid/reject', requireRole('admin', 'editor'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const input = rejectSchema.parse(req.body);

    const version = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      const existing = await tx.templateVersion.findFirst({
        where: { id: req.params.vid, templateId: req.params.id },
      });
      if (!existing) throw new NotFoundError('TemplateVersion', req.params.vid!);

      if (existing.status !== 'review') {
        throw new ConflictError(`Cannot reject version in status '${existing.status}'.`);
      }

      const metadata = (existing.metadata as Record<string, unknown>) ?? {};
      const reviewHistory = (metadata.reviewHistory as Array<unknown>) ?? [];
      reviewHistory.push({
        action: 'rejected',
        reviewerId: ctx.userId,
        comment: input.comment,
        timestamp: new Date().toISOString(),
      });
      metadata.reviewHistory = reviewHistory;

      return tx.templateVersion.update({
        where: { id: req.params.vid },
        data: { status: 'draft', metadata: metadata as Prisma.InputJsonValue },
      });
    });

    await auditService.log(ctx, {
      action: 'template.reject',
      objectType: 'template_version',
      objectId: version.id,
      details: { templateId: req.params.id, comment: input.comment },
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });

    res.json({ message: 'Version rejected', versionId: version.id, status: 'draft' });
  } catch (err) {
    next(err);
  }
});

reviewerRouter.post('/templates/:id/versions/:vid/request-changes', requireRole('admin', 'editor'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const input = requestChangesSchema.parse(req.body);

    const version = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      const existing = await tx.templateVersion.findFirst({
        where: { id: req.params.vid, templateId: req.params.id },
      });
      if (!existing) throw new NotFoundError('TemplateVersion', req.params.vid!);

      if (existing.status !== 'review') {
        throw new ConflictError(`Cannot request changes in status '${existing.status}'.`);
      }

      const metadata = (existing.metadata as Record<string, unknown>) ?? {};
      const reviewHistory = (metadata.reviewHistory as Array<unknown>) ?? [];
      reviewHistory.push({
        action: 'changes_requested',
        reviewerId: ctx.userId,
        comment: input.comment,
        affectedSections: input.affectedSections,
        timestamp: new Date().toISOString(),
      });
      metadata.reviewHistory = reviewHistory;

      return tx.templateVersion.update({
        where: { id: req.params.vid },
        data: { status: 'draft', metadata: metadata as Prisma.InputJsonValue },
      });
    });

    await auditService.log(ctx, {
      action: 'template.request_changes',
      objectType: 'template_version',
      objectId: version.id,
      details: { templateId: req.params.id, comment: input.comment },
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });

    res.json({ message: 'Changes requested', versionId: version.id, status: 'draft' });
  } catch (err) {
    next(err);
  }
});

reviewerRouter.get('/templates/:id/versions/:vid/reviews', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);

    const version = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);
      return tx.templateVersion.findFirst({
        where: { id: req.params.vid, templateId: req.params.id },
      });
    });

    if (!version) throw new NotFoundError('TemplateVersion', req.params.vid!);

    const metadata = (version.metadata as Record<string, unknown>) ?? {};
    const reviewHistory = (metadata.reviewHistory as Array<unknown>) ?? [];

    res.json({
      versionId: version.id,
      status: version.status,
      authorId: version.authorId,
      reviewerId: version.reviewerId,
      assignedReviewerId: metadata.assignedReviewerId ?? null,
      history: reviewHistory,
    });
  } catch (err) {
    next(err);
  }
});
