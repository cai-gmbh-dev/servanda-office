/**
 * Search Routes Tests — Sprint 13 (Team 03)
 *
 * Tests search endpoints with mocked OpenSearch client and SQL fallback.
 * Covers: feature flag switching, tenant isolation, facet aggregation,
 * autocomplete suggestions, reindex admin endpoint, and input validation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================
// Mock setup — must be before route import
// ============================================================

const mockOpenSearchSearch = vi.fn();
const mockOpenSearchBulk = vi.fn();
const mockOpenSearchIndex = vi.fn();
const mockOpenSearchDelete = vi.fn();

vi.mock('../../../services/search/search-client', () => ({
  getSearchClient: vi.fn(() => ({
    search: mockOpenSearchSearch,
    bulk: mockOpenSearchBulk,
    index: mockOpenSearchIndex,
    delete: mockOpenSearchDelete,
  })),
  resetSearchClient: vi.fn(),
  setSearchClient: vi.fn(),
  ensureIndices: vi.fn(),
  ensureTenantAliases: vi.fn(),
  checkHealth: vi.fn(),
  isAvailable: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../../services/search/index-mappings', () => ({
  INDEX_NAMES: {
    clauses: 'servanda-clauses',
    templates: 'servanda-templates',
  },
  CLAUSES_INDEX_MAPPING: { settings: {}, mappings: {} },
  TEMPLATES_INDEX_MAPPING: { settings: {}, mappings: {} },
  tenantAlias: vi.fn((index: string, tenantId: string) => `${index}-${tenantId}`),
  tenantAliasFilter: vi.fn(),
}));

vi.mock('../../../services/search/indexing-service', () => ({
  reindexAll: vi.fn().mockResolvedValue({
    clauses: { indexed: 5, errors: 0 },
    templates: { indexed: 3, errors: 0 },
  }),
}));

const mockClauseFindMany = vi.fn();
const mockClauseCount = vi.fn();
const mockTemplateFindMany = vi.fn();
const mockTemplateCount = vi.fn();

const mockTx = {
  clause: {
    findMany: mockClauseFindMany,
    count: mockClauseCount,
  },
  template: {
    findMany: mockTemplateFindMany,
    count: mockTemplateCount,
  },
  $executeRawUnsafe: vi.fn(),
};

vi.mock('../../../shared/db', () => ({
  prisma: {
    $transaction: vi.fn((fn: any) => fn(mockTx)),
    clause: {
      findMany: mockClauseFindMany,
    },
    template: {
      findMany: mockTemplateFindMany,
    },
  },
  setTenantContext: vi.fn(),
}));

vi.mock('../../../middleware/tenant-context', () => ({
  getTenantContext: vi.fn().mockReturnValue({
    tenantId: 'tenant-001',
    userId: 'user-001',
    role: 'admin',
  }),
}));

vi.mock('../../../middleware/auth', () => ({
  requireRole: vi.fn(() => (_req: any, _res: any, next: any) => next()),
}));

vi.mock('../../../shared/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { searchRouter } from '../routes';
import { reindexAll } from '../../../services/search/indexing-service';
import { getTenantContext } from '../../../middleware/tenant-context';

// ============================================================
// Helpers
// ============================================================

function createMockReqRes(overrides: {
  params?: Record<string, string>;
  query?: Record<string, string | string[]>;
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
  // Return the last handler in the stack (after middleware like requireRole)
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

const MOCK_CLAUSE_DB = {
  id: 'clause-001',
  tenantId: 'tenant-001',
  title: 'Haftungsausschluss',
  tags: ['haftung', 'ausschluss'],
  jurisdiction: 'DE',
  legalArea: 'Vertragsrecht',
  currentPublishedVersionId: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-06-15'),
  versions: [{
    id: 'cv-001',
    versionNumber: 1,
    status: 'published',
    content: 'Die Haftung wird ausgeschlossen...',
    authorId: 'user-001',
  }],
};

const MOCK_TEMPLATE_DB = {
  id: 'template-001',
  tenantId: 'tenant-001',
  title: 'Arbeitsvertrag Standard',
  description: 'Standard-Arbeitsvertrag fuer unbefristete Beschaeftigung',
  category: 'Arbeitsrecht',
  tags: ['arbeitsvertrag', 'unbefristet'],
  jurisdiction: 'DE',
  legalArea: 'Arbeitsrecht',
  currentPublishedVersionId: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-06-15'),
  versions: [{
    id: 'tv-001',
    versionNumber: 1,
    status: 'published',
    authorId: 'user-001',
  }],
};

// ============================================================
// Tests
// ============================================================

describe('Search Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.FEATURE_OPENSEARCH;
  });

  afterEach(() => {
    delete process.env.FEATURE_OPENSEARCH;
  });

  // ----- Test 1: SQL fallback clause search -----
  describe('GET /clauses — SQL Fallback', () => {
    it('should return paginated clause results with facets when OpenSearch is disabled', async () => {
      process.env.FEATURE_OPENSEARCH = 'false';

      mockClauseFindMany
        .mockResolvedValueOnce([MOCK_CLAUSE_DB]) // search results
        .mockResolvedValueOnce([MOCK_CLAUSE_DB]); // facet aggregation
      mockClauseCount.mockResolvedValue(1);

      const { req, res, next } = createMockReqRes({
        query: { q: 'Haftung', page: '1', pageSize: '20' },
      });

      const handler = findHandler(searchRouter, 'get', '/clauses');
      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              id: 'clause-001',
              title: 'Haftungsausschluss',
              tags: ['haftung', 'ausschluss'],
            }),
          ]),
          total: 1,
          page: 1,
          pageSize: 20,
          facets: expect.objectContaining({
            tags: expect.any(Array),
            jurisdiction: expect.any(Array),
            legalArea: expect.any(Array),
          }),
        }),
      );
    });

    // ----- Test 2: SQL fallback with tag filtering -----
    it('should pass tag filters to Prisma query in SQL fallback mode', async () => {
      process.env.FEATURE_OPENSEARCH = 'false';

      mockClauseFindMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockClauseCount.mockResolvedValue(0);

      const { req, res, next } = createMockReqRes({
        query: { tags: ['haftung', 'ausschluss'] as any, jurisdiction: 'DE' },
      });

      const handler = findHandler(searchRouter, 'get', '/clauses');
      await handler(req, res, next);

      expect(mockClauseFindMany).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [],
          total: 0,
        }),
      );
    });
  });

  // ----- Test 3: OpenSearch clause search -----
  describe('GET /clauses — OpenSearch', () => {
    it('should query OpenSearch with bool query and aggregations when enabled', async () => {
      process.env.FEATURE_OPENSEARCH = 'true';

      mockOpenSearchSearch.mockResolvedValue({
        body: {
          hits: {
            total: { value: 1 },
            hits: [{
              _source: {
                id: 'clause-001',
                title: 'Haftungsausschluss',
                tags: ['haftung'],
                content: 'Die Haftung wird ausgeschlossen...',
                jurisdiction: 'DE',
                legalArea: 'Vertragsrecht',
                tenantId: 'tenant-001',
                status: 'published',
                createdAt: '2024-01-01T00:00:00.000Z',
                updatedAt: '2024-06-15T00:00:00.000Z',
              },
            }],
          },
          aggregations: {
            tags: { buckets: [{ key: 'haftung', doc_count: 3 }] },
            jurisdiction: { buckets: [{ key: 'DE', doc_count: 5 }] },
            legalArea: { buckets: [{ key: 'Vertragsrecht', doc_count: 2 }] },
          },
        },
      });

      const { req, res, next } = createMockReqRes({
        query: { q: 'Haftung' },
      });

      const handler = findHandler(searchRouter, 'get', '/clauses');
      await handler(req, res, next);

      expect(mockOpenSearchSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'servanda-clauses',
          body: expect.objectContaining({
            query: expect.objectContaining({
              bool: expect.objectContaining({
                must: expect.arrayContaining([
                  expect.objectContaining({
                    multi_match: expect.objectContaining({
                      query: 'Haftung',
                      fields: ['title^3', 'content'],
                    }),
                  }),
                ]),
                filter: expect.arrayContaining([
                  { term: { tenantId: 'tenant-001' } },
                ]),
              }),
            }),
            aggs: expect.objectContaining({
              tags: expect.any(Object),
              jurisdiction: expect.any(Object),
              legalArea: expect.any(Object),
            }),
          }),
        }),
      );

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ id: 'clause-001' }),
          ]),
          total: 1,
          facets: expect.objectContaining({
            tags: [{ key: 'haftung', count: 3 }],
            jurisdiction: [{ key: 'DE', count: 5 }],
            legalArea: [{ key: 'Vertragsrecht', count: 2 }],
          }),
        }),
      );
    });
  });

  // ----- Test 4: Template search (SQL fallback) -----
  describe('GET /templates — SQL Fallback', () => {
    it('should search templates using Prisma contains in fallback mode', async () => {
      process.env.FEATURE_OPENSEARCH = 'false';

      mockTemplateFindMany
        .mockResolvedValueOnce([MOCK_TEMPLATE_DB])
        .mockResolvedValueOnce([MOCK_TEMPLATE_DB]);
      mockTemplateCount.mockResolvedValue(1);

      const { req, res, next } = createMockReqRes({
        query: { q: 'Arbeitsvertrag' },
      });

      const handler = findHandler(searchRouter, 'get', '/templates');
      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              id: 'template-001',
              title: 'Arbeitsvertrag Standard',
              category: 'Arbeitsrecht',
            }),
          ]),
          total: 1,
          facets: expect.objectContaining({
            tags: expect.any(Array),
          }),
        }),
      );
    });
  });

  // ----- Test 5: Template search (OpenSearch) -----
  describe('GET /templates — OpenSearch', () => {
    it('should query OpenSearch templates index with multi_match', async () => {
      process.env.FEATURE_OPENSEARCH = 'true';

      mockOpenSearchSearch.mockResolvedValue({
        body: {
          hits: {
            total: { value: 1 },
            hits: [{
              _source: {
                id: 'template-001',
                title: 'Arbeitsvertrag Standard',
                description: 'Standard-Arbeitsvertrag',
                category: 'Arbeitsrecht',
                tags: ['arbeitsvertrag'],
                jurisdiction: 'DE',
                legalArea: 'Arbeitsrecht',
                tenantId: 'tenant-001',
                status: 'published',
              },
            }],
          },
          aggregations: {
            tags: { buckets: [{ key: 'arbeitsvertrag', doc_count: 2 }] },
            jurisdiction: { buckets: [{ key: 'DE', doc_count: 3 }] },
            legalArea: { buckets: [{ key: 'Arbeitsrecht', doc_count: 4 }] },
          },
        },
      });

      const { req, res, next } = createMockReqRes({
        query: { q: 'Arbeitsvertrag', status: 'published' },
      });

      const handler = findHandler(searchRouter, 'get', '/templates');
      await handler(req, res, next);

      expect(mockOpenSearchSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'servanda-templates',
          body: expect.objectContaining({
            query: expect.objectContaining({
              bool: expect.objectContaining({
                filter: expect.arrayContaining([
                  { term: { tenantId: 'tenant-001' } },
                  { term: { status: 'published' } },
                ]),
              }),
            }),
          }),
        }),
      );

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          total: 1,
          facets: expect.objectContaining({
            tags: [{ key: 'arbeitsvertrag', count: 2 }],
          }),
        }),
      );
    });
  });

  // ----- Test 6: Tenant isolation in OpenSearch queries -----
  describe('Tenant Isolation', () => {
    it('should always include tenantId filter in OpenSearch queries', async () => {
      process.env.FEATURE_OPENSEARCH = 'true';

      mockOpenSearchSearch.mockResolvedValue({
        body: {
          hits: { total: { value: 0 }, hits: [] },
          aggregations: {
            tags: { buckets: [] },
            jurisdiction: { buckets: [] },
            legalArea: { buckets: [] },
          },
        },
      });

      const { req, res, next } = createMockReqRes({
        query: {},
      });

      const handler = findHandler(searchRouter, 'get', '/clauses');
      await handler(req, res, next);

      const searchCall = mockOpenSearchSearch.mock.calls[0][0];
      const filters = searchCall.body.query.bool.filter;

      expect(filters).toEqual(
        expect.arrayContaining([{ term: { tenantId: 'tenant-001' } }]),
      );
    });

    it('should use different tenant context for different tenants', async () => {
      process.env.FEATURE_OPENSEARCH = 'true';

      vi.mocked(getTenantContext).mockReturnValueOnce({
        tenantId: 'tenant-999',
        userId: 'user-999',
        role: 'user',
      });

      mockOpenSearchSearch.mockResolvedValue({
        body: {
          hits: { total: { value: 0 }, hits: [] },
          aggregations: {
            tags: { buckets: [] },
            jurisdiction: { buckets: [] },
            legalArea: { buckets: [] },
          },
        },
      });

      const { req, res, next } = createMockReqRes({ query: {} });

      const handler = findHandler(searchRouter, 'get', '/clauses');
      await handler(req, res, next);

      const searchCall = mockOpenSearchSearch.mock.calls[0][0];
      const filters = searchCall.body.query.bool.filter;
      expect(filters).toEqual(
        expect.arrayContaining([{ term: { tenantId: 'tenant-999' } }]),
      );
    });
  });

  // ----- Test 7: Autocomplete suggestions (SQL fallback) -----
  describe('GET /suggest — SQL Fallback', () => {
    it('should return title suggestions using startsWith from Prisma', async () => {
      process.env.FEATURE_OPENSEARCH = 'false';

      mockClauseFindMany.mockResolvedValue([
        { title: 'Haftungsausschluss' },
        { title: 'Haftungsbegrenzung' },
      ]);

      const { req, res, next } = createMockReqRes({
        query: { q: 'Haft', type: 'clause' },
      });

      const handler = findHandler(searchRouter, 'get', '/suggest');
      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        suggestions: ['Haftungsausschluss', 'Haftungsbegrenzung'],
      });
    });
  });

  // ----- Test 8: Autocomplete suggestions (OpenSearch) -----
  describe('GET /suggest — OpenSearch', () => {
    it('should use completion suggester when OpenSearch is enabled', async () => {
      process.env.FEATURE_OPENSEARCH = 'true';

      mockOpenSearchSearch.mockResolvedValue({
        body: {
          suggest: {
            title_suggest: [{
              options: [
                { text: 'Haftungsausschluss' },
                { text: 'Haftungsbegrenzung' },
              ],
            }],
          },
          hits: { hits: [] },
        },
      });

      const { req, res, next } = createMockReqRes({
        query: { q: 'Haft', type: 'clause' },
      });

      const handler = findHandler(searchRouter, 'get', '/suggest');
      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        suggestions: ['Haftungsausschluss', 'Haftungsbegrenzung'],
      });
    });
  });

  // ----- Test 9: Reindex endpoint (admin only) -----
  describe('POST /reindex', () => {
    it('should trigger full reindex and return summary when OpenSearch is enabled', async () => {
      process.env.FEATURE_OPENSEARCH = 'true';

      const { req, res, next } = createMockReqRes({
        body: {},
      });

      const handler = findHandler(searchRouter, 'post', '/reindex');
      await handler(req, res, next);

      expect(reindexAll).toHaveBeenCalledWith(undefined);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Reindex completed',
          tenantId: 'all',
          clauses: { indexed: 5, errors: 0 },
          templates: { indexed: 3, errors: 0 },
        }),
      );
    });

    it('should reject reindex when OpenSearch is disabled', async () => {
      process.env.FEATURE_OPENSEARCH = 'false';

      const { req, res, next } = createMockReqRes({
        body: {},
      });

      const handler = findHandler(searchRouter, 'post', '/reindex');
      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'OPENSEARCH_DISABLED',
        }),
      );
    });

    it('should scope reindex to a single tenant when tenantId is provided', async () => {
      process.env.FEATURE_OPENSEARCH = 'true';

      const { req, res, next } = createMockReqRes({
        body: { tenantId: 'tenant-specific' },
      });

      const handler = findHandler(searchRouter, 'post', '/reindex');
      await handler(req, res, next);

      expect(reindexAll).toHaveBeenCalledWith('tenant-specific');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-specific',
        }),
      );
    });
  });

  // ----- Test 10: Facet aggregation response format -----
  describe('Facet Aggregation Format', () => {
    it('should return facets with key/count structure from OpenSearch aggregations', async () => {
      process.env.FEATURE_OPENSEARCH = 'true';

      mockOpenSearchSearch.mockResolvedValue({
        body: {
          hits: { total: { value: 0 }, hits: [] },
          aggregations: {
            tags: {
              buckets: [
                { key: 'haftung', doc_count: 10 },
                { key: 'mietrecht', doc_count: 7 },
                { key: 'kaufrecht', doc_count: 3 },
              ],
            },
            jurisdiction: {
              buckets: [
                { key: 'DE', doc_count: 15 },
                { key: 'AT', doc_count: 5 },
              ],
            },
            legalArea: {
              buckets: [
                { key: 'Vertragsrecht', doc_count: 12 },
                { key: 'Arbeitsrecht', doc_count: 8 },
              ],
            },
          },
        },
      });

      const { req, res, next } = createMockReqRes({ query: {} });

      const handler = findHandler(searchRouter, 'get', '/clauses');
      await handler(req, res, next);

      const result = res.json.mock.calls[0][0];
      expect(result.facets).toEqual({
        tags: [
          { key: 'haftung', count: 10 },
          { key: 'mietrecht', count: 7 },
          { key: 'kaufrecht', count: 3 },
        ],
        jurisdiction: [
          { key: 'DE', count: 15 },
          { key: 'AT', count: 5 },
        ],
        legalArea: [
          { key: 'Vertragsrecht', count: 12 },
          { key: 'Arbeitsrecht', count: 8 },
        ],
      });
    });

    it('should return empty facets arrays when no aggregations are present', async () => {
      process.env.FEATURE_OPENSEARCH = 'true';

      mockOpenSearchSearch.mockResolvedValue({
        body: {
          hits: { total: { value: 0 }, hits: [] },
          aggregations: undefined,
        },
      });

      const { req, res, next } = createMockReqRes({ query: {} });

      const handler = findHandler(searchRouter, 'get', '/clauses');
      await handler(req, res, next);

      const result = res.json.mock.calls[0][0];
      expect(result.facets).toEqual({
        tags: [],
        jurisdiction: [],
        legalArea: [],
      });
    });
  });

  // ----- Test 11: Input validation -----
  describe('Input Validation', () => {
    it('should reject suggest request without q parameter', async () => {
      const { req, res, next } = createMockReqRes({
        query: { type: 'clause' },
      });

      const handler = findHandler(searchRouter, 'get', '/suggest');
      await handler(req, res, next);

      // Should pass ZodError to next()
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          issues: expect.arrayContaining([
            expect.objectContaining({ path: ['q'] }),
          ]),
        }),
      );
    });
  });

  // ----- Test 12: Pagination defaults -----
  describe('Pagination', () => {
    it('should use default page=1 and pageSize=20 when not specified', async () => {
      process.env.FEATURE_OPENSEARCH = 'false';

      mockClauseFindMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockClauseCount.mockResolvedValue(0);

      const { req, res, next } = createMockReqRes({ query: {} });

      const handler = findHandler(searchRouter, 'get', '/clauses');
      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          pageSize: 20,
        }),
      );
    });
  });
});
