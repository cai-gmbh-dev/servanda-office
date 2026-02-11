/**
 * Contract API Integration Tests — Sprint 7 (Team 06)
 *
 * Tests contract lifecycle: create, list, detail, update, validate, complete.
 * Uses fully mocked Prisma.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../shared/db', () => {
  const mockTx = {
    templateVersion: {
      findUnique: vi.fn(),
    },
    clause: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    clauseVersion: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    contractInstance: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn(),
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

import { contractRouter } from './routes';
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
    } as any,
    next: vi.fn(),
  };
}

describe('Contract API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST / — Create Contract', () => {
    it('should create a contract from published template version', async () => {
      __mockTx.templateVersion.findUnique.mockResolvedValue({
        id: 'tv-001', status: 'published',
        structure: [{ slots: [{ clauseId: 'c-001' }, { clauseId: 'c-002' }] }],
      });
      __mockTx.clause.findMany.mockResolvedValue([
        { id: 'c-001', currentPublishedVersionId: 'cv-001' },
        { id: 'c-002', currentPublishedVersionId: 'cv-002' },
      ]);
      __mockTx.contractInstance.create.mockResolvedValue({
        id: 'contract-001', tenantId: 'tenant-001', creatorId: 'user-001',
        title: 'Neuer Vertrag', clientReference: null, tags: [],
        templateVersionId: 'tv-001', clauseVersionIds: ['cv-001', 'cv-002'],
        answers: {}, selectedSlots: {},
        validationState: 'valid', validationMessages: null,
        status: 'draft', completedAt: null,
        createdAt: new Date(), updatedAt: new Date(),
      });

      const { req, res, next } = createMockReqRes({
        body: { title: 'Neuer Vertrag', templateVersionId: 'tv-001' },
      });

      const layer = contractRouter.stack.find(
        (l: any) => l.route?.path === '/' && l.route?.methods?.post,
      );
      const handler = layer!.route!.stack[layer!.route!.stack.length - 1].handle;
      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'contract-001',
          status: 'draft',
          clauseVersionIds: ['cv-001', 'cv-002'],
        }),
      );
    });

    it('should reject creation with unpublished template', async () => {
      __mockTx.templateVersion.findUnique.mockResolvedValue({
        id: 'tv-001', status: 'draft', structure: [],
      });

      const { req, res, next } = createMockReqRes({
        body: { title: 'Test', templateVersionId: 'tv-001' },
      });

      const layer = contractRouter.stack.find(
        (l: any) => l.route?.path === '/' && l.route?.methods?.post,
      );
      const handler = layer!.route!.stack[layer!.route!.stack.length - 1].handle;
      await handler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 409 }),
      );
    });
  });

  describe('GET / — List Contracts', () => {
    it('should return paginated contract list', async () => {
      const mockContracts = [{
        id: 'contract-001', tenantId: 'tenant-001', creatorId: 'user-001',
        title: 'Vertrag 1', clientReference: 'REF-001', tags: [],
        templateVersionId: 'tv-001', clauseVersionIds: [],
        answers: {}, selectedSlots: {},
        validationState: 'valid', validationMessages: null,
        status: 'draft', completedAt: null,
        createdAt: new Date(), updatedAt: new Date(),
      }];
      __mockTx.contractInstance.findMany.mockResolvedValue(mockContracts);
      __mockTx.contractInstance.count.mockResolvedValue(1);

      const { req, res, next } = createMockReqRes({ query: { page: '1' } });

      const layer = contractRouter.stack.find(
        (l: any) => l.route?.path === '/' && l.route?.methods?.get,
      );
      const handler = layer!.route!.stack[layer!.route!.stack.length - 1].handle;
      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ total: 1, page: 1 }),
      );
    });

    it('should filter by status', async () => {
      __mockTx.contractInstance.findMany.mockResolvedValue([]);
      __mockTx.contractInstance.count.mockResolvedValue(0);

      const { req, res, next } = createMockReqRes({
        query: { status: 'completed' },
      });

      const layer = contractRouter.stack.find(
        (l: any) => l.route?.path === '/' && l.route?.methods?.get,
      );
      const handler = layer!.route!.stack[layer!.route!.stack.length - 1].handle;
      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ total: 0, data: [] }),
      );
    });
  });

  describe('PATCH /:id — Auto-Save', () => {
    it('should merge answers into existing contract', async () => {
      __mockTx.contractInstance.findFirst.mockResolvedValue({
        id: 'contract-001', status: 'draft',
        answers: { q1: 'old' }, selectedSlots: {},
      });
      __mockTx.contractInstance.update.mockResolvedValue({
        id: 'contract-001', tenantId: 'tenant-001', creatorId: 'user-001',
        title: 'Test', clientReference: null, tags: [],
        templateVersionId: 'tv-001', clauseVersionIds: [],
        answers: { q1: 'old', q2: 'new' }, selectedSlots: {},
        validationState: 'valid', validationMessages: null,
        status: 'draft', completedAt: null,
        createdAt: new Date(), updatedAt: new Date(),
      });

      const { req, res, next } = createMockReqRes({
        params: { id: 'contract-001' },
        body: { answers: { q2: 'new' } },
      });

      const layer = contractRouter.stack.find(
        (l: any) => l.route?.path === '/:id' && l.route?.methods?.patch,
      );
      const handler = layer!.route!.stack[layer!.route!.stack.length - 1].handle;
      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          answers: { q1: 'old', q2: 'new' },
        }),
      );
    });

    it('should reject update on completed contract', async () => {
      __mockTx.contractInstance.findFirst.mockResolvedValue({
        id: 'contract-001', status: 'completed',
      });

      const { req, res, next } = createMockReqRes({
        params: { id: 'contract-001' },
        body: { answers: { q1: 'val' } },
      });

      const layer = contractRouter.stack.find(
        (l: any) => l.route?.path === '/:id' && l.route?.methods?.patch,
      );
      const handler = layer!.route!.stack[layer!.route!.stack.length - 1].handle;
      await handler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 409 }),
      );
    });
  });

  describe('POST /:id/validate — Rule Validation', () => {
    it('should detect requires rule violations', async () => {
      __mockTx.contractInstance.findFirst.mockResolvedValue({
        id: 'contract-001', clauseVersionIds: ['cv-001'],
        answers: {},
      });
      __mockTx.clauseVersion.findMany.mockResolvedValue([{
        id: 'cv-001', clauseId: 'c-001',
        rules: [{
          type: 'requires', targetClauseId: 'c-missing',
          severity: 'hard', message: 'Klausel X wird benötigt',
        }],
      }]);
      __mockTx.contractInstance.update.mockResolvedValue({});

      const { req, res, next } = createMockReqRes({
        params: { id: 'contract-001' },
        body: {},
      });

      const layer = contractRouter.stack.find(
        (l: any) => l.route?.path === '/:id/validate' && l.route?.methods?.post,
      );
      const handler = layer!.route!.stack[layer!.route!.stack.length - 1].handle;
      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          validationState: 'has_conflicts',
          messages: expect.arrayContaining([
            expect.objectContaining({ severity: 'hard' }),
          ]),
        }),
      );
    });

    it('should pass validation with no rules', async () => {
      __mockTx.contractInstance.findFirst.mockResolvedValue({
        id: 'contract-001', clauseVersionIds: ['cv-001'],
        answers: {},
      });
      __mockTx.clauseVersion.findMany.mockResolvedValue([{
        id: 'cv-001', clauseId: 'c-001', rules: [],
      }]);
      __mockTx.contractInstance.update.mockResolvedValue({});

      const { req, res, next } = createMockReqRes({
        params: { id: 'contract-001' },
        body: {},
      });

      const layer = contractRouter.stack.find(
        (l: any) => l.route?.path === '/:id/validate' && l.route?.methods?.post,
      );
      const handler = layer!.route!.stack[layer!.route!.stack.length - 1].handle;
      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ validationState: 'valid' }),
      );
    });
  });

  describe('POST /:id/complete — Completion', () => {
    it('should complete a valid draft contract', async () => {
      __mockTx.contractInstance.findFirst.mockResolvedValue({
        id: 'contract-001', status: 'draft', validationState: 'valid',
      });
      __mockTx.contractInstance.update.mockResolvedValue({
        id: 'contract-001', tenantId: 'tenant-001', creatorId: 'user-001',
        title: 'Test', clientReference: null, tags: [],
        templateVersionId: 'tv-001', clauseVersionIds: ['cv-001'],
        answers: {}, selectedSlots: {},
        validationState: 'valid', validationMessages: null,
        status: 'completed', completedAt: new Date(),
        createdAt: new Date(), updatedAt: new Date(),
      });

      const { req, res, next } = createMockReqRes({
        params: { id: 'contract-001' },
        body: {},
      });

      const layer = contractRouter.stack.find(
        (l: any) => l.route?.path === '/:id/complete' && l.route?.methods?.post,
      );
      const handler = layer!.route!.stack[layer!.route!.stack.length - 1].handle;
      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' }),
      );
    });

    it('should reject completion with unresolved conflicts', async () => {
      __mockTx.contractInstance.findFirst.mockResolvedValue({
        id: 'contract-001', status: 'draft', validationState: 'has_conflicts',
      });

      const { req, res, next } = createMockReqRes({
        params: { id: 'contract-001' },
        body: {},
      });

      const layer = contractRouter.stack.find(
        (l: any) => l.route?.path === '/:id/complete' && l.route?.methods?.post,
      );
      const handler = layer!.route!.stack[layer!.route!.stack.length - 1].handle;
      await handler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 409 }),
      );
    });
  });
});
