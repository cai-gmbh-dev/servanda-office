/**
 * Export API Routes — Sprint 5 (Team 05)
 *
 * Export job lifecycle (ADR-003): Create → Queue → Worker picks up → S3 upload → Download.
 *
 * Endpoints:
 * - POST  /              — Create export job
 * - GET   /:id           — Get job status + download URL
 * - GET   /:id/download  — Redirect to pre-signed download URL
 */

import { Router } from 'express';
import { z } from 'zod';
import PgBoss from 'pg-boss';
import { prisma, setTenantContext } from '../../shared/db';
import { getTenantContext } from '../../middleware/tenant-context';
import { auditService } from '../../services/audit.service';
import { NotFoundError, ConflictError } from '../../middleware/error-handler';
import { logger } from '../../shared/logger';

export const exportRouter = Router();

// pgboss instance — initialized lazily
let boss: PgBoss | null = null;

async function getBoss(): Promise<PgBoss> {
  if (!boss) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL not set');
    boss = new PgBoss(connectionString);
    await boss.start();
    logger.info('pgboss started for export queue');
  }
  return boss;
}

// --- Create Export Job ---
const createExportJobSchema = z.object({
  contractInstanceId: z.string().uuid(),
  format: z.enum(['docx', 'odt']),
  styleTemplateId: z.string().uuid().optional(),
});

exportRouter.post('/', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const input = createExportJobSchema.parse(req.body);

    // Verify ODT is enabled if requested
    if (input.format === 'odt' && process.env.FEATURE_ODT_EXPORT !== 'true') {
      throw new ConflictError('ODT export is not enabled for this instance');
    }

    const job = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      // Verify contract exists and belongs to tenant
      const contract = await tx.contractInstance.findFirst({
        where: { id: input.contractInstanceId, tenantId: ctx.tenantId },
      });
      if (!contract) throw new NotFoundError('ContractInstance', input.contractInstanceId);

      return tx.exportJob.create({
        data: {
          tenantId: ctx.tenantId,
          contractInstanceId: input.contractInstanceId,
          requestedBy: ctx.userId,
          format: input.format,
          styleTemplateId: input.styleTemplateId,
          status: 'queued',
        },
      });
    });

    // Enqueue to pgboss
    try {
      const pgboss = await getBoss();
      await pgboss.send('export-job', {
        jobId: job.id,
        tenantId: ctx.tenantId,
        contractInstanceId: input.contractInstanceId,
        format: input.format,
        styleTemplateId: input.styleTemplateId,
      });
    } catch (err) {
      logger.error({ err, jobId: job.id }, 'Failed to enqueue export job');
      // Job stays in 'queued' status — worker can pick up later
    }

    await auditService.log(ctx, {
      action: 'export.request',
      objectType: 'export_job',
      objectId: job.id,
      details: {
        contractInstanceId: input.contractInstanceId,
        format: input.format,
      },
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });

    res.status(201).json(formatExportJob(job));
  } catch (err) {
    next(err);
  }
});

// --- Get Job Status ---
exportRouter.get('/:id', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);

    const job = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);
      return tx.exportJob.findFirst({
        where: { id: req.params.id, tenantId: ctx.tenantId },
      });
    });

    if (!job) throw new NotFoundError('ExportJob', req.params.id);
    res.json(formatExportJob(job));
  } catch (err) {
    next(err);
  }
});

// --- Download (redirect to pre-signed URL) ---
exportRouter.get('/:id/download', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);

    const job = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);
      return tx.exportJob.findFirst({
        where: { id: req.params.id, tenantId: ctx.tenantId },
      });
    });

    if (!job) throw new NotFoundError('ExportJob', req.params.id);
    if (job.status !== 'done' || !job.resultStoragePath) {
      throw new ConflictError('Export is not yet complete or has failed');
    }

    // TODO: Integrate S3 presigned URL generation via export-worker service
    const url = `/exports/download?path=${encodeURIComponent(job.resultStoragePath)}`;

    res.redirect(302, url);
  } catch (err) {
    next(err);
  }
});

function formatExportJob(j: {
  id: string; tenantId: string; contractInstanceId: string;
  requestedBy: string; format: string; status: string;
  resultStoragePath: string | null; errorMessage: string | null;
  queuedAt: Date; startedAt: Date | null; completedAt: Date | null;
}) {
  return {
    id: j.id,
    tenantId: j.tenantId,
    contractInstanceId: j.contractInstanceId,
    requestedBy: j.requestedBy,
    format: j.format,
    status: j.status,
    resultStoragePath: j.resultStoragePath,
    errorMessage: j.errorMessage,
    queuedAt: j.queuedAt.toISOString(),
    startedAt: j.startedAt?.toISOString() ?? null,
    completedAt: j.completedAt?.toISOString() ?? null,
  };
}
