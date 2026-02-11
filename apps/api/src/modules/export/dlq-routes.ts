/**
 * Dead-Letter-Queue Monitoring & Management Routes — Sprint 5 (Team 05)
 *
 * Provides admin-level visibility into failed export jobs and tools
 * for retry / archive operations (ADR-003).
 *
 * Endpoints:
 * - GET  /failed       — List failed export jobs (paginated)
 * - POST /:id/retry    — Retry a failed job
 * - POST /:id/archive  — Archive a failed job
 * - GET  /stats        — DLQ statistics overview
 */

import { Router } from 'express';
import { z } from 'zod';
import PgBoss from 'pg-boss';
import { prisma, setTenantContext } from '../../shared/db';
import { getTenantContext } from '../../middleware/tenant-context';
import { requireRole } from '../../middleware/auth';
import { auditService } from '../../services/audit.service';
import { NotFoundError, ConflictError } from '../../middleware/error-handler';
import { logger } from '../../shared/logger';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@servanda/shared';

export const dlqRouter = Router();

// pgboss instance — initialized lazily
let boss: PgBoss | null = null;

async function getBoss(): Promise<PgBoss> {
  if (!boss) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL not set');
    boss = new PgBoss(connectionString);
    await boss.start();
    logger.info('pgboss started for DLQ retry queue');
  }
  return boss;
}

// --- List Failed Jobs (paginated) ---
const listFailedQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

dlqRouter.get('/failed', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const { page, pageSize } = listFailedQuerySchema.parse(req.query);
    const take = Math.min(pageSize, MAX_PAGE_SIZE);
    const skip = (page - 1) * take;

    const [data, total] = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);
      return Promise.all([
        tx.exportJob.findMany({
          where: { tenantId: ctx.tenantId, status: 'failed' },
          orderBy: { queuedAt: 'desc' },
          skip,
          take,
        }),
        tx.exportJob.count({
          where: { tenantId: ctx.tenantId, status: 'failed' },
        }),
      ]);
    });

    res.json({
      data: data.map(formatFailedJob),
      total,
      page,
      pageSize: take,
      hasMore: skip + take < total,
    });
  } catch (err) {
    next(err);
  }
});

// --- Retry a Failed Job (admin only) ---
dlqRouter.post('/:id/retry', requireRole('admin'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);

    const job = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      const existing = await tx.exportJob.findFirst({
        where: { id: req.params.id, tenantId: ctx.tenantId },
      });
      if (!existing) throw new NotFoundError('ExportJob', req.params.id!);
      if (existing.status !== 'failed') {
        throw new ConflictError(`Cannot retry job with status '${existing.status}' — only failed jobs can be retried`);
      }

      return tx.exportJob.update({
        where: { id: existing.id },
        data: {
          status: 'queued',
          errorMessage: null,
          retryCount: { increment: 1 },
          startedAt: null,
          completedAt: null,
        },
      });
    });

    // Re-enqueue to pgboss
    try {
      const pgboss = await getBoss();
      await pgboss.send('export-job', {
        jobId: job.id,
        tenantId: ctx.tenantId,
        contractInstanceId: job.contractInstanceId,
        format: job.format,
        styleTemplateId: job.styleTemplateId,
      });
    } catch (err) {
      logger.error({ err, jobId: job.id }, 'Failed to re-enqueue export job for retry');
    }

    await auditService.log(ctx, {
      action: 'export.dlq.retry',
      objectType: 'export_job',
      objectId: job.id,
      details: { retryCount: job.retryCount },
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });

    res.json(formatFailedJob(job));
  } catch (err) {
    next(err);
  }
});

// --- Archive a Failed Job (admin only) ---
dlqRouter.post('/:id/archive', requireRole('admin'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);

    const job = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      const existing = await tx.exportJob.findFirst({
        where: { id: req.params.id, tenantId: ctx.tenantId },
      });
      if (!existing) throw new NotFoundError('ExportJob', req.params.id!);
      if (existing.status !== 'failed') {
        throw new ConflictError(`Cannot archive job with status '${existing.status}' — only failed jobs can be archived`);
      }

      return tx.exportJob.update({
        where: { id: existing.id },
        data: { status: 'archived' },
      });
    });

    await auditService.log(ctx, {
      action: 'export.dlq.archive',
      objectType: 'export_job',
      objectId: job.id,
      details: { previousStatus: 'failed' },
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });

    res.json(formatFailedJob(job));
  } catch (err) {
    next(err);
  }
});

// --- DLQ Statistics ---
dlqRouter.get('/stats', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const stats = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      const [totalFailed, totalArchived, failedLast24h, oldestFailed, failedDocx, failedOdt] =
        await Promise.all([
          tx.exportJob.count({ where: { tenantId: ctx.tenantId, status: 'failed' } }),
          tx.exportJob.count({ where: { tenantId: ctx.tenantId, status: 'archived' } }),
          tx.exportJob.count({
            where: {
              tenantId: ctx.tenantId,
              status: 'failed',
              completedAt: { gte: twentyFourHoursAgo },
            },
          }),
          tx.exportJob.findFirst({
            where: { tenantId: ctx.tenantId, status: 'failed' },
            orderBy: { queuedAt: 'asc' },
            select: { queuedAt: true },
          }),
          tx.exportJob.count({
            where: { tenantId: ctx.tenantId, status: 'failed', format: 'docx' },
          }),
          tx.exportJob.count({
            where: { tenantId: ctx.tenantId, status: 'failed', format: 'odt' },
          }),
        ]);

      return {
        totalFailed,
        totalArchived,
        oldestFailed: oldestFailed?.queuedAt?.toISOString() ?? null,
        failedLast24h,
        failedByFormat: { docx: failedDocx, odt: failedOdt },
      };
    });

    res.json(stats);
  } catch (err) {
    next(err);
  }
});

// --- Helpers ---

function formatFailedJob(j: {
  id: string; tenantId: string; contractInstanceId: string;
  requestedBy: string; format: string; status: string;
  resultStoragePath: string | null; errorMessage: string | null;
  retryCount: number; queuedAt: Date; startedAt: Date | null;
  completedAt: Date | null;
}) {
  return {
    id: j.id,
    tenantId: j.tenantId,
    contractInstanceId: j.contractInstanceId,
    requestedBy: j.requestedBy,
    format: j.format,
    status: j.status,
    errorMessage: j.errorMessage,
    retryCount: j.retryCount,
    queuedAt: j.queuedAt.toISOString(),
    startedAt: j.startedAt?.toISOString() ?? null,
    completedAt: j.completedAt?.toISOString() ?? null,
  };
}
