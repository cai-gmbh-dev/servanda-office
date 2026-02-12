/**
 * Batch-Export Routes Tests — Sprint 12 (Team 05)
 *
 * Tests batch export lifecycle: create with multiple contracts,
 * validation limits, ownership checks, and status aggregation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock Dependencies ---

const mockExportJobs: Record<string, any> = {};

const mockTx = {
  contractInstance: {
    findMany: vi.fn(),
  },
  exportJob: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
};

vi.mock('../../../shared/db', () => ({
  prisma: {
    $transaction: vi.fn((fn: any) => fn(mockTx)),
  },
  setTenantContext: vi.fn(),
}));

vi.mock('../../../middleware/tenant-context', () => ({
  getTenantContext: vi.fn().mockReturnValue({
    tenantId: 'tenant-001',
    userId: 'user-001',
    role: 'user',
  }),
}));

vi.mock('../../../services/audit.service', () => ({
  auditService: { log: vi.fn() },
}));

vi.mock('../../../shared/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('pg-boss', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      start: vi.fn(),
      send: vi.fn(),
    })),
  };
});

import { batchExportRouter } from '../batch-routes';
import { auditService } from '../../../services/audit.service';

// --- Helpers ---

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
    } as any,
    next: vi.fn(),
  };
}

function findHandler(router: any, method: string, path: string) {
  const layer = router.stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

// --- Tests ---

describe('Batch Export Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.FEATURE_ODT_EXPORT;
  });

  describe('POST /batch — Create Batch Export', () => {
    it('should create 3 export jobs for 3 valid contract IDs', async () => {
      const contractIds = [
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333',
      ];

      // Mock: all 3 contracts found
      mockTx.contractInstance.findMany.mockResolvedValue(
        contractIds.map((id) => ({ id, tenantId: 'tenant-001' })),
      );

      // Mock: export job creation
      let jobIndex = 0;
      mockTx.exportJob.create.mockImplementation(({ data }: any) => {
        jobIndex++;
        return Promise.resolve({
          id: `job-00${jobIndex}`,
          tenantId: data.tenantId,
          contractInstanceId: data.contractInstanceId,
          requestedBy: data.requestedBy,
          format: data.format,
          status: 'queued',
          batchId: data.batchId,
          styleTemplateId: null,
          resultStoragePath: null,
          errorMessage: null,
          queuedAt: new Date(),
          startedAt: null,
          completedAt: null,
        });
      });

      const { req, res, next } = createMockReqRes({
        body: {
          contractInstanceIds: contractIds,
          format: 'docx',
        },
      });

      const handler = findHandler(batchExportRouter, 'post', '/batch');
      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          batchId: expect.any(String),
          jobs: expect.arrayContaining([
            expect.objectContaining({
              contractInstanceId: contractIds[0],
              exportJobId: expect.any(String),
            }),
            expect.objectContaining({
              contractInstanceId: contractIds[1],
              exportJobId: expect.any(String),
            }),
            expect.objectContaining({
              contractInstanceId: contractIds[2],
              exportJobId: expect.any(String),
            }),
          ]),
        }),
      );

      // Should have created 3 export jobs
      expect(mockTx.exportJob.create).toHaveBeenCalledTimes(3);

      // Should have logged audit event
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-001' }),
        expect.objectContaining({
          action: 'batch.export.request',
          objectType: 'batch_export',
          details: expect.objectContaining({ jobCount: 3 }),
        }),
        expect.any(Object),
      );
    });

    it('should reject batch with >20 contract IDs (400 Validation Error)', async () => {
      const tooManyIds = Array.from({ length: 21 }, (_, i) =>
        `${String(i).padStart(8, '0')}-0000-0000-0000-000000000000`,
      );

      const { req, res, next } = createMockReqRes({
        body: {
          contractInstanceIds: tooManyIds,
          format: 'docx',
        },
      });

      const handler = findHandler(batchExportRouter, 'post', '/batch');
      await handler(req, res, next);

      // Zod validation error is passed to next()
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          issues: expect.arrayContaining([
            expect.objectContaining({
              message: 'Maximum 20 contract instance IDs per batch',
            }),
          ]),
        }),
      );
    });

    it('should return 404 when a contract belongs to another tenant', async () => {
      const contractIds = [
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
      ];

      // Mock: only 1 of 2 contracts found (the other belongs to a different tenant)
      mockTx.contractInstance.findMany.mockResolvedValue([
        { id: contractIds[0], tenantId: 'tenant-001' },
      ]);

      const { req, res, next } = createMockReqRes({
        body: {
          contractInstanceIds: contractIds,
          format: 'docx',
        },
      });

      const handler = findHandler(batchExportRouter, 'post', '/batch');
      await handler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 }),
      );
    });
  });

  describe('GET /batch/:id — Batch Status', () => {
    it('should aggregate status correctly (2 done, 1 pending)', async () => {
      const batchId = 'batch-uuid-001';

      mockTx.exportJob.findMany.mockResolvedValue([
        {
          id: 'job-001',
          contractInstanceId: 'contract-001',
          tenantId: 'tenant-001',
          status: 'done',
          resultStoragePath: 'exports/job-001.docx',
          batchId,
        },
        {
          id: 'job-002',
          contractInstanceId: 'contract-002',
          tenantId: 'tenant-001',
          status: 'done',
          resultStoragePath: 'exports/job-002.docx',
          batchId,
        },
        {
          id: 'job-003',
          contractInstanceId: 'contract-003',
          tenantId: 'tenant-001',
          status: 'queued',
          resultStoragePath: null,
          batchId,
        },
      ]);

      const { req, res, next } = createMockReqRes({
        params: { id: batchId },
      });

      const handler = findHandler(batchExportRouter, 'get', '/batch/:id');
      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          batchId,
          total: 3,
          completed: 2,
          failed: 0,
          pending: 1,
          jobs: expect.arrayContaining([
            expect.objectContaining({
              exportJobId: 'job-001',
              status: 'done',
              downloadUrl: '/api/v1/export-jobs/job-001/download',
            }),
            expect.objectContaining({
              exportJobId: 'job-002',
              status: 'done',
              downloadUrl: '/api/v1/export-jobs/job-002/download',
            }),
            expect.objectContaining({
              exportJobId: 'job-003',
              status: 'queued',
            }),
          ]),
        }),
      );
    });

    it('should return 404 for non-existent batch', async () => {
      mockTx.exportJob.findMany.mockResolvedValue([]);

      const { req, res, next } = createMockReqRes({
        params: { id: 'nonexistent-batch' },
      });

      const handler = findHandler(batchExportRouter, 'get', '/batch/:id');
      await handler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 }),
      );
    });
  });
});
