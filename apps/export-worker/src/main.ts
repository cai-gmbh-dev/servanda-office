import PgBoss from 'pg-boss';
import { PrismaClient } from '@prisma/client';
import { logger } from './logger';
import { handleExportJob } from './handlers/export-handler';
import { preWarmTemplates } from './cache/pre-warm';
import templateCache from './cache/template-cache';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const CONCURRENCY = Number(process.env.EXPORT_WORKER_CONCURRENCY) || 2;

async function main() {
  const prisma = new PrismaClient();

  const boss = new PgBoss({
    connectionString: DATABASE_URL,
    retryLimit: 3,
    retryDelay: 30,
    expireInSeconds: 120,
    retentionDays: 7,
    archiveCompletedAfterSeconds: 86_400, // 1 day
  });

  boss.on('error', (err) => {
    logger.error({ err }, 'pg-boss error');
  });

  await boss.start();
  logger.info('Export worker started');

  // Pre-warm template cache asynchronously (non-blocking)
  // Fire-and-forget: job processing starts immediately, cache populates in background
  preWarmTemplates(prisma).catch((err) => {
    logger.warn({ err }, 'Template cache pre-warming failed — cache will populate on demand');
  });

  // Subscribe to export jobs (ADR-003)
  await boss.work(
    'export-job',
    { teamConcurrency: CONCURRENCY },
    async (job) => {
      logger.info({ jobId: job.id, data: job.data }, 'Processing export job');
      try {
        await handleExportJob(job.data as ExportJobData);
        logger.info({ jobId: job.id }, 'Export job completed');
      } catch (err) {
        logger.error({ jobId: job.id, err }, 'Export job failed');
        throw err; // pg-boss will retry
      }
    },
  );

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down export worker...');
    templateCache.clear();
    await boss.stop({ graceful: true, timeout: 30_000 });
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

interface ExportJobData {
  exportJobId: string;
  tenantId: string;
  contractInstanceId: string;
  format: 'docx' | 'odt';
  styleTemplateId?: string;
}

main().catch((err) => {
  logger.fatal({ err }, 'Export worker failed to start');
  process.exit(1);
});
