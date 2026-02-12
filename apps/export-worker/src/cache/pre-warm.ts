/**
 * Pre-Warm Service — Sprint 11 (Team 05)
 *
 * Pre-loads frequently used DOCX templates into the TemplateCache
 * at worker startup. Runs asynchronously so job processing is not blocked.
 *
 * Strategy:
 * 1. Query ExportJob table grouped by templateVersionId, ordered by count DESC
 * 2. Take top-N (configurable via TEMPLATE_CACHE_PREWARM_COUNT, default 10)
 * 3. Load each template buffer from DB/S3 and insert into cache
 *
 * Based on: export performance target <15s E2E P95 for 5-page documents.
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { logger } from '../logger';
import templateCache from './template-cache';

/** Number of templates to pre-warm at startup */
const PREWARM_COUNT = Number(process.env.TEMPLATE_CACHE_PREWARM_COUNT) || 10;

interface TopTemplate {
  templateVersionId: string;
  exportCount: number;
}

/**
 * Pre-warm the template cache with the most frequently exported templates.
 *
 * This function is designed to run at worker startup (fire-and-forget).
 * It does NOT throw — errors are logged and swallowed to avoid blocking
 * the worker from processing jobs.
 *
 * @param prisma - PrismaClient instance (reuse from caller)
 */
export async function preWarmTemplates(prisma: PrismaClient): Promise<void> {
  const startTime = Date.now();
  let loaded = 0;
  let failed = 0;

  try {
    logger.info({ count: PREWARM_COUNT }, 'Pre-warming template cache — starting');

    // 1. Find top-N most exported templates
    const topTemplates = await findTopTemplates(prisma, PREWARM_COUNT);

    if (topTemplates.length === 0) {
      logger.info('Pre-warm: no export history found — skipping');
      return;
    }

    logger.info(
      { found: topTemplates.length },
      'Pre-warm: found top templates by export count',
    );

    // 2. Load each template into cache
    for (const { templateVersionId, exportCount } of topTemplates) {
      try {
        const buffer = await loadTemplateBuffer(prisma, templateVersionId);
        if (buffer) {
          templateCache.set(templateVersionId, buffer);
          loaded++;
          logger.debug(
            { templateVersionId, exportCount, size: buffer.length },
            'Pre-warm: template loaded',
          );
        } else {
          failed++;
          logger.warn(
            { templateVersionId },
            'Pre-warm: template buffer not found — skipping',
          );
        }
      } catch (err) {
        failed++;
        logger.warn(
          { templateVersionId, err },
          'Pre-warm: failed to load template — skipping',
        );
      }
    }
  } catch (err) {
    logger.error({ err }, 'Pre-warm: fatal error — cache will populate on demand');
    return;
  }

  const durationMs = Date.now() - startTime;
  const stats = templateCache.stats();

  logger.info(
    {
      loaded,
      failed,
      durationMs,
      cacheEntries: stats.entryCount,
      cacheSizeBytes: stats.totalSizeBytes,
    },
    'Pre-warming template cache — complete',
  );
}

/**
 * Query the top-N most frequently exported template versions.
 *
 * Uses a raw query because Prisma doesn't support GROUP BY + COUNT + ORDER
 * natively with `groupBy` on related fields in all cases.
 */
async function findTopTemplates(
  prisma: PrismaClient,
  limit: number,
): Promise<TopTemplate[]> {
  const result = await prisma.$queryRaw<
    Array<{ templateVersionId: string; export_count: bigint }>
  >`
    SELECT
      ci.template_version_id AS "templateVersionId",
      COUNT(ej.id) AS export_count
    FROM export_jobs ej
    JOIN contract_instances ci ON ci.id = ej.contract_instance_id
    WHERE ej.status = 'done'
    GROUP BY ci.template_version_id
    ORDER BY export_count DESC
    LIMIT ${limit}
  `;

  return result.map((row) => ({
    templateVersionId: row.templateVersionId,
    exportCount: Number(row.export_count),
  }));
}

/**
 * Load a template buffer from the database.
 *
 * StyleTemplate.templateFile contains a file path to the DOCX template.
 * For templates stored in S3, this would be extended to use s3-client.
 * For now, we load TemplateVersion and resolve its associated default
 * template file from the filesystem or the StyleTemplate record.
 */
async function loadTemplateBuffer(
  prisma: PrismaClient,
  templateVersionId: string,
): Promise<Buffer | null> {
  // Look up the TemplateVersion to find the associated template
  const templateVersion = await prisma.templateVersion.findUnique({
    where: { id: templateVersionId },
    select: { id: true, templateId: true, tenantId: true },
  });

  if (!templateVersion) {
    return null;
  }

  // Check if there is a StyleTemplate associated with this template
  const styleTemplate = await prisma.styleTemplate.findFirst({
    where: { tenantId: templateVersion.tenantId },
    orderBy: { createdAt: 'desc' },
  });

  if (styleTemplate?.templateFile) {
    try {
      return readFileSync(styleTemplate.templateFile);
    } catch {
      logger.debug(
        { templateVersionId, path: styleTemplate.templateFile },
        'Pre-warm: style template file not accessible — trying default',
      );
    }
  }

  // Fallback: load the default template
  try {
    const { resolve } = await import('path');
    const defaultPath = resolve(__dirname, '../../templates/default.docx');
    return readFileSync(defaultPath);
  } catch {
    return null;
  }
}

export { PREWARM_COUNT, findTopTemplates, loadTemplateBuffer };
