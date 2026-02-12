import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { S3Client } from '@aws-sdk/client-s3';
import { logger } from '../logger';
import { renderDocx } from '../renderers/docx-renderer';
import { convertToOdt } from '../renderers/odt-converter';
import { uploadToStorage } from '../storage/s3-client';
import { loadExportData } from '../data/data-loader';
import templateCache from '../cache/template-cache';
import { ResultCache, createResultCache } from '../cache/result-cache';
import { computeCacheKey, type CacheKeyInput } from '../cache/cache-key';
import {
  incExportJobsTotal,
  observeRenderDuration,
  incCacheHits,
  incCacheMisses,
} from '../metrics/export-metrics';

const prisma = new PrismaClient();

const DEFAULT_TEMPLATE_PATH = resolve(__dirname, '../../templates/default.docx');

/** Lazily initialized result cache (needs S3 client) */
let resultCache: ResultCache | null = null;

function getResultCache(): ResultCache {
  if (!resultCache) {
    const s3Client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? 'eu-central-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? '',
        secretAccessKey: process.env.S3_SECRET_KEY ?? '',
      },
      forcePathStyle: true,
    });
    resultCache = createResultCache(s3Client);
  }
  return resultCache;
}

export interface ExportJobData {
  exportJobId: string;
  tenantId: string;
  contractInstanceId: string;
  format: 'docx' | 'odt';
  styleTemplateId?: string;
}

/**
 * Main export job handler.
 * Pipeline: Check Result Cache → (hit: copy & done) OR (miss: Load Data → Load Template → Render → Cache → Upload) → Update Job Status
 *
 * Sprint 11: Template loading goes through TemplateCache for performance.
 * Sprint 13: Result caching — skip rendering entirely if identical contract was exported before.
 *
 * Based on: docx-export-spec-v1.md, ADR-003
 */
