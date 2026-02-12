/**
 * Search API Routes — Sprint 13 (Team 03)
 *
 * Full-text search for clauses and templates with faceted filtering.
 * Operates behind FEATURE_OPENSEARCH feature flag:
 * - true  → Delegates to OpenSearch (german_legal analyzer, completion suggester)
 * - false → Falls back to SQL-based search via Prisma contains/startsWith
 *
 * Endpoints:
 * - GET  /clauses   — Search clauses (full-text + facets)
 * - GET  /templates — Search templates (full-text + facets)
 * - GET  /suggest   — Autocomplete suggestions
 * - POST /reindex   — Trigger full reindex (admin only)
 */

import { Router } from 'express';
import { z } from 'zod';
import { getTenantContext } from '../../middleware/tenant-context';
import { requireRole } from '../../middleware/auth';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@servanda/shared';
import { logger } from '../../shared/logger';

// OpenSearch services
import { getSearchClient } from '../../services/search/search-client';
import { INDEX_NAMES } from '../../services/search/index-mappings';
import { reindexAll } from '../../services/search/indexing-service';

// SQL fallback services
import {
  searchClausesSql,
  searchTemplatesSql,
  suggestSql,
  type SearchParams,
  type SearchResult,
  type SuggestResult,
} from '../../services/search/sql-fallback';

export const searchRouter = Router();

// ============================================================
// Feature flag check
// ============================================================

function isOpenSearchEnabled(): boolean {
  return process.env.FEATURE_OPENSEARCH === 'true';
}

// ============================================================
// Query validation schemas
// ============================================================

