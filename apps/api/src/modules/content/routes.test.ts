/**
 * Content API Integration Tests — Sprint 7 (Team 06)
 *
 * Tests Clause/Template CRUD, version lifecycle, catalog, changelog, and publishing gates.
 * Uses fully mocked Prisma to simulate DB interactions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../shared/db', () => {
  const mockTx = {
    clause: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn(),
    },
    clauseVersion: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    template: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn(),
    },
    templateVersion: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
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
    role: 'editor',
  }),
}));

vi.mock('../../middleware/auth', () => ({
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../services/audit.service', () => ({
  auditService: { log: vi.fn() },
}));

vi.mock('../../shared/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// Import after mocks
import { contentRouter } from './routes';
import { prisma, __mockTx } from '../../shared/db' as any;

// Helper to create mock req/res/next
function createMockReqRes(overrides: {
  method?: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
} = {}) {
  const req = {
    params: overrides.params ?? {},
    query: overrides.query ?? {},
    body: overrides.body ?? {},
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test' },
  } as any;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    redirect: vi.fn(),
  } as any;

  const next = vi.fn();

  return { req, res, next };
}

describe('Content API — Clause Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /clauses', () => {
    it('should create a clause with valid input', async () => {
      const mockClause = {
        id: 'clause-001',
        tenantId: 'tenant-001',
        title: 'Geheimhaltungsklausel',
        jurisdiction: 'DE',
        legalArea: 'Arbeitsrecht',
        tags: ['NDA'],
        currentPublishedVersionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      __mockTx.clause.create.mockResolvedValue(mockClause);

      const { req, res, next } = createMockReqRes({
        body: {
          title: 'Geheimhaltungsklausel',
          jurisdiction: 'DE',
          legalArea: 'Arbeitsrecht',
          tags: ['NDA'],
        },
      });

      // Find the POST /clauses handler
      const layer = contentRouter.stack.find(
        (l: any) => l.route?.path === '/clauses' && l.route?.methods?.post,
      );
      expect(layer).toBeDefined();

      // Execute the last handler (after middleware)
      const handlers = layer!.route!.stack;
      const handler = handlers[handlers.length - 1].handle;
      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'clause-001',
          title: 'Geheimhaltungsklausel',
          jurisdiction: 'DE',
        }),
      );
    });

    it('should reject clause creation with missing title', async () => {
      const { req, res, next } = createMockReqRes({
        body: { jurisdiction: 'DE' },
      });

      const layer = contentRouter.stack.find(
        (l: any) => l.route?.path === '/clauses' && l.route?.methods?.post,
      );
      const handlers = layer!.route!.stack;
      const handler = handlers[handlers.length - 1].handle;
      await handler(req, res, next);

      // Zod validation error passed to next()
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('GET /clauses', () => {
    it('should return paginated clause list', async () => {
      const mockClauses = [
        {
          id: 'clause-001', tenantId: 'tenant-001', title: 'Klausel 1',
          jurisdiction: 'DE', legalArea: null, tags: [], currentPublishedVersionId: null,
          createdAt: new Date(), updatedAt: new Date(),
        },
      ];
      __mockTx.clause.findMany.mockResolvedValue(mockClauses);
      __mockTx.clause.count.mockResolvedValue(1);

      const { req, res, next } = createMockReqRes({
        query: { page: '1', pageSize: '10' },
      });

      const layer = contentRouter.stack.find(
        (l: any) => l.route?.path === '/clauses' && l.route?.methods?.get,
      );
      const handlers = layer!.route!.stack;
      const handler = handlers[handlers.length - 1].handle;
      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          total: 1,
          page: 1,
          hasMore: false,
        }),
      );
    });
  });

  describe('GET /clauses/:id', () => {
    it('should return clause with versions', async () => {
      const mockClause = {
        id: 'clause-001', tenantId: 'tenant-001', title: 'Test',
        jurisdiction: 'DE', legalArea: null, tags: [],
        currentPublishedVersionId: null,
        createdAt: new Date(), updatedAt: new Date(),
        versions: [{
          id: 'cv-001', clauseId: 'clause-001', versionNumber: 1,
          content: 'Test content', parameters: null, rules: [],
          status: 'draft', authorId: 'user-001', reviewerId: null,
          publishedAt: null, createdAt: new Date(),
        }],
      };
      __mockTx.clause.findFirst.mockResolvedValue(mockClause);

      const { req, res, next } = createMockReqRes({
        params: { id: 'clause-001' },
      });

      const layer = contentRouter.stack.find(
        (l: any) => l.route?.path === '/clauses/:id' && l.route?.methods?.get,
      );
      const handlers = layer!.route!.stack;
      const handler = handlers[handlers.length - 1].handle;
      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'clause-001',
          versions: expect.arrayContaining([
            expect.objectContaining({ versionNumber: 1 }),
          ]),
        }),
      );
    });

    it('should return 404 for non-existent clause', async () => {
      __mockTx.clause.findFirst.mockResolvedValue(null);

      const { req, res, next } = createMockReqRes({
        params: { id: 'nonexistent' },
      });

      const layer = contentRouter.stack.find(
        (l: any) => l.route?.path === '/clauses/:id' && l.route?.methods?.get,
      );
      const handlers = layer!.route!.stack;
      const handler = handlers[handlers.length - 1].handle;
      await handler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 }),
      );
    });
  });

  describe('POST /clauses/:id/versions', () => {
    it('should create a new clause version with auto-increment', async () => {
      const mockClause = {
        id: 'clause-001', tenantId: 'tenant-001',
        versions: [{ versionNumber: 2 }],
      };
      __mockTx.clause.findFirst.mockResolvedValue(mockClause);

      const mockVersion = {
        id: 'cv-003', clauseId: 'clause-001', versionNumber: 3,
        content: 'Neuer Inhalt', parameters: null, rules: [],
        status: 'draft', authorId: 'user-001', reviewerId: null,
        publishedAt: null, createdAt: new Date(),
      };
      __mockTx.clauseVersion.create.mockResolvedValue(mockVersion);

      const { req, res, next } = createMockReqRes({
        params: { id: 'clause-001' },
        body: { content: 'Neuer Inhalt', severity: 'hard' },
      });

      const layer = contentRouter.stack.find(
        (l: any) => l.route?.path === '/clauses/:id/versions' && l.route?.methods?.post,
      );
      const handlers = layer!.route!.stack;
      const handler = handlers[handlers.length - 1].handle;
      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ versionNumber: 3 }),
      );
    });
  });

  describe('PATCH /clauses/:id/versions/:vid/status', () => {
    it('should transition draft → review', async () => {
      const existing = {
        id: 'cv-001', clauseId: 'clause-001', status: 'draft',
        versionNumber: 1, content: 'Test',
      };
      __mockTx.clauseVersion.findFirst.mockResolvedValue(existing);
      __mockTx.clauseVersion.update.mockResolvedValue({
        ...existing, status: 'review',
        authorId: 'user-001', reviewerId: null, publishedAt: null,
        parameters: null, rules: [], createdAt: new Date(),
      });

      const { req, res, next } = createMockReqRes({
        params: { id: 'clause-001', vid: 'cv-001' },
        body: { status: 'review' },
      });

      const layer = contentRouter.stack.find(
        (l: any) => l.route?.path === '/clauses/:id/versions/:vid/status' && l.route?.methods?.patch,
      );
      const handlers = layer!.route!.stack;
      const handler = handlers[handlers.length - 1].handle;
      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'review' }),
      );
    });

    it('should reject invalid transition draft → published', async () => {
      const existing = { id: 'cv-001', status: 'draft' };
      __mockTx.clauseVersion.findFirst.mockResolvedValue(existing);

      const { req, res, next } = createMockReqRes({
        params: { id: 'clause-001', vid: 'cv-001' },
        body: { status: 'published' },
      });

      const layer = contentRouter.stack.find(
        (l: any) => l.route?.path === '/clauses/:id/versions/:vid/status' && l.route?.methods?.patch,
      );
      const handlers = layer!.route!.stack;
      const handler = handlers[handlers.length - 1].handle;
      await handler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 409 }),
      );
    });
  });
});

describe('Content API — Template Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /templates', () => {
    it('should create a template', async () => {
      const mockTemplate = {
        id: 'tmpl-001', tenantId: 'tenant-001', title: 'Arbeitsvertrag',
        description: 'Standard-Arbeitsvertrag', category: 'Arbeitsrecht',
        jurisdiction: 'DE', legalArea: null, tags: ['arbeit'],
        currentPublishedVersionId: null,
        createdAt: new Date(), updatedAt: new Date(),
      };
      __mockTx.template.create.mockResolvedValue(mockTemplate);

      const { req, res, next } = createMockReqRes({
        body: {
          title: 'Arbeitsvertrag',
          description: 'Standard-Arbeitsvertrag',
          category: 'Arbeitsrecht',
          jurisdiction: 'DE',
          tags: ['arbeit'],
        },
      });

      const layer = contentRouter.stack.find(
        (l: any) => l.route?.path === '/templates' && l.route?.methods?.post,
      );
      const handlers = layer!.route!.stack;
      const handler = handlers[handlers.length - 1].handle;
      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Arbeitsvertrag' }),
      );
    });
  });

  describe('GET /catalog/templates', () => {
    it('should return published templates from vendor tenants', async () => {
      const mockTemplates = [
        {
          id: 'tmpl-001', tenantId: 'vendor-001', title: 'Arbeitsvertrag',
          description: null, category: 'Arbeitsrecht', jurisdiction: 'DE',
          legalArea: null, tags: [], currentPublishedVersionId: 'tv-001',
          createdAt: new Date(), updatedAt: new Date(),
          versions: [{
            id: 'tv-001', templateId: 'tmpl-001', versionNumber: 1,
            structure: [], interviewFlowId: null, defaultStyleTemplateId: null,
            status: 'published', authorId: 'user-001', reviewerId: 'user-002',
            publishedAt: new Date(), createdAt: new Date(),
          }],
        },
      ];
      __mockTx.template.findMany.mockResolvedValue(mockTemplates);
      __mockTx.template.count.mockResolvedValue(1);

      const { req, res, next } = createMockReqRes({
        query: { page: '1' },
      });

      const layer = contentRouter.stack.find(
        (l: any) => l.route?.path === '/catalog/templates' && l.route?.methods?.get,
      );
      const handlers = layer!.route!.stack;
      const handler = handlers[handlers.length - 1].handle;
      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          total: 1,
          data: expect.arrayContaining([
            expect.objectContaining({ title: 'Arbeitsvertrag', latestVersion: expect.any(Object) }),
          ]),
        }),
      );
    });
  });
});

describe('Content API — Publishing Gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /clauses/:id/versions/:vid/publishing-gates', () => {
    it('should return gate validation results', async () => {
      __mockTx.clauseVersion.findUnique.mockResolvedValue({
        id: 'cv-001', clauseId: 'clause-001', versionNumber: 1,
        content: 'Test content', authorId: 'user-001', reviewerId: 'user-002',
        status: 'approved', rules: [], metadata: null,
        validFrom: null, validUntil: null,
      });
      __mockTx.clause.findUnique.mockResolvedValue({
        id: 'clause-001', jurisdiction: 'DE',
      });

      const { req, res, next } = createMockReqRes({
        params: { id: 'clause-001', vid: 'cv-001' },
      });

      const layer = contentRouter.stack.find(
        (l: any) => l.route?.path === '/clauses/:id/versions/:vid/publishing-gates' && l.route?.methods?.get,
      );
      const handlers = layer!.route!.stack;
      const handler = handlers[handlers.length - 1].handle;
      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          canPublish: true,
          gates: expect.arrayContaining([
            expect.objectContaining({ gate: 'PG-C01', passed: true }),
          ]),
        }),
      );
    });
  });
});