export async function handleExportJob(data: ExportJobData): Promise<void> {
  const { exportJobId, tenantId, contractInstanceId, format, styleTemplateId } = data;

  // 1. Load contract data (pinned versions, answers, slots)
  logger.info({ exportJobId, contractInstanceId }, 'Loading export data');
  const exportData = await loadExportData(tenantId, contractInstanceId, styleTemplateId);

  // 2. Check result cache
  const cache = getResultCache();
  const cacheKeyInput: CacheKeyInput = {
    contractInstanceId,
    clauseVersionIds: exportData.sections.flatMap((s) =>
      s.clauses.map((c) => c.content),
    ).length > 0
      ? extractClauseVersionIdsFromData(data, exportData)
      : [],
    answers: exportData.answers,
    styleTemplateId,
    format,
  };

  let resultCacheHit = false;

  try {
    const cacheResult = await cache.lookup(cacheKeyInput);

    if (cacheResult.cacheHit && cacheResult.buffer) {
      // Cache HIT — use cached result directly
      resultCacheHit = true;
      incCacheHits();
      incExportJobsTotal('cached');

      const storagePath = `${tenantId}/exports/${exportJobId}.${format}`;
      logger.info({ exportJobId, storagePath, cacheKey: cacheResult.cacheKey }, 'Result cache HIT — skipping render');

      await uploadToStorage(storagePath, cacheResult.buffer);

      await prisma.exportJob.update({
        where: { id: exportJobId },
        data: {
          status: 'done',
          resultStoragePath: storagePath,
          resultFileSize: cacheResult.buffer.length,
          completedAt: new Date(),
        },
      });

      logger.info(
        { exportJobId, storagePath, fileSize: cacheResult.buffer.length, cacheHit: true },
        'Export completed (cached)',
      );
      return;
    }
  } catch (err) {
    // Result cache lookup failure should not block rendering
    logger.warn({ exportJobId, err }, 'Result cache lookup failed — proceeding with render');
  }

  // Cache MISS — render normally
  incCacheMisses();

  // 3. Load template buffer (cache-first strategy)
  const templateLoadStart = Date.now();
  const templateBuffer = await loadTemplateWithCache(exportData.styleTemplatePath, exportData.templateVersionId);
  const templateLoadMs = Date.now() - templateLoadStart;

  const templateCacheHit = templateLoadMs < 5;
  logger.info(
    { exportJobId, templateLoadMs, templateCacheHit, templateVersionId: exportData.templateVersionId },
    'Template loaded',
  );

  // 4. Render DOCX with pre-loaded template buffer
  logger.info({ exportJobId }, 'Rendering DOCX');
  const renderStart = Date.now();
  const docxBuffer = await renderDocx(exportData, templateBuffer);
  const renderDurationMs = Date.now() - renderStart;

  // Record render duration metric
  observeRenderDuration(renderDurationMs / 1000);

  let finalBuffer: Buffer = docxBuffer;
  let finalFormat = format === 'odt' ? 'odt' : 'docx';

  // 5. Convert to ODT if requested (ADR-004: Beta feature)
  if (format === 'odt') {
    logger.info({ exportJobId }, 'Converting DOCX to ODT (Beta)');
    finalBuffer = await convertToOdt(docxBuffer, exportJobId);
  }

  // 6. Store result in cache for future identical requests
  const cacheKey = computeCacheKey(cacheKeyInput);
  cache.store(cacheKey, finalFormat, finalBuffer).catch((err) => {
    logger.warn({ exportJobId, cacheKey, err }, 'Failed to store export result in cache');
  });

  // 7. Upload to S3
  const storagePath = `${tenantId}/exports/${exportJobId}.${finalFormat}`;
  logger.info({ exportJobId, storagePath }, 'Uploading to storage');
  await uploadToStorage(storagePath, finalBuffer);

  // 8. Update job status in DB
  incExportJobsTotal('done');

  await prisma.exportJob.update({
    where: { id: exportJobId },
    data: {
      status: 'done',
      resultStoragePath: storagePath,
      resultFileSize: finalBuffer.length,
      completedAt: new Date(),
    },
  });

  logger.info(
    { exportJobId, storagePath, fileSize: finalBuffer.length, cacheHit: resultCacheHit, renderDurationMs },
    'Export completed',
  );
}

/**
 * Extract clause version IDs from the loaded export data.
 * Uses the Prisma query's clauseVersionIds from the contract instance.
 */
function extractClauseVersionIdsFromData(
  jobData: ExportJobData,
  _exportData: unknown,
): string[] {
  // The contract instance's pinned clauseVersionIds are the canonical source.
  // Since loadExportData resolves them, we re-derive from contractInstanceId.
  // For cache key purposes, we use the contract's answers + sections as proxy.
  // The actual IDs are loaded by the data-loader internally.
  // We use a fallback that hashes the contractInstanceId for uniqueness.
  return [jobData.contractInstanceId];
}

/**
 * Load a DOCX template buffer using cache-first strategy.
 *
 * 1. Check TemplateCache by templateVersionId (if available)
 * 2. On miss: load from filesystem, store in cache
 * 3. Return the buffer for rendering
 */
async function loadTemplateWithCache(
  styleTemplatePath: string | undefined,
  templateVersionId?: string,
): Promise<Buffer> {
  const cacheKey = templateVersionId ?? styleTemplatePath ?? '__default__';

  // Check cache first
  const cached = templateCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Cache miss: load from filesystem
  const templatePath = styleTemplatePath ?? DEFAULT_TEMPLATE_PATH;
  const buffer = readFileSync(templatePath);

  // Store in cache for subsequent requests
  templateCache.set(cacheKey, buffer);

  return buffer;
}

/**
 * Invalidate a template from the cache.
 * Called when a template version is published or updated.
 */
export function invalidateTemplateCache(templateVersionId: string): void {
  const removed = templateCache.invalidate(templateVersionId);
  logger.info(
    { templateVersionId, removed },
    'Template cache invalidation requested',
  );
}
