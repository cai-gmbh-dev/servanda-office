import { PrismaClient } from '@prisma/client';
import { logger } from '../logger';
import { renderDocx } from '../renderers/docx-renderer';
import { convertToOdt } from '../renderers/odt-converter';
import { uploadToStorage } from '../storage/s3-client';
import { loadExportData } from '../data/data-loader';

const prisma = new PrismaClient();

interface ExportJobData {
  exportJobId: string;
  tenantId: string;
  contractInstanceId: string;
  format: 'docx' | 'odt';
  styleTemplateId?: string;
}

/**
 * Main export job handler.
 * Pipeline: Load Data → Render DOCX → (optional: convert ODT) → Upload → Update Job Status
 *
 * Based on: docx-export-spec-v1.md, ADR-003
 */
export async function handleExportJob(data: ExportJobData): Promise<void> {
  const { exportJobId, tenantId, contractInstanceId, format, styleTemplateId } = data;

  // 1. Load contract data (pinned versions, answers, slots)
  logger.info({ exportJobId, contractInstanceId }, 'Loading export data');
  const exportData = await loadExportData(tenantId, contractInstanceId, styleTemplateId);

  // 2. Render DOCX
  logger.info({ exportJobId }, 'Rendering DOCX');
  const docxBuffer = await renderDocx(exportData);

  let finalBuffer: Buffer = docxBuffer;
  let finalFormat = 'docx';

  // 3. Convert to ODT if requested (ADR-004: Beta feature)
  if (format === 'odt') {
    logger.info({ exportJobId }, 'Converting DOCX to ODT (Beta)');
    finalBuffer = await convertToOdt(docxBuffer, exportJobId);
    finalFormat = 'odt';
  }

  // 4. Upload to S3
  const storagePath = `${tenantId}/exports/${exportJobId}.${finalFormat}`;
  logger.info({ exportJobId, storagePath }, 'Uploading to storage');
  await uploadToStorage(storagePath, finalBuffer);

  // 5. Update job status in DB
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
