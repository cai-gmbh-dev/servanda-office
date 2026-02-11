/**
 * Export API Integration Tests — Sprint 7 (Team 06)
 *
 * Tests export job lifecycle: create, status, download.
 * Uses fully mocked Prisma and pgboss.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../shared/db', () => {
  const mockTx = {
    contractInstance: {
      findFirst: vi.fn(),
    },
    exportJob: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  };

  return {
    prisma: {
      $transaction: vi.fn((fn: any) => fn(mockTx)),
    },
    setTenantContext: vi.fn(),
    __mockTx: mockTx,
  };
});

vi.mock('../../middleware/tenant-context', () => ({
  getTenantContext: vi.fn().mockReturnValue({
    tenantId: 'tenant-001',
    userId: 'user-001',
    role: 'user',
  }),
}));

vi.mock('../../services/audit.service', () => ({
  auditService: { log: vi.fn() },
}));

vi.mock('../../shared/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('pg-boss', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      start: vi.fn(),
      send: vi.fn(),
    })),
  };
});

import { exportRouter } from './routes';
import { __mockTx } from '../../shared/db' as any;

function createMockReqRes(overrides: {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
} = {}) {
  return {
    req: {
      params: overrides.params ?? {},
      query: overrides.query ?? {},
      body: overrides.body ?? {},
      ip: '127.0.0.1',
      headers: { 'user-agent': 'test' },
    } as any,
    res: {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      redirect: vi.fn(),
    } as any,
    next: vi.fn(),
  };
}

describe('Export API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.FEATURE_ODT_EXPORT;
  });

  describe('POST / — Create Export Job', () => {
    it('should create a DOCX export job', async () => {
      __mockTx.contractInstance.findFirst.mockResolvedValue({
        id: 'contract-001', tenantId: 'tenant-001',
      });
      __mockTx.exportJob.create.mockResolvedValue({
        id: 'job-001', tenantId: 'tenant-001',
        contractInstanceId: 'contract-001', requestedBy: 'user-001',
        format: 'docx', status: 'queued', styleTemplateId: null,
        resultStoragePath: null, errorMessage: null,
        queuedAt: new Date(), startedAt: null, completedAt: null,
      });

      const { req, res, next } = createMockReqRes({
        body: { contractInstanceId: 'contract-001', format: 'docx' },
      });

      const layer = exportRouter.stack.find(
        (l: any) => l.route?.path === '/' && l.route?.methods?.post,
      );
      const handler = layer!.route!.stack[layer!.route!.stack.length - 1].handle;
      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'docx', status: 'queued' }),
      );
    });

    it('should reject ODT export when feature is disabled', async () => {
      const { req, res, next } = createMockReqRes({
        body: { contractInstanceId: 'contract-001', format: 'odt' },
      });

      const layer = exportRouter.stack.find(
        (l: any) => l.route?.path === '/' && l.route?.methods?.post,
      );
      const handler = layer!.route!.stack[layer!.route!.stack.length - 1].handle;
      await handler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 409 }),
      );
    });

    it('should allow ODT export when feature is enabled', async () => {
      process.env.FEATURE_ODT_EXPORT = 'true';

      __mockTx.contractInstance.findFirst.mockResolvedValue({
        id: 'contract-001', tenantId: 'tenant-001',
      });
      __mockTx.exportJob.create.mockResolvedValue({
        id: 'job-002', tenantId: 'tenant-001',
        contractInstanceId: 'contract-001', requestedBy: 'user-001',
        format: 'odt', status: 'queued', styleTemplateId: null,
        resultStoragePath: null, errorMessage: null,
        queuedAt: new Date(), startedAt: null, completedAt: null,
      });

      const { req, res, next } = createMockReqRes({
        body: { contractInstanceId: 'contract-001', format: 'odt' },
      });

      const layer = exportRouter.stack.find(
        (l: any) => l.route?.path === '/' && l.route?.methods?.post,
      );
      const handler = layer!.route!.stack[layer!.route!.stack.length - 1].handle;
      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'odt' }),
      );
    });

    it('should return 404 for non-existent contract', async () => {
      __mockTx.contractInstance.findFirst.mockResolvedValue(null);

      const { req, res, next } = createMockReqRes({
        body: { contractInstanceId: 'nonexistent', format: 'docx' },
      });

      const layer = exportRouter.stack.find(
        (l: any) => l.route?.path === '/' && l.route?.methods?.post,
      );
      const handler = layer!.route!.stack[layer!.route!.stack.length - 1].handle;
      await handler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 }),
      );
    });
  });

  describe('GET /:id — Job Status', () => {
    it('should return export job status', async () => {
      __mockTx.exportJob.findFirst.mockResolvedValue({
        id: 'job-001', tenantId: 'tenant-001',
        contractInstanceId: 'contract-001', requestedBy: 'user-001',
        format: 'docx', status: 'done',
        resultStoragePath: 'exports/job-001.docx',
        errorMessage: null,
        queuedAt: new Date(), startedAt: new Date(), completedAt: new Date(),
      });

      const { req, res, next } = createMockReqRes({
        params: { id: 'job-001' },
      });

      const layer = exportRouter.stack.find(
        (l: any) => l.route?.path === '/:id' && l.route?.methods?.get,
      );
      const handler = layer!.route!.stack[layer!.route!.stack.length - 1].handle;
      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'job-001',
          status: 'done',
          format: 'docx',
        }),
      );
    });

    it('should return 404 for non-existent job', async () => {
      __mockTx.exportJob.findFirst.mockResolvedValue(null);

      const { req, res, next } = createMockReqRes({
        params: { id: 'nonexistent' },
      });

      const layer = exportRouter.stack.find(
        (l: any) => l.route?.path === '/:id' && l.route?.methods?.get,
      );
      const handler = layer!.route!.stack[layer!.route!.stack.length - 1].handle;
      await handler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 }),
      );
    });
  });

  describe('GET /:id/download — Download Redirect', () => {
    it('should reject download for incomplete job', async () => {
      __mockTx.exportJob.findFirst.mockResolvedValue({
        id: 'job-001', status: 'processing', resultStoragePath: null,
      });

      const { req, res, next } = createMockReqRes({
        params: { id: 'job-001' },
      });

      const layer = exportRouter.stack.find(
        (l: any) => l.route?.path === '/:id/download' && l.route?.methods?.get,
      );
      const handler = layer!.route!.stack[layer!.route!.stack.length - 1].handle;
      await handler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 409 }),
      );
    });
  });
});
