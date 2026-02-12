/**
 * RUM Routes Tests — Sprint 13 (Team 06: QA & Compliance)
 *
 * Tests for RUM data ingestion and summary aggregation:
 *   - POST /  — Receive RUM data
 *   - GET /summary — Aggregated summary (admin)
 *   - Rate limiting
 *   - Payload validation
 *   - Percentile computation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock Dependencies ---

vi.mock('../../../middleware/auth', () => ({
  requireRole: (...roles: string[]) => {
    return (req: any, _res: any, next: any) => {
      const tenant = req.tenant;
      if (!tenant) return next(new Error('Not authenticated'));
      if (!roles.includes(tenant.role)) return next(new Error('Forbidden'));
      next();
    };
  },
}));

vi.mock('../../../shared/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { rumRouter, getRumBuffer, clearRumBuffer } from '../rum-routes';

// --- Helpers ---

function createMockReqRes(overrides: {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  ip?: string;
  tenant?: { tenantId: string; userId: string; role: string };
} = {}) {
  return {
    req: {
      params: overrides.params ?? {},
      query: overrides.query ?? {},
      body: overrides.body ?? {},
      ip: overrides.ip ?? '127.0.0.1',
      headers: { 'user-agent': 'test' },
      socket: { remoteAddress: overrides.ip ?? '127.0.0.1' },
      tenant: overrides.tenant ?? {
        tenantId: 'tenant-001',
        userId: 'user-001',
        role: 'admin',
      },
    } as any,
    res: {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as any,
    next: vi.fn(),
  };
}

function findHandler(router: any, method: string, path: string) {
  const layer = router.stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  // For routes with middleware (requireRole), return last handler
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function findMiddlewareChain(router: any, method: string, path: string) {
  const layer = router.stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  return layer.route.stack.map((s: any) => s.handle);
}

async function callHandler(handlers: any[], req: any, res: any, next: any) {
  for (const handler of handlers) {
    await handler(req, res, next);
    // If next was called with an error, stop
    if (next.mock.calls.length > 0 && next.mock.calls[next.mock.calls.length - 1][0]) {
      return;
    }
  }
}

// --- Tests ---

describe('RUM Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRumBuffer();
  });

  describe('POST / — Receive RUM Data', () => {
    it('should accept valid RUM metrics and return 202', async () => {
      const { req, res, next } = createMockReqRes({
        body: {
          metrics: [
            { name: 'LCP', value: 2500, timestamp: Date.now() },
            { name: 'FID', value: 15, timestamp: Date.now() },
            { name: 'CLS', value: 0.1, timestamp: Date.now() },
          ],
        },
      });

      const handler = findHandler(rumRouter, 'post', '/');
      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith({ accepted: 3 });

      // Verify buffer was populated
      const buffer = getRumBuffer();
      expect(buffer.length).toBe(3);
      expect(buffer[0].name).toBe('LCP');
      expect(buffer[0].value).toBe(2500);
      expect(buffer[0].receivedAt).toBeDefined();
    });

    it('should accept metrics with route and metadata', async () => {
      const { req, res, next } = createMockReqRes({
        body: {
          metrics: [
            {
              name: 'route_change',
              value: 150,
              timestamp: Date.now(),
              route: '/contracts',
              metadata: { component: 'ContractsPage' },
            },
          ],
        },
      });

      const handler = findHandler(rumRouter, 'post', '/');
      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(202);

      const buffer = getRumBuffer();
      expect(buffer[0].route).toBe('/contracts');
      expect(buffer[0].metadata).toEqual({ component: 'ContractsPage' });
    });

    it('should reject payload with empty metrics array', async () => {
      const { req, res, next } = createMockReqRes({
        body: {
          metrics: [],
        },
      });

      const handler = findHandler(rumRouter, 'post', '/');
      await handler(req, res, next);

      // Zod validation error passed to next()
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          issues: expect.arrayContaining([
            expect.objectContaining({
              code: 'too_small',
            }),
          ]),
        }),
      );
    });

    it('should reject payload with invalid metric name', async () => {
      const { req, res, next } = createMockReqRes({
        body: {
          metrics: [
            { name: '', value: 100, timestamp: Date.now() },
          ],
        },
      });

      const handler = findHandler(rumRouter, 'post', '/');
      await handler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          issues: expect.arrayContaining([
            expect.objectContaining({
              code: 'too_small',
            }),
          ]),
        }),
      );
    });

    it('should enforce buffer max size (1000 entries)', async () => {
      // Pre-fill buffer with 995 entries
      for (let i = 0; i < 995; i++) {
        getRumBuffer().push({
          name: `metric-${i}`,
          value: i,
          timestamp: Date.now(),
          receivedAt: Date.now(),
        });
      }

      // Add 10 more via API (total would be 1005 > 1000)
      const { req, res, next } = createMockReqRes({
        body: {
          metrics: Array.from({ length: 10 }, (_, i) => ({
            name: `new-metric-${i}`,
            value: i * 100,
            timestamp: Date.now(),
          })),
        },
      });

      const handler = findHandler(rumRouter, 'post', '/');
      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(202);

      // Buffer should be trimmed to 1000
      const buffer = getRumBuffer();
      expect(buffer.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('POST / — Rate Limiting', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      const handler = findHandler(rumRouter, 'post', '/');

      // Fire 61 requests from the same IP (limit is 60/min)
      for (let i = 0; i < 61; i++) {
        const { req, res, next } = createMockReqRes({
          ip: '10.0.0.99',
          body: {
            metrics: [
              { name: 'test', value: i, timestamp: Date.now() },
            ],
          },
        });

        await handler(req, res, next);

        if (i === 60) {
          // 61st request should be rate limited
          expect(res.status).toHaveBeenCalledWith(429);
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: 'RATE_LIMITED' }),
          );
        }
      }
    });
  });

  describe('GET /summary — RUM Summary', () => {
    it('should return empty summary when no data', async () => {
      const { req, res, next } = createMockReqRes({
        tenant: { tenantId: 't1', userId: 'u1', role: 'admin' },
      });

      const handlers = findMiddlewareChain(rumRouter, 'get', '/summary');
      await callHandler(handlers, req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          totalEntries: 0,
          oldestTimestamp: null,
          newestTimestamp: null,
          metrics: {},
          routes: [],
        }),
      );
    });

    it('should compute correct percentiles for metrics', async () => {
      // Seed the buffer with known data
      const now = Date.now();
      const lcpValues = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
      for (const value of lcpValues) {
        getRumBuffer().push({
          name: 'LCP',
          value,
          timestamp: now,
          receivedAt: now,
        });
      }

      const { req, res, next } = createMockReqRes({
        tenant: { tenantId: 't1', userId: 'u1', role: 'admin' },
      });

      const handlers = findMiddlewareChain(rumRouter, 'get', '/summary');
      await callHandler(handlers, req, res, next);

      const summary = res.json.mock.calls[0][0];
      expect(summary.totalEntries).toBe(10);
      expect(summary.metrics.LCP).toBeDefined();
      expect(summary.metrics.LCP.count).toBe(10);
      expect(summary.metrics.LCP.min).toBe(100);
      expect(summary.metrics.LCP.max).toBe(1000);
      expect(summary.metrics.LCP.p50).toBe(500);
      expect(summary.metrics.LCP.p95).toBe(1000);
    });

    it('should include per-route breakdown for route_change metrics', async () => {
      const now = Date.now();

      // Add route change metrics for different routes
      const routeData = [
        { route: '/contracts', values: [100, 120, 110, 130, 140] },
        { route: '/content/clauses', values: [80, 90, 85] },
        { route: '/export', values: [200] },
      ];

      for (const { route, values } of routeData) {
        for (const value of values) {
          getRumBuffer().push({
            name: 'route_change',
            value,
            timestamp: now,
            route,
            receivedAt: now,
          });
        }
      }

      const { req, res, next } = createMockReqRes({
        tenant: { tenantId: 't1', userId: 'u1', role: 'admin' },
      });

      const handlers = findMiddlewareChain(rumRouter, 'get', '/summary');
      await callHandler(handlers, req, res, next);

      const summary = res.json.mock.calls[0][0];
      expect(summary.routes.length).toBe(3);

      // Routes should be sorted by count (most visited first)
      expect(summary.routes[0].route).toBe('/contracts');
      expect(summary.routes[0].count).toBe(5);
      expect(summary.routes[1].route).toBe('/content/clauses');
      expect(summary.routes[1].count).toBe(3);
      expect(summary.routes[2].route).toBe('/export');
      expect(summary.routes[2].count).toBe(1);
    });

    it('should require admin role', async () => {
      const { req, res, next } = createMockReqRes({
        tenant: { tenantId: 't1', userId: 'u1', role: 'user' },
      });

      const handlers = findMiddlewareChain(rumRouter, 'get', '/summary');
      await callHandler(handlers, req, res, next);

      // requireRole middleware should have called next with an error
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});
