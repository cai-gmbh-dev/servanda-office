/**
 * EventBus Prometheus Metrics — Sprint 13 (Team 01 - Product Architecture)
 *
 * Exposes EventBus stats as Prometheus-compatible metrics.
 * Designed to be scraped by the existing Prometheus + Grafana stack (Sprint 6).
 *
 * Endpoint: GET /api/v1/metrics/events
 *
 * Metrics exposed:
 * - servanda_events_published_total     (counter)  — Total events published
 * - servanda_events_errors_total        (counter)  — Total handler errors
 * - servanda_events_handlers_registered (gauge)    — Currently registered handlers
 * - servanda_events_last_published_timestamp (gauge) — Unix timestamp of last event
 */

import { Router, Request, Response } from 'express';
import { getEventBus } from '@servanda/shared';

export const eventMetricsRouter = Router();

/**
 * GET /api/v1/metrics/events
 *
 * Returns Prometheus text exposition format (text/plain; version=0.0.4).
 * Each metric includes HELP and TYPE annotations per Prometheus convention.
 */
eventMetricsRouter.get('/', (_req: Request, res: Response) => {
  const stats = getEventBus().getStats();

  const lastPublishedTimestamp = stats.lastEventAt
    ? Math.floor(stats.lastEventAt.getTime() / 1000)
    : 0;

  const lines: string[] = [
    // --- servanda_events_published_total ---
    '# HELP servanda_events_published_total Total number of domain events published since process start.',
    '# TYPE servanda_events_published_total counter',
    `servanda_events_published_total ${stats.publishedCount}`,
    '',
    // --- servanda_events_errors_total ---
    '# HELP servanda_events_errors_total Total number of event handler errors since process start.',
    '# TYPE servanda_events_errors_total counter',
    `servanda_events_errors_total ${stats.errorCount}`,
    '',
    // --- servanda_events_handlers_registered ---
    '# HELP servanda_events_handlers_registered Current number of registered event handlers.',
    '# TYPE servanda_events_handlers_registered gauge',
    `servanda_events_handlers_registered ${stats.handlerCount}`,
    '',
    // --- servanda_events_last_published_timestamp ---
    '# HELP servanda_events_last_published_timestamp Unix timestamp of the last published event (0 if none).',
    '# TYPE servanda_events_last_published_timestamp gauge',
    `servanda_events_last_published_timestamp ${lastPublishedTimestamp}`,
    '',
  ];

  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(lines.join('\n'));
});
