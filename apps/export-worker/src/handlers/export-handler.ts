import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { logger } from '../logger';
import { renderDocx } from '../renderers/docx-renderer';
import { convertToOdt } from '../renderers/odt-converter';
import { uploadToStorage } from '../storage/s3-client';
import { loadExportData } from '../data/data-loader';
import templateCache from '../cache/template-cache';

const prisma = new PrismaClient();

const DEFAULT_TEMPLATE_PATH = resolve(__dirname, '../../templates/default.docx');

interface ExportJobData {
  exportJobId: string;
  tenantId: string;
  contractInstanceId: string;
  format: 'docx' | 'odt';
  styleTemplateId?: string;
}

/**
 * Main export job handler.
 * Pipeline: Load Data → Load Template (cached) → Render DOCX → (optional: convert ODT) → Upload → Update Job Status
 *
 * Sprint 11: Template loading now goes through TemplateCache for performance.
 * Cache hit: <1ms template load vs ~200ms uncached.
 *
 * Based on: docx-export-spec-v1.md, ADR-003
 */
export async function handleExportJob(data: ExportJobData): Promise<void> {
  const { exportJobId, tenantId, contractInstanceId, format, styleTemplateId } = data;

  // 1. Load contract data (pinned versions, answers, slots)
  logger.info({ exportJobId, contractInstanceId }, 'Loading export data');
  const exportData = await loadExportData(tenantId, contractInstanceId, styleTemplateId);

  // 2. Load template buffer (cache-first strategy)
  const templateLoadStart = Date.now();
  const templateBuffer = await loadTemplateWithCache(exportData.styleTemplatePath, exportData.templateVersionId);
  const templateLoadMs = Date.now() - templateLoadStart;

  const cacheHit = templateLoadMs < 5; // heuristic: cache hits are sub-ms
  logger.info(
    { exportJobId, templateLoadMs, cacheHit, templateVersionId: exportData.templateVersionId },
    'Template loaded',
  );

  // 3. Render DOCX with pre-loaded template buffer
  logger.info({ exportJobId }, 'Rendering DOCX');
  const docxBuffer = await renderDocx(exportData, templateBuffer);

  let finalBuffer: Buffer = docxBuffer;
  let finalFormat = 'docx';

  // 4. Convert to ODT if requested (ADR-004: Beta feature)
  if (format === 'odt') {
    logger.info({ exportJobId }, 'Converting DOCX to ODT (Beta)');
    finalBuffer = await convertToOdt(docxBuffer, exportJobId);
    finalFormat = 'odt';
  }

  // 5. Upload to S3
  const storagePath = `${tenantId}/exports/${exportJobId}.${finalFormat}`;
  logger.info({ exportJobId, storagePath }, 'Uploading to storage');
  await uploadToStorage(storagePath, finalBuffer);

  // 6. Update job status in DB
  await prisma.exportJob.update({
    where: { id: exportJobId },
    data: {
      status: 'done',
      resultStoragePath: storagePath,
      resultFileSize: finalBuffer.length,
      completedAt: new Date(),
    },
  });

  logger.info({ exportJobId, storagePath, fileSize: finalBuffer.length }, 'Export completed');
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
