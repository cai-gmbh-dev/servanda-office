/**
 * OpenSearch Indexing Service — Sprint 13 (Team 03)
 *
 * Manages document indexing lifecycle:
 * - indexClause / indexTemplate — Index or update a single document
 * - removeClause / removeTemplate — Delete a document from the index
 * - reindexAll — Full reindex for migration/recovery scenarios
 * - Bulk indexing support for batch operations
 */

import { getSearchClient } from './search-client';
import { INDEX_NAMES } from './index-mappings';
import { prisma } from '../../shared/db';
import { logger } from '../../shared/logger';

// ============================================================
// Types for indexing payloads
// ============================================================

export interface ClauseDocument {
  id: string;
  title: string;
  tags: string[];
  content: string;
  jurisdiction: string;
  legalArea: string | null;
  tenantId: string;
  status: string;
  versionNumber: number;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateDocument {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  tags: string[];
  jurisdiction: string;
  legalArea: string | null;
  tenantId: string;
  status: string;
  versionNumber: number;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// Single-document operations
// ============================================================

/**
 * Index or update a clause document in OpenSearch.
 * Combines clause metadata with the latest version's content.
 */
export async function indexClause(
  clause: {
    id: string;
    tenantId: string;
    title: string;
    tags: string[];
    jurisdiction: string;
    legalArea: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  clauseVersion: {
    content: string;
    status: string;
    versionNumber: number;
    authorId: string;
  },
): Promise<void> {
  const client = getSearchClient();

  const document: ClauseDocument = {
    id: clause.id,
    title: clause.title,
    tags: clause.tags,
    content: clauseVersion.content,
    jurisdiction: clause.jurisdiction,
    legalArea: clause.legalArea,
    tenantId: clause.tenantId,
    status: clauseVersion.status,
    versionNumber: clauseVersion.versionNumber,
    authorId: clauseVersion.authorId,
    createdAt: clause.createdAt.toISOString(),
    updatedAt: clause.updatedAt.toISOString(),
  };

  try {
    await client.index({
      index: INDEX_NAMES.clauses,
      id: clause.id,
      body: document,
      refresh: 'wait_for',
    });
    logger.debug({ clauseId: clause.id }, 'Clause indexed in OpenSearch');
  } catch (err) {
    logger.error({ err, clauseId: clause.id }, 'Failed to index clause in OpenSearch');
    throw err;
  }
}

/**
 * Index or update a template document in OpenSearch.
 * Combines template metadata with the latest version information.
 */
export async function indexTemplate(
  template: {
    id: string;
    tenantId: string;
    title: string;
    description: string | null;
    category: string | null;
    tags: string[];
    jurisdiction: string;
    legalArea: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  templateVersion: {
    status: string;
    versionNumber: number;
    authorId: string;
  },
): Promise<void> {
  const client = getSearchClient();

  const document: TemplateDocument = {
    id: template.id,
    title: template.title,
    description: template.description,
    category: template.category,
    tags: template.tags,
    jurisdiction: template.jurisdiction,
    legalArea: template.legalArea,
    tenantId: template.tenantId,
    status: templateVersion.status,
    versionNumber: templateVersion.versionNumber,
    authorId: templateVersion.authorId,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };

  try {
    await client.index({
      index: INDEX_NAMES.templates,
      id: template.id,
      body: document,
      refresh: 'wait_for',
    });
    logger.debug({ templateId: template.id }, 'Template indexed in OpenSearch');
  } catch (err) {
    logger.error({ err, templateId: template.id }, 'Failed to index template in OpenSearch');
    throw err;
  }
}

// ============================================================
// Deletion operations
// ============================================================

/**
 * Remove a clause document from the OpenSearch index.
 */
export async function removeClause(clauseId: string): Promise<void> {
  const client = getSearchClient();

  try {
    await client.delete({
      index: INDEX_NAMES.clauses,
      id: clauseId,
      refresh: 'wait_for',
    });
    logger.debug({ clauseId }, 'Clause removed from OpenSearch');
  } catch (err: unknown) {
    // Ignore 404 (document already absent)
    if (isOpenSearchError(err) && err.statusCode === 404) {
      logger.debug({ clauseId }, 'Clause not found in OpenSearch (already deleted)');
      return;
    }
    logger.error({ err, clauseId }, 'Failed to remove clause from OpenSearch');
    throw err;
  }
}

/**
 * Remove a template document from the OpenSearch index.
 */
export async function removeTemplate(templateId: string): Promise<void> {
  const client = getSearchClient();

  try {
    await client.delete({
      index: INDEX_NAMES.templates,
      id: templateId,
      refresh: 'wait_for',
    });
    logger.debug({ templateId }, 'Template removed from OpenSearch');
  } catch (err: unknown) {
    if (isOpenSearchError(err) && err.statusCode === 404) {
      logger.debug({ templateId }, 'Template not found in OpenSearch (already deleted)');
      return;
    }
    logger.error({ err, templateId }, 'Failed to remove template from OpenSearch');
    throw err;
  }
}

// ============================================================
// Bulk operations
// ============================================================

/**
 * Bulk index an array of clause documents.
 * Uses OpenSearch bulk API for efficient batch ingestion.
 */
export async function bulkIndexClauses(documents: ClauseDocument[]): Promise<{ indexed: number; errors: number }> {
  if (documents.length === 0) return { indexed: 0, errors: 0 };

  const client = getSearchClient();
  const body: Record<string, unknown>[] = [];

  for (const doc of documents) {
    body.push({ index: { _index: INDEX_NAMES.clauses, _id: doc.id } });
    body.push(doc as unknown as Record<string, unknown>);
  }

  try {
    const { body: result } = await client.bulk({ body, refresh: 'wait_for' });

    let errors = 0;
    if (result.errors) {
      for (const item of result.items) {
        if (item.index?.error) {
          errors++;
          logger.warn({ error: item.index.error, id: item.index._id }, 'Bulk index error for clause');
        }
      }
    }

    const indexed = documents.length - errors;
    logger.info({ indexed, errors, total: documents.length }, 'Bulk indexed clauses');
    return { indexed, errors };
  } catch (err) {
    logger.error({ err, count: documents.length }, 'Failed to bulk index clauses');
    throw err;
  }
}

/**
 * Bulk index an array of template documents.
 * Uses OpenSearch bulk API for efficient batch ingestion.
 */
export async function bulkIndexTemplates(documents: TemplateDocument[]): Promise<{ indexed: number; errors: number }> {
  if (documents.length === 0) return { indexed: 0, errors: 0 };

  const client = getSearchClient();
  const body: Record<string, unknown>[] = [];

  for (const doc of documents) {
    body.push({ index: { _index: INDEX_NAMES.templates, _id: doc.id } });
    body.push(doc as unknown as Record<string, unknown>);
  }

  try {
    const { body: result } = await client.bulk({ body, refresh: 'wait_for' });

    let errors = 0;
    if (result.errors) {
      for (const item of result.items) {
        if (item.index?.error) {
          errors++;
          logger.warn({ error: item.index.error, id: item.index._id }, 'Bulk index error for template');
        }
      }
    }

    const indexed = documents.length - errors;
    logger.info({ indexed, errors, total: documents.length }, 'Bulk indexed templates');
    return { indexed, errors };
  } catch (err) {
    logger.error({ err, count: documents.length }, 'Failed to bulk index templates');
    throw err;
  }
}

// ============================================================
// Full reindex
// ============================================================

const REINDEX_BATCH_SIZE = 100;

/**
 * Full reindex of all clauses and templates from the database.
 * Optionally scoped to a single tenant (for tenant migration/recovery).
 *
 * Reads data from PostgreSQL via Prisma and bulk-indexes into OpenSearch.
 */
export async function reindexAll(tenantId?: string): Promise<{
  clauses: { indexed: number; errors: number };
  templates: { indexed: number; errors: number };
}> {
  logger.info({ tenantId: tenantId ?? 'all' }, 'Starting full reindex');

  const clauseResult = await reindexClauses(tenantId);
  const templateResult = await reindexTemplates(tenantId);

  logger.info(
    { clauses: clauseResult, templates: templateResult },
    'Full reindex completed',
  );

  return { clauses: clauseResult, templates: templateResult };
}

async function reindexClauses(tenantId?: string): Promise<{ indexed: number; errors: number }> {
  const where: Record<string, unknown> = {};
  if (tenantId) where.tenantId = tenantId;

  let totalIndexed = 0;
  let totalErrors = 0;
  let skip = 0;

  while (true) {
    const clauses = await prisma.clause.findMany({
      where,
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' as const },
          take: 1,
        },
      },
      skip,
      take: REINDEX_BATCH_SIZE,
    });

    if (clauses.length === 0) break;

    const documents: ClauseDocument[] = [];
    for (const clause of clauses) {
      const latestVersion = clause.versions[0];
      if (!latestVersion) continue;

      documents.push({
        id: clause.id,
        title: clause.title,
        tags: clause.tags,
        content: latestVersion.content,
        jurisdiction: clause.jurisdiction,
        legalArea: clause.legalArea,
        tenantId: clause.tenantId,
        status: latestVersion.status,
        versionNumber: latestVersion.versionNumber,
        authorId: latestVersion.authorId,
        createdAt: clause.createdAt.toISOString(),
        updatedAt: clause.updatedAt.toISOString(),
      });
    }

    if (documents.length > 0) {
      const result = await bulkIndexClauses(documents);
      totalIndexed += result.indexed;
      totalErrors += result.errors;
    }

    skip += REINDEX_BATCH_SIZE;
    if (clauses.length < REINDEX_BATCH_SIZE) break;
  }

  return { indexed: totalIndexed, errors: totalErrors };
}

async function reindexTemplates(tenantId?: string): Promise<{ indexed: number; errors: number }> {
  const where: Record<string, unknown> = {};
  if (tenantId) where.tenantId = tenantId;

  let totalIndexed = 0;
  let totalErrors = 0;
  let skip = 0;

  while (true) {
    const templates = await prisma.template.findMany({
      where,
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' as const },
          take: 1,
        },
      },
      skip,
      take: REINDEX_BATCH_SIZE,
    });

    if (templates.length === 0) break;

    const documents: TemplateDocument[] = [];
    for (const template of templates) {
      const latestVersion = template.versions[0];
      if (!latestVersion) continue;

      documents.push({
        id: template.id,
        title: template.title,
        description: template.description,
        category: template.category,
        tags: template.tags,
        jurisdiction: template.jurisdiction,
        legalArea: template.legalArea,
        tenantId: template.tenantId,
        status: latestVersion.status,
        versionNumber: latestVersion.versionNumber,
        authorId: latestVersion.authorId,
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
      });
    }

    if (documents.length > 0) {
      const result = await bulkIndexTemplates(documents);
      totalIndexed += result.indexed;
      totalErrors += result.errors;
    }

    skip += REINDEX_BATCH_SIZE;
    if (templates.length < REINDEX_BATCH_SIZE) break;
  }

  return { indexed: totalIndexed, errors: totalErrors };
}

// ============================================================
// Helpers
// ============================================================

function isOpenSearchError(err: unknown): err is { statusCode: number; message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'statusCode' in err &&
    typeof (err as Record<string, unknown>).statusCode === 'number'
  );
}
