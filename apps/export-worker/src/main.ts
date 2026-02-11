import PgBoss from 'pg-boss';
import { logger } from './logger';
import { handleExportJob } from './handlers/export-handler';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const CONCURRENCY = Number(process.env.EXPORT_WORKER_CONCURRENCY) || 2;

async function main() {
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
    await boss.stop({ graceful: true, timeout: 30_000 });
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
