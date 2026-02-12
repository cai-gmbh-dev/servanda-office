/**
 * RUM (Real User Monitoring) API Routes — Sprint 13 (Team 06: QA & Compliance)
 *
 * Receives and aggregates frontend performance metrics.
 *
 * Endpoints:
 *   POST /          — Receive RUM data (public, rate-limited)
 *   GET  /summary   — Get aggregated RUM summary (admin only)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireRole } from '../../middleware/auth';
import { logger } from '../../shared/logger';

export const rumRouter = Router();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RUMEntry {
  name: string;
  value: number;
  timestamp: number;
  route?: string;
  metadata?: Record<string, string | number>;
  receivedAt: number;
}

// ---------------------------------------------------------------------------
// In-Memory Buffer (ring buffer, last 1000 entries)
// ---------------------------------------------------------------------------

const MAX_BUFFER_SIZE = 1000;
let rumBuffer: RUMEntry[] = [];

/**
 * Get the current buffer (for testing).
 */
export function getRumBuffer(): RUMEntry[] {
  return rumBuffer;
}

/**
 * Clear the buffer (for testing).
 */
export function clearRumBuffer(): void {
  rumBuffer = [];
}

// ---------------------------------------------------------------------------
// Rate Limiting (simple in-memory sliding window)
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60;   // 60 requests per minute per IP

const rateLimitMap = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  let timestamps = rateLimitMap.get(ip);
  if (!timestamps) {
    timestamps = [];
    rateLimitMap.set(ip, timestamps);
  }

  // Remove expired timestamps
  const valid = timestamps.filter((t) => t > windowStart);
  rateLimitMap.set(ip, valid);

  if (valid.length >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  valid.push(now);
  return false;
}

// Periodic cleanup of stale rate limit entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  for (const [ip, timestamps] of rateLimitMap.entries()) {
    const valid = timestamps.filter((t) => t > windowStart);
    if (valid.length === 0) {
      rateLimitMap.delete(ip);
    } else {
      rateLimitMap.set(ip, valid);
    }
  }
}, 5 * 60_000).unref();

// ---------------------------------------------------------------------------
// Validation Schema
// ---------------------------------------------------------------------------

const rumMetricSchema = z.object({
  name: z.string().min(1).max(100),
  value: z.number().finite(),
  timestamp: z.number().int().positive(),
  route: z.string().max(500).optional(),
  metadata: z.record(z.union([z.string(), z.number()])).optional(),
});

const rumPayloadSchema = z.object({
  metrics: z.array(rumMetricSchema).min(1).max(100),
});

// ---------------------------------------------------------------------------
// POST / — Receive RUM data (public, rate-limited)
// ---------------------------------------------------------------------------

rumRouter.post('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    // Rate limiting
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (isRateLimited(clientIp)) {
      res.status(429).json({
        code: 'RATE_LIMITED',
        message: 'Too many requests. Max 60 per minute.',
      });
      return;
    }

    // Validate payload
    const parsed = rumPayloadSchema.parse(req.body);

    const receivedAt = Date.now();

    // Add to buffer
    for (const metric of parsed.metrics) {
      const entry: RUMEntry = {
        name: metric.name,
        value: metric.value,
        timestamp: metric.timestamp,
        route: metric.route,
        metadata: metric.metadata,
        receivedAt,
      };

      rumBuffer.push(entry);
    }

    // Trim buffer to max size (keep most recent)
    if (rumBuffer.length > MAX_BUFFER_SIZE) {
      rumBuffer = rumBuffer.slice(-MAX_BUFFER_SIZE);
    }

    logger.debug(
      { count: parsed.metrics.length, bufferSize: rumBuffer.length },
      'RUM metrics received',
    );

    res.status(202).json({ accepted: parsed.metrics.length });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /summary — Aggregated RUM summary (admin only)
// ---------------------------------------------------------------------------

rumRouter.get('/summary', requireRole('admin'), (_req: Request, res: Response) => {
  const summary = computeSummary();
  res.json(summary);
});

// ---------------------------------------------------------------------------
// Summary Computation
// ---------------------------------------------------------------------------

interface MetricSummary {
  count: number;
  p50: number;
  p75: number;
  p95: number;
  min: number;
  max: number;
  avg: number;
}

interface RouteSummary {
  route: string;
  count: number;
  p50: number;
  p75: number;
  p95: number;
}

interface RUMSummary {
  totalEntries: number;
  oldestTimestamp: number | null;
  newestTimestamp: number | null;
  metrics: Record<string, MetricSummary>;
  routes: RouteSummary[];
}

function computeSummary(): RUMSummary {
  if (rumBuffer.length === 0) {
    return {
      totalEntries: 0,
      oldestTimestamp: null,
      newestTimestamp: null,
      metrics: {},
      routes: [],
    };
  }

  // Group by metric name
  const byName: Record<string, number[]> = {};
  const routeMetrics: Record<string, number[]> = {};
  let oldestTs = Infinity;
  let newestTs = 0;

  for (const entry of rumBuffer) {
    // Track timestamps
    if (entry.timestamp < oldestTs) oldestTs = entry.timestamp;
    if (entry.timestamp > newestTs) newestTs = entry.timestamp;

    // Group by metric name
    if (!byName[entry.name]) byName[entry.name] = [];
    byName[entry.name]!.push(entry.value);

    // Group route changes by route
    if (entry.name === 'route_change' && entry.route) {
      if (!routeMetrics[entry.route]) routeMetrics[entry.route] = [];
      routeMetrics[entry.route]!.push(entry.value);
    }
  }

  // Compute per-metric summaries
  const metrics: Record<string, MetricSummary> = {};
  for (const [name, values] of Object.entries(byName)) {
    metrics[name] = computePercentiles(values);
  }

  // Compute per-route summaries
  const routes: RouteSummary[] = Object.entries(routeMetrics)
    .map(([route, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return {
        route,
        count: sorted.length,
        p50: percentile(sorted, 50),
        p75: percentile(sorted, 75),
        p95: percentile(sorted, 95),
      };
    })
    .sort((a, b) => b.count - a.count); // Most visited routes first

  return {
    totalEntries: rumBuffer.length,
    oldestTimestamp: oldestTs === Infinity ? null : oldestTs,
    newestTimestamp: newestTs === 0 ? null : newestTs,
    metrics,
    routes,
  };
}

function computePercentiles(values: number[]): MetricSummary {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);

  return {
    count: sorted.length,
    p50: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p95: percentile(sorted, 95),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    avg: Math.round((sum / sorted.length) * 100) / 100,
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}
