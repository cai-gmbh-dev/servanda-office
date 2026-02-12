/**
 * Rate-Limiting Middleware — Sprint 9 (Team 02)
 *
 * In-memory sliding-window rate limiter. No external dependencies.
 *
 * Key = IP address + optional x-tenant-id header.
 * Expired entries are cleaned up every 60 seconds.
 *
 * Exports:
 * - createRateLimiter(opts) — factory that returns Express middleware
 * - authRateLimiter          — 20 req/min (login, auth endpoints)
 * - apiRateLimiter           — 200 req/min (general API)
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../shared/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimiterOptions {
  /** Time window in milliseconds (default: 60 000 = 1 minute). */
  windowMs?: number;
  /** Maximum number of requests allowed within the window (default: 100). */
  maxRequests?: number;
  /** Optional label for logging (e.g. "auth", "api"). */
  label?: string;
}

/** Tracks request timestamps per key. */
interface BucketEntry {
  timestamps: number[];
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an Express middleware that enforces a sliding-window rate limit.
 *
 * When the limit is exceeded the middleware responds with:
 *   HTTP 429 Too Many Requests
 *   Retry-After: <seconds until oldest request leaves the window>
 */
export function createRateLimiter(opts: RateLimiterOptions = {}) {
  const windowMs = opts.windowMs ?? 60_000;
  const maxRequests = opts.maxRequests ?? 100;
  const label = opts.label ?? 'default';

  const store = new Map<string, BucketEntry>();

  // -----------------------------------------------------------------------
  // Periodic cleanup — remove entries whose newest timestamp is older than
  // the current window so the Map does not grow unboundedly.
  // -----------------------------------------------------------------------
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      // Remove timestamps outside the window
      entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);
      if (entry.timestamps.length === 0) {
        store.delete(key);
      }
    }
  }, 60_000);

  // Allow the Node process to exit even if the interval is still active
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  // -----------------------------------------------------------------------
  // Middleware
  // -----------------------------------------------------------------------
  return (req: Request, res: Response, next: NextFunction): void => {
    const tenantId = req.headers['x-tenant-id'] as string | undefined;
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const key = tenantId ? `${ip}:${tenantId}` : ip;

    const now = Date.now();
    let entry = store.get(key);

    if (!entry) {
      entry = { timestamps: [] };
      store.set(key, entry);
    }

    // Evict timestamps outside the current window
    entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);

    if (entry.timestamps.length >= maxRequests) {
      // Compute Retry-After: seconds until the oldest request leaves the window
      const oldestTs = entry.timestamps[0]!;
      const retryAfterMs = windowMs - (now - oldestTs);
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);

      logger.warn(
        { key, limiter: label, count: entry.timestamps.length, maxRequests },
        'Rate limit exceeded',
      );

      res.set('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${retryAfterSec} second(s).`,
        retryAfter: retryAfterSec,
      });
      return;
    }

    // Record this request
    entry.timestamps.push(now);

    // Set informational headers (optional, helpful for clients)
    res.set('X-RateLimit-Limit', String(maxRequests));
    res.set('X-RateLimit-Remaining', String(maxRequests - entry.timestamps.length));
    res.set('X-RateLimit-Reset', String(Math.ceil((now + windowMs) / 1000)));

    next();
  };
}

// ---------------------------------------------------------------------------
// Pre-configured limiters
// ---------------------------------------------------------------------------

/** Rate limiter for authentication endpoints: 20 requests per minute. */
export const authRateLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 20,
  label: 'auth',
});

/** Rate limiter for general API endpoints: 200 requests per minute. */
export const apiRateLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 200,
  label: 'api',
});
