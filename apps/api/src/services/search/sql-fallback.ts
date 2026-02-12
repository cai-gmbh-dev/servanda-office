/**
 * SQL Fallback Search Service — Sprint 13 (Team 03)
 *
 * Provides Prisma-based search when OpenSearch is disabled or unavailable.
 * Uses `contains`/`startsWith` for text search and direct filtering for facets.
 * This is the degraded-mode fallback behind the FEATURE_OPENSEARCH flag.
 */

import { Prisma } from '@prisma/client';
import { prisma, setTenantContext } from '../../shared/db';


// ============================================================
// Shared types
// ============================================================

export interface SearchParams {
  q?: string;
  tags?: string[];
  jurisdiction?: string;
  legalArea?: string;
  status?: string;
  page: number;
  pageSize: number;
  tenantId: string;
}

export interface FacetBucket {
  key: string;
  count: number;
}

export interface SearchResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  facets: {
    tags: FacetBucket[];
    jurisdiction: FacetBucket[];
    legalArea: FacetBucket[];
  };
}

export interface SuggestResult {
  suggestions: string[];
}

// ============================================================
// Clause Search (SQL fallback)
// ============================================================

export async function searchClausesSql(params: SearchParams): Promise<SearchResult<Record<string, unknown>>> {
  const { q, tags, jurisdiction, legalArea, status, page, pageSize, tenantId } = params;
  const skip = (page - 1) * pageSize;

  return prisma.$transaction(async (tx) => {
    await setTenantContext(tx, tenantId);

    const where: Prisma.ClauseWhereInput = {
      tenantId,
    };

    // Full-text search on title (Prisma contains, case-insensitive)
    if (q) {
      where.title = { contains: q, mode: 'insensitive' };
    }

    // Tag filtering: all specified tags must be present
    if (tags && tags.length > 0) {
      where.tags = { hasEvery: tags };
    }

    if (jurisdiction) {
      where.jurisdiction = jurisdiction;
    }

    if (legalArea) {
      where.legalArea = legalArea;
    }

    // Status filter: check latest version's status via relation
    if (status) {
      where.versions = { some: { status } };
    }

    const [data, total] = await Promise.all([
      tx.clause.findMany({
        where,
        include: {
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1,
            select: {
              id: true,
              versionNumber: true,
              status: true,
              content: true,
              authorId: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: pageSize,
      }),
      tx.clause.count({ where }),
    ]);

    // Build facets from the full result set (not just the page)
    const allClauses = await tx.clause.findMany({
      where: { tenantId },
      select: { tags: true, jurisdiction: true, legalArea: true },
    });

    const facets = buildClauseFacets(allClauses);

    return {
      data: data.map((c) => {
        const latestVersion = c.versions[0];
        return {
          id: c.id,
          tenantId: c.tenantId,
          title: c.title,
          tags: c.tags,
          jurisdiction: c.jurisdiction,
          legalArea: c.legalArea,
          status: latestVersion?.status ?? 'draft',
          versionNumber: latestVersion?.versionNumber ?? 0,
          content: latestVersion?.content ?? '',
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        };
      }),
      total,
      page,
      pageSize,
      facets,
    };
  });
}

// ============================================================
// Template Search (SQL fallback)
// ============================================================

export async function searchTemplatesSql(params: SearchParams): Promise<SearchResult<Record<string, unknown>>> {
  const { q, tags, jurisdiction, legalArea, status, page, pageSize, tenantId } = params;
  const skip = (page - 1) * pageSize;

  return prisma.$transaction(async (tx) => {
    await setTenantContext(tx, tenantId);

    const where: Prisma.TemplateWhereInput = {
      tenantId,
    };

    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (tags && tags.length > 0) {
      where.tags = { hasEvery: tags };
    }

    if (jurisdiction) {
      where.jurisdiction = jurisdiction;
    }

    if (legalArea) {
      where.legalArea = legalArea;
    }

    if (status) {
      where.versions = { some: { status } };
    }

    const [data, total] = await Promise.all([
      tx.template.findMany({
        where,
        include: {
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1,
            select: {
              id: true,
              versionNumber: true,
              status: true,
              authorId: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: pageSize,
      }),
      tx.template.count({ where }),
    ]);

    // Build facets from the full result set
    const allTemplates = await tx.template.findMany({
      where: { tenantId },
      select: { tags: true, jurisdiction: true, legalArea: true },
    });

    const facets = buildTemplateFacets(allTemplates);

    return {
      data: data.map((t) => {
        const latestVersion = t.versions[0];
        return {
          id: t.id,
          tenantId: t.tenantId,
          title: t.title,
          description: t.description,
          category: t.category,
          tags: t.tags,
          jurisdiction: t.jurisdiction,
          legalArea: t.legalArea,
          status: latestVersion?.status ?? 'draft',
          versionNumber: latestVersion?.versionNumber ?? 0,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        };
      }),
      total,
      page,
      pageSize,
      facets,
    };
  });
}

// ============================================================
// Autocomplete suggestions (SQL fallback)
// ============================================================

export async function suggestSql(
  q: string,
  type: 'clause' | 'template',
  tenantId: string,
): Promise<SuggestResult> {
  const limit = 10;

  if (type === 'clause') {
    const clauses = await prisma.clause.findMany({
      where: {
        tenantId,
        title: { startsWith: q, mode: 'insensitive' },
      },
      select: { title: true },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    });
    return { suggestions: clauses.map((c) => c.title) };
  }

  const templates = await prisma.template.findMany({
    where: {
      tenantId,
      title: { startsWith: q, mode: 'insensitive' },
    },
    select: { title: true },
    take: limit,
    orderBy: { updatedAt: 'desc' },
  });
  return { suggestions: templates.map((t) => t.title) };
}

// ============================================================
// Facet builders
// ============================================================

function buildClauseFacets(
  clauses: { tags: string[]; jurisdiction: string; legalArea: string | null }[],
): SearchResult<unknown>['facets'] {
  const tagCounts = new Map<string, number>();
  const jurisdictionCounts = new Map<string, number>();
  const legalAreaCounts = new Map<string, number>();

  for (const c of clauses) {
    for (const tag of c.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
    jurisdictionCounts.set(c.jurisdiction, (jurisdictionCounts.get(c.jurisdiction) ?? 0) + 1);
    if (c.legalArea) {
      legalAreaCounts.set(c.legalArea, (legalAreaCounts.get(c.legalArea) ?? 0) + 1);
    }
  }

  return {
    tags: mapToFacetBuckets(tagCounts),
    jurisdiction: mapToFacetBuckets(jurisdictionCounts),
    legalArea: mapToFacetBuckets(legalAreaCounts),
  };
}

function buildTemplateFacets(
  templates: { tags: string[]; jurisdiction: string; legalArea: string | null }[],
): SearchResult<unknown>['facets'] {
  const tagCounts = new Map<string, number>();
  const jurisdictionCounts = new Map<string, number>();
  const legalAreaCounts = new Map<string, number>();

  for (const t of templates) {
    for (const tag of t.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
    jurisdictionCounts.set(t.jurisdiction, (jurisdictionCounts.get(t.jurisdiction) ?? 0) + 1);
    if (t.legalArea) {
      legalAreaCounts.set(t.legalArea, (legalAreaCounts.get(t.legalArea) ?? 0) + 1);
    }
  }

  return {
    tags: mapToFacetBuckets(tagCounts),
    jurisdiction: mapToFacetBuckets(jurisdictionCounts),
    legalArea: mapToFacetBuckets(legalAreaCounts),
  };
}

function mapToFacetBuckets(map: Map<string, number>): FacetBucket[] {
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}
