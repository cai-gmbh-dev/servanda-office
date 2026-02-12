/**
 * Export Performance Metrics — Sprint 13 (Team 05)
 *
 * Tracks and exposes Prometheus-format metrics for the export worker.
 * Served via a simple HTTP endpoint on METRICS_PORT (default 9090).
 *
 * Metrics:
 * - export_jobs_total (counter, by status: done/failed/cached)
 * - export_render_duration_seconds (histogram)
 * - export_cache_hits_total (counter)
 * - export_cache_misses_total (counter)
 * - export_queue_depth (gauge)
 * - export_worker_concurrency (gauge)
 *
 * Based on: observability stack (Prometheus + Grafana), Sprint 6 foundation
 */

import { createServer, type Server } from 'http';
import { logger } from '../logger';

const METRICS_PORT = Number(process.env.METRICS_PORT) || 9090;

// ── Histogram bucket boundaries for render duration (seconds) ───────

const RENDER_DURATION_BUCKETS = [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 15, 30, 60];

// ── Internal metric state ───────────────────────────────────────────

interface CounterByLabel {
  [label: string]: number;
}

interface HistogramState {
  bucketCounts: number[];  // one count per bucket boundary
  sum: number;
  count: number;
  inf: number; // +Inf bucket
}

/** Global metrics state */
const metrics = {
  // Counters
  exportJobsTotal: { done: 0, failed: 0, cached: 0 } as CounterByLabel,
  cacheHitsTotal: 0,
  cacheMissesTotal: 0,

  // Gauges
  queueDepth: 0,
  workerConcurrency: 0,

  // Histogram
  renderDuration: {
    bucketCounts: new Array(RENDER_DURATION_BUCKETS.length).fill(0) as number[],
    sum: 0,
    count: 0,
    inf: 0,
  } as HistogramState,
};

// ── Public API for recording metrics ────────────────────────────────

/**
 * Increment the export_jobs_total counter.
 * @param status - 'done', 'failed', or 'cached'
 */
export function incExportJobsTotal(status: 'done' | 'failed' | 'cached'): void {
  metrics.exportJobsTotal[status] = (metrics.exportJobsTotal[status] ?? 0) + 1;
}

/**
 * Record a render duration observation for the histogram.
 * @param durationSeconds - render time in seconds
 */
export function observeRenderDuration(durationSeconds: number): void {
  metrics.renderDuration.sum += durationSeconds;
  metrics.renderDuration.count += 1;
  metrics.renderDuration.inf += 1;

  for (let i = 0; i < RENDER_DURATION_BUCKETS.length; i++) {
    if (durationSeconds <= (RENDER_DURATION_BUCKETS[i] ?? Infinity)) {
      metrics.renderDuration.bucketCounts[i] = (metrics.renderDuration.bucketCounts[i] ?? 0) + 1;
    }
  }
}

/**
 * Increment the cache hits counter.
 */
export function incCacheHits(): void {
  metrics.cacheHitsTotal += 1;
}

/**
 * Increment the cache misses counter.
 */
export function incCacheMisses(): void {
  metrics.cacheMissesTotal += 1;
}

/**
 * Set the current queue depth gauge.
 */
export function setQueueDepth(depth: number): void {
  metrics.queueDepth = depth;
}

/**
 * Set the current worker concurrency gauge.
 */
export function setWorkerConcurrency(concurrency: number): void {
  metrics.workerConcurrency = concurrency;
}

// ── Prometheus text format serialization ────────────────────────────

/**
 * Generate Prometheus text format output for all metrics.
 */
export function serializeMetrics(): string {
  const lines: string[] = [];

  // export_jobs_total
  lines.push('# HELP export_jobs_total Total number of export jobs processed');
  lines.push('# TYPE export_jobs_total counter');
  for (const [status, count] of Object.entries(metrics.exportJobsTotal)) {
    lines.push(`export_jobs_total{status="${status}"} ${count}`);
  }

  // export_render_duration_seconds
  lines.push('# HELP export_render_duration_seconds Duration of DOCX/ODT rendering in seconds');
  lines.push('# TYPE export_render_duration_seconds histogram');
  let cumulativeCount = 0;
  for (let i = 0; i < RENDER_DURATION_BUCKETS.length; i++) {
    cumulativeCount += metrics.renderDuration.bucketCounts[i] ?? 0;
    lines.push(
      `export_render_duration_seconds_bucket{le="${RENDER_DURATION_BUCKETS[i] ?? 0}"} ${cumulativeCount}`,
    );
  }
  lines.push(
    `export_render_duration_seconds_bucket{le="+Inf"} ${metrics.renderDuration.inf}`,
  );
  lines.push(`export_render_duration_seconds_sum ${metrics.renderDuration.sum}`);
  lines.push(`export_render_duration_seconds_count ${metrics.renderDuration.count}`);

  // export_cache_hits_total
  lines.push('# HELP export_cache_hits_total Total number of export result cache hits');
  lines.push('# TYPE export_cache_hits_total counter');
  lines.push(`export_cache_hits_total ${metrics.cacheHitsTotal}`);

  // export_cache_misses_total
  lines.push('# HELP export_cache_misses_total Total number of export result cache misses');
  lines.push('# TYPE export_cache_misses_total counter');
  lines.push(`export_cache_misses_total ${metrics.cacheMissesTotal}`);

  // export_queue_depth
  lines.push('# HELP export_queue_depth Current number of jobs in the export queue');
  lines.push('# TYPE export_queue_depth gauge');
  lines.push(`export_queue_depth ${metrics.queueDepth}`);

  // export_worker_concurrency
  lines.push('# HELP export_worker_concurrency Current worker concurrency level');
  lines.push('# TYPE export_worker_concurrency gauge');
  lines.push(`export_worker_concurrency ${metrics.workerConcurrency}`);

  return lines.join('\n') + '\n';
}

// ── HTTP Metrics Server ─────────────────────────────────────────────

let metricsServer: Server | null = null;

/**
 * Start the metrics HTTP server on METRICS_PORT.
 * Exposes GET /metrics in Prometheus text format.
 */
export function startMetricsServer(port?: number): Server {
  const listenPort = port ?? METRICS_PORT;

  metricsServer = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/metrics') {
      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
      res.end(serializeMetrics());
      return;
    }

    // Health check endpoint
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  metricsServer.listen(listenPort, () => {
    logger.info({ port: listenPort }, 'Metrics server started');
  });

  return metricsServer;
}

/**
 * Stop the metrics HTTP server.
 */
export function stopMetricsServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!metricsServer) {
      resolve();
      return;
    }

    metricsServer.close((err) => {
      if (err) {
        reject(err);
      } else {
        metricsServer = null;
        logger.info('Metrics server stopped');
        resolve();
      }
    });
  });
}

/**
 * Reset all metrics to initial state.
 * Used in tests.
 */
export function resetMetrics(): void {
  metrics.exportJobsTotal = { done: 0, failed: 0, cached: 0 };
  metrics.cacheHitsTotal = 0;
  metrics.cacheMissesTotal = 0;
  metrics.queueDepth = 0;
  metrics.workerConcurrency = 0;
  metrics.renderDuration = {
    bucketCounts: new Array(RENDER_DURATION_BUCKETS.length).fill(0) as number[],
    sum: 0,
    count: 0,
    inf: 0,
  };
}
