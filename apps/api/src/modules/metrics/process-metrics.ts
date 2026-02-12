/**
 * Process Metrics Module — Sprint 13 (Team 06: QA & Compliance)
 *
 * Exposes Node.js process metrics for health monitoring
 * and memory leak detection during soak tests.
 *
 * Provides:
 *   - getProcessMetrics() — returns memory, CPU, uptime, event loop delay
 *   - processMetricsRouter — Express router for GET /api/v1/metrics/process
 */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProcessMetrics {
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
    arrayBuffers: number;
  };
  uptime: number;
  cpuUsage: {
    user: number;
    system: number;
  };
  eventLoopDelay: {
    current: number;
    max: number;
    avg: number;
    samples: number;
  };
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Event Loop Delay Measurement
// ---------------------------------------------------------------------------

let eventLoopSamples: number[] = [];
let eventLoopMax = 0;
let eventLoopTimer: ReturnType<typeof setTimeout> | null = null;

function measureEventLoopDelay(): void {
  const start = process.hrtime.bigint();

  // setTimeout(fn, 0) should fire immediately if event loop is not blocked.
  // The actual delay is the event loop lag.
  setTimeout(() => {
    const end = process.hrtime.bigint();
    const delayMs = Number(end - start) / 1_000_000; // Convert ns to ms

    eventLoopSamples.push(delayMs);
    if (delayMs > eventLoopMax) eventLoopMax = delayMs;

    // Keep only last 100 samples (~100 seconds at 1s intervals)
    if (eventLoopSamples.length > 100) {
      eventLoopSamples = eventLoopSamples.slice(-100);
    }

    // Schedule next measurement
    eventLoopTimer = setTimeout(measureEventLoopDelay, 1000);
    if (eventLoopTimer.unref) eventLoopTimer.unref();
  }, 0);
}

// Start measurement on module load
measureEventLoopDelay();

// ---------------------------------------------------------------------------
// getProcessMetrics()
// ---------------------------------------------------------------------------

export function getProcessMetrics(): ProcessMetrics {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();

  const avgDelay = eventLoopSamples.length > 0
    ? eventLoopSamples.reduce((sum, v) => sum + v, 0) / eventLoopSamples.length
    : 0;

  const currentDelay = eventLoopSamples.length > 0
    ? eventLoopSamples[eventLoopSamples.length - 1] ?? 0
    : 0;

  return {
    memoryUsage: {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      rss: mem.rss,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers,
    },
    uptime: process.uptime(),
    cpuUsage: {
      user: cpu.user,    // microseconds
      system: cpu.system, // microseconds
    },
    eventLoopDelay: {
      current: Math.round(currentDelay * 100) / 100,
      max: Math.round(eventLoopMax * 100) / 100,
      avg: Math.round(avgDelay * 100) / 100,
      samples: eventLoopSamples.length,
    },
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Express Router — GET /api/v1/metrics/process (admin only)
// ---------------------------------------------------------------------------

export const processMetricsRouter = Router();

processMetricsRouter.get('/', requireRole('admin'), (_req: Request, res: Response) => {
  res.json(getProcessMetrics());
});

// ---------------------------------------------------------------------------
// Cleanup (for testing)
// ---------------------------------------------------------------------------

export function stopEventLoopMeasurement(): void {
  if (eventLoopTimer) {
    clearTimeout(eventLoopTimer);
    eventLoopTimer = null;
  }
}

export function resetEventLoopSamples(): void {
  eventLoopSamples = [];
  eventLoopMax = 0;
}
