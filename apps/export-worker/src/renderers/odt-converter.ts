import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'fs';
import { join, basename } from 'path';
import { tmpdir } from 'os';
import { logger } from '../logger';

const exec = promisify(execFile);

const CONVERSION_TIMEOUT_MS = 60_000; // 60s per ADR-004

/**
 * Converts a DOCX buffer to ODT using LibreOffice headless.
 *
 * Based on: odt-conversion-eval-v1.md, ADR-004
 * - Cold-start mode (MVP): soffice started per conversion
 * - Isolated /tmp directory per job
 * - 60s timeout
 */
export async function convertToOdt(docxBuffer: Buffer, jobId: string): Promise<Buffer> {
  const workDir = join(tmpdir(), `servanda-odt-${jobId}`);
  const inputPath = join(workDir, `${jobId}.docx`);

  try {
    // Create isolated work directory
    mkdirSync(workDir, { recursive: true });
    writeFileSync(inputPath, docxBuffer);

    // Run LibreOffice headless conversion
    await exec('soffice', [
      '--headless',
      '--norestore',
      '--nofirststartwizard',
      '--convert-to', 'odt',
      '--outdir', workDir,
      inputPath,
    ], {
      timeout: CONVERSION_TIMEOUT_MS,
      env: {
        ...process.env,
        HOME: join(tmpdir(), 'libreoffice-home'),
      },
    });

    // Read the converted file
    const odtFileName = basename(inputPath, '.docx') + '.odt';
    const odtPath = join(workDir, odtFileName);
    const odtBuffer = readFileSync(odtPath);

    // Validate output
    if (odtBuffer.length === 0) {
      throw new Error('ODT conversion produced empty file');
    }

    logger.info({ jobId, inputSize: docxBuffer.length, outputSize: odtBuffer.length }, 'ODT conversion successful');
    return odtBuffer;
  } finally {
    // Cleanup temp files
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      logger.warn({ jobId, err: cleanupErr }, 'Failed to cleanup temp directory');
    }
  }
}