const searchQuerySchema = z.object({
  q: z.string().optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  jurisdiction: z.string().optional(),
  legalArea: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

const suggestQuerySchema = z.object({
  q: z.string().min(1),
  type: z.enum(['clause', 'template']).default('clause'),
});

// ============================================================
// GET /clauses — Search clauses
// ============================================================

searchRouter.get('/clauses', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const query = searchQuerySchema.parse(req.query);

    // Normalize tags to array
    const tags = query.tags
      ? Array.isArray(query.tags) ? query.tags : [query.tags]
      : undefined;

    const params: SearchParams = {
      q: query.q,
      tags,
      jurisdiction: query.jurisdiction,
      legalArea: query.legalArea,
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
      tenantId: ctx.tenantId,
    };

    let result: SearchResult<Record<string, unknown>>;

    if (isOpenSearchEnabled()) {
      result = await searchClausesOpenSearch(params);
    } else {
      result = await searchClausesSql(params);
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /templates — Search templates
// ============================================================

searchRouter.get('/templates', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const query = searchQuerySchema.parse(req.query);

    const tags = query.tags
      ? Array.isArray(query.tags) ? query.tags : [query.tags]
      : undefined;

    const params: SearchParams = {
      q: query.q,
      tags,
      jurisdiction: query.jurisdiction,
      legalArea: query.legalArea,
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
      tenantId: ctx.tenantId,
    };

    let result: SearchResult<Record<string, unknown>>;

    if (isOpenSearchEnabled()) {
      result = await searchTemplatesOpenSearch(params);
    } else {
      result = await searchTemplatesSql(params);
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /suggest — Autocomplete suggestions
// ============================================================

searchRouter.get('/suggest', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const query = suggestQuerySchema.parse(req.query);

    let result: SuggestResult;

    if (isOpenSearchEnabled()) {
      result = await suggestOpenSearch(query.q, query.type, ctx.tenantId);
    } else {
      result = await suggestSql(query.q, query.type, ctx.tenantId);
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /reindex — Full reindex (admin only)
// ============================================================

searchRouter.post('/reindex', requireRole('admin'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);

    if (!isOpenSearchEnabled()) {
      res.status(400).json({
        code: 'OPENSEARCH_DISABLED',
        message: 'OpenSearch is not enabled. Set FEATURE_OPENSEARCH=true to use reindex.',
      });
      return;
    }

    // Optional: scope reindex to a single tenant
    const tenantScope = req.body?.tenantId as string | undefined;

    logger.info(
      { tenantId: tenantScope ?? 'all', requestedBy: ctx.userId },
      'Reindex requested',
    );

    const result = await reindexAll(tenantScope);

    res.json({
      message: 'Reindex completed',
      tenantId: tenantScope ?? 'all',
      clauses: result.clauses,
      templates: result.templates,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// OpenSearch search implementations
// ============================================================

async function searchClausesOpenSearch(params: SearchParams): Promise<SearchResult<Record<string, unknown>>> {
  const client = getSearchClient();
  const { q, tags, jurisdiction, legalArea, status, page, pageSize, tenantId } = params;
  const from = (page - 1) * pageSize;

  // Build bool query
  const must: Record<string, unknown>[] = [];
  const filter: Record<string, unknown>[] = [
    { term: { tenantId } },
  ];

  if (q) {
    must.push({
      multi_match: {
        query: q,
        fields: ['title^3', 'content'],
        type: 'best_fields',
        fuzziness: 'AUTO',
      },
    });
  }

  if (tags && tags.length > 0) {
    for (const tag of tags) {
      filter.push({ term: { tags: tag } });
    }
  }

  if (jurisdiction) {
    filter.push({ term: { jurisdiction } });
  }

  if (legalArea) {
    filter.push({ term: { legalArea } });
  }

  if (status) {
    filter.push({ term: { status } });
  }

  const body: Record<string, unknown> = {
    from,
    size: pageSize,
    query: {
      bool: {
        must: must.length > 0 ? must : [{ match_all: {} }],
        filter,
      },
    },
    aggs: {
      tags: { terms: { field: 'tags', size: 50 } },
      jurisdiction: { terms: { field: 'jurisdiction', size: 50 } },
      legalArea: { terms: { field: 'legalArea', size: 50 } },
    },
    sort: q
      ? [{ _score: { order: 'desc' } }, { updatedAt: { order: 'desc' } }]
      : [{ updatedAt: { order: 'desc' } }],
  };

  const { body: response } = await client.search({
    index: INDEX_NAMES.clauses,
    body,
  });

  const hits = response.hits.hits.map((hit: { _source: Record<string, unknown> }) => hit._source);
  const total = typeof response.hits.total === 'number'
    ? response.hits.total
    : response.hits.total.value;

  const facets = extractFacets(response.aggregations);

  return {
    data: hits,
    total,
    page,
    pageSize,
    facets,
  };
}

async function searchTemplatesOpenSearch(params: SearchParams): Promise<SearchResult<Record<string, unknown>>> {
  const client = getSearchClient();
  const { q, tags, jurisdiction, legalArea, status, page, pageSize, tenantId } = params;
  const from = (page - 1) * pageSize;

  const must: Record<string, unknown>[] = [];
  const filter: Record<string, unknown>[] = [
    { term: { tenantId } },
  ];

  if (q) {
    must.push({
      multi_match: {
        query: q,
        fields: ['title^3', 'description^2'],
        type: 'best_fields',
        fuzziness: 'AUTO',
      },
    });
  }

  if (tags && tags.length > 0) {
    for (const tag of tags) {
      filter.push({ term: { tags: tag } });
    }
  }

  if (jurisdiction) {
    filter.push({ term: { jurisdiction } });
  }

  if (legalArea) {
    filter.push({ term: { legalArea } });
  }

  if (status) {
    filter.push({ term: { status } });
  }

  const body: Record<string, unknown> = {
    from,
    size: pageSize,
    query: {
      bool: {
        must: must.length > 0 ? must : [{ match_all: {} }],
        filter,
      },
    },
    aggs: {
      tags: { terms: { field: 'tags', size: 50 } },
      jurisdiction: { terms: { field: 'jurisdiction', size: 50 } },
      legalArea: { terms: { field: 'legalArea', size: 50 } },
    },
    sort: q
      ? [{ _score: { order: 'desc' } }, { updatedAt: { order: 'desc' } }]
      : [{ updatedAt: { order: 'desc' } }],
  };

  const { body: response } = await client.search({
    index: INDEX_NAMES.templates,
    body,
  });

  const hits = response.hits.hits.map((hit: { _source: Record<string, unknown> }) => hit._source);
  const total = typeof response.hits.total === 'number'
    ? response.hits.total
    : response.hits.total.value;

  const facets = extractFacets(response.aggregations);

  return {
    data: hits,
    total,
    page,
    pageSize,
    facets,
  };
}

async function suggestOpenSearch(
  q: string,
  type: 'clause' | 'template',
  tenantId: string,
): Promise<SuggestResult> {
  const client = getSearchClient();
  const indexName = type === 'clause' ? INDEX_NAMES.clauses : INDEX_NAMES.templates;

  const { body: response } = await client.search({
    index: indexName,
    body: {
      size: 0,
      suggest: {
        title_suggest: {
          prefix: q,
          completion: {
            field: 'title.suggest',
            size: 10,
            fuzzy: {
              fuzziness: 'AUTO',
            },
            contexts: {
              tenantId: [tenantId],
            },
          },
        },
      },
      // Fallback: also do a prefix query in case completion suggester has no context mapping
      query: {
        bool: {
          must: [
            { prefix: { 'title.keyword': { value: q, case_insensitive: true } } },
          ],
          filter: [
            { term: { tenantId } },
          ],
        },
      },
      _source: ['title'],
    },
  });

  // Try completion suggester first
  const suggestOptions = response.suggest?.title_suggest?.[0]?.options ?? [];
  if (suggestOptions.length > 0) {
    return {
      suggestions: suggestOptions.map((opt: { text: string }) => opt.text),
    };
  }

  // Fallback to prefix query hits
  const hits = response.hits?.hits ?? [];
  return {
    suggestions: hits
      .map((hit: { _source: { title: string } }) => hit._source.title)
      .slice(0, 10),
  };
}

// ============================================================
// Helpers
// ============================================================

interface AggBucket {
  key: string;
  doc_count: number;
}

function extractFacets(
  aggregations: Record<string, { buckets: AggBucket[] }> | undefined,
): SearchResult<unknown>['facets'] {
  if (!aggregations) {
    return { tags: [], jurisdiction: [], legalArea: [] };
  }

  return {
    tags: (aggregations.tags?.buckets ?? []).map((b) => ({
      key: b.key,
      count: b.doc_count,
    })),
    jurisdiction: (aggregations.jurisdiction?.buckets ?? []).map((b) => ({
      key: b.key,
      count: b.doc_count,
    })),
    legalArea: (aggregations.legalArea?.buckets ?? []).map((b) => ({
      key: b.key,
      count: b.doc_count,
    })),
  };
}
