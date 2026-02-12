/**
 * Batch-Export Routes — Sprint 12 (Team 05)
 *
 * Ermoeglicht den Export mehrerer Vertraege in einem Request.
 * Erstellt individuelle ExportJobs pro Vertrag und gibt
 * eine Batch-Job-ID zurueck zum Tracking.
 *
 * Endpoints:
 * - POST /batch    — Batch-Export erstellen (max 20 Vertraege)
 * - GET /batch/:id — Batch-Status (aggregiert)
 */

import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import PgBoss from 'pg-boss';
import { prisma, setTenantContext } from '../../shared/db';
import { getTenantContext } from '../../middleware/tenant-context';
import { auditService } from '../../services/audit.service';
import { NotFoundError, AppError } from '../../middleware/error-handler';
import { logger } from '../../shared/logger';

export const batchExportRouter = Router();

// pgboss instance — initialized lazily
let boss: PgBoss | null = null;

async function getBoss(): Promise<PgBoss> {
  if (!boss) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL not set');
    boss = new PgBoss(connectionString);
    await boss.start();
    logger.info('pgboss started for batch export queue');
  }
  return boss;
}

// --- Validation Schemas ---

const batchCreateSchema = z.object({
  contractInstanceIds: z
    .array(z.string().uuid())
    .min(1, 'At least 1 contract instance ID is required')
    .max(20, 'Maximum 20 contract instance IDs per batch'),
  format: z.enum(['docx', 'odt']),
  styleTemplateId: z.string().uuid().optional(),
});

// --- POST /batch — Create Batch Export ---

batchExportRouter.post('/batch', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const input = batchCreateSchema.parse(req.body);

    // Verify ODT is enabled if requested
    if (input.format === 'odt' && process.env.FEATURE_ODT_EXPORT !== 'true') {
      throw new AppError(409, 'ODT export is not enabled for this instance', 'CONFLICT');
    }

    const batchId = randomUUID();

    // Verify ownership of all contracts and create export jobs in a single transaction
    const jobs = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      // Verify all contracts exist and belong to the tenant
      const contracts = await tx.contractInstance.findMany({
        where: {
          id: { in: input.contractInstanceIds },
          tenantId: ctx.tenantId,
        },
        select: { id: true },
      });

      const foundIds = new Set(contracts.map((c) => c.id));
      const missingIds = input.contractInstanceIds.filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        throw new NotFoundError('ContractInstance', missingIds[0] ?? 'unknown');
      }

      // Create an ExportJob for each contract
      const createdJobs: Array<{ contractInstanceId: string; exportJobId: string }> = [];

      for (const contractInstanceId of input.contractInstanceIds) {
        const job = await tx.exportJob.create({
          data: {
            tenantId: ctx.tenantId,
            contractInstanceId,
            requestedBy: ctx.userId,
            format: input.format,
            styleTemplateId: input.styleTemplateId ?? null,
            status: 'queued',
            batchId,
          },
        });
        createdJobs.push({ contractInstanceId, exportJobId: job.id });
      }

      return createdJobs;
    });

    // Enqueue all jobs to pgboss
    try {
      const pgboss = await getBoss();
      for (const job of jobs) {
        await pgboss.send('export-job', {
          jobId: job.exportJobId,
          tenantId: ctx.tenantId,
          contractInstanceId: job.contractInstanceId,
          format: input.format,
          styleTemplateId: input.styleTemplateId,
          batchId,
        });
      }
    } catch (err) {
      logger.error({ err, batchId }, 'Failed to enqueue batch export jobs');
      // Jobs stay in 'queued' status — worker can pick up later
    }

    await auditService.log(ctx, {
      action: 'batch.export.request',
      objectType: 'batch_export',
      objectId: batchId,
      details: {
        contractInstanceIds: input.contractInstanceIds,
        format: input.format,
        jobCount: jobs.length,
      },
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });

    res.status(201).json({
      batchId,
      jobs,
    });
  } catch (err) {
    next(err);
  }
});

// --- GET /batch/:id — Batch Status (aggregated) ---

batchExportRouter.get('/batch/:id', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const batchId = req.params.id;

    const exportJobs = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);
      return tx.exportJob.findMany({
        where: {
          tenantId: ctx.tenantId,
          batchId,
        },
      });
    });

    if (exportJobs.length === 0) {
      throw new NotFoundError('BatchExport', batchId);
    }

    // Aggregate status counts
    let completed = 0;
    let failed = 0;
    let pending = 0;

    const jobDetails = exportJobs.map((job) => {
      if (job.status === 'done') {
        completed++;
      } else if (job.status === 'failed') {
        failed++;
      } else {
        pending++;
      }

      return {
        exportJobId: job.id,
        contractInstanceId: job.contractInstanceId,
        status: job.status,
        downloadUrl: job.status === 'done' && job.resultStoragePath
          ? `/api/v1/export-jobs/${job.id}/download`
          : undefined,
      };
    });

    res.json({
      batchId,
      total: exportJobs.length,
      completed,
      failed,
      pending,
      jobs: jobDetails,
    });
  } catch (err) {
    next(err);
  }
});
