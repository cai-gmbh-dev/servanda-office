import PgBoss from 'pg-boss';
import { PrismaClient } from '@prisma/client';
import { logger } from './logger';
import { handleExportJob, type ExportJobData } from './handlers/export-handler';
import { preWarmTemplates } from './cache/pre-warm';
import templateCache from './cache/template-cache';
import { AutoScaler } from './scaling/auto-scaler';
import {
  startMetricsServer,
  stopMetricsServer,
  setQueueDepth,
  setWorkerConcurrency,
  incExportJobsTotal,
} from './metrics/export-metrics';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const CONCURRENCY = Number(process.env.EXPORT_WORKER_CONCURRENCY) || 2;
const MIN_CONCURRENCY = Number(process.env.EXPORT_MIN_CONCURRENCY) || 1;
const MAX_CONCURRENCY = Number(process.env.EXPORT_MAX_CONCURRENCY) || 8;

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

  // Start Prometheus metrics server
  startMetricsServer();
  setWorkerConcurrency(CONCURRENCY);

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
        incExportJobsTotal('failed');
        throw err; // pg-boss will retry
      }
    },
  );

  // ── Auto-Scaler: dynamic concurrency based on queue depth ──────────

  /**
   * Queue size provider: uses pgboss getQueueSize if available,
   * otherwise falls back to raw SQL count.
   */
  async function getQueueSize(): Promise<number> {
    // pgboss v9+ exposes getQueueSize()
    if (typeof (boss as any).getQueueSize === 'function') {
      return (boss as any).getQueueSize('export-job');
    }

    // Fallback: raw SQL on pgboss's internal table
    const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM pgboss.job
      WHERE name = 'export-job'
        AND state = 'created'
    `;

    return Number(result[0]?.count ?? 0);
  }

  /**
   * Concurrency change handler.
   * pgboss does not support live concurrency changes on an active subscription,
   * so we track the new concurrency and log it. The actual worker restart
   * with new concurrency would be handled by the orchestrator in production.
   * For metrics and observability, we update the gauge immediately.
   */
  async function onConcurrencyChange(newConcurrency: number): Promise<void> {
    logger.info(
      { newConcurrency },
      'AutoScaler: concurrency target updated',
    );
    setWorkerConcurrency(newConcurrency);
  }

  const autoScaler = new AutoScaler(
    CONCURRENCY,
    getQueueSize,
    onConcurrencyChange,
    {
      minConcurrency: MIN_CONCURRENCY,
      maxConcurrency: MAX_CONCURRENCY,
    },
  );

  // Update queue depth metric on each scale event
  autoScaler.onScale((event) => {
    setQueueDepth(event.queueDepth);
    logger.info(
      {
        direction: event.direction,
        previous: event.previousConcurrency,
        new: event.newConcurrency,
        queueDepth: event.queueDepth,
      },
      'Scale event emitted',
    );
  });

  autoScaler.start();

  // Periodically update queue depth metric (independent of scale events)
  const queueDepthInterval = setInterval(async () => {
    try {
      const depth = await getQueueSize();
      setQueueDepth(depth);
    } catch {
      // Silently ignore — metrics will show stale data
    }
  }, 30_000);

  // ── Graceful shutdown ──────────────────────────────────────────────

  const shutdown = async () => {
    logger.info('Shutting down export worker...');
    autoScaler.stop();
    clearInterval(queueDepthInterval);
    templateCache.clear();
    await boss.stop({ graceful: true, timeout: 30_000 });
    await stopMetricsServer();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, 'Export worker failed to start');
  process.exit(1);
});
