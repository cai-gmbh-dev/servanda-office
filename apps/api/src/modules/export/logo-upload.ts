/**
 * Logo-Upload Service — Sprint 12 (Team 05)
 *
 * Handles logo file uploads for StyleTemplates.
 * Validates image files (PNG, JPEG, SVG), max 2MB.
 * Uploads to S3 with tenant-scoped path.
 * Returns the S3 URL for storage in StyleTemplate.logoUrl.
 */

import type { Request, Response, NextFunction } from 'express';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { prisma, setTenantContext } from '../../shared/db';
import { getTenantContext } from '../../middleware/tenant-context';
import { auditService } from '../../services/audit.service';
import { NotFoundError, AppError } from '../../middleware/error-handler';
import { logger } from '../../shared/logger';

// --- S3 Configuration ---

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? 'eu-central-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? '',
    secretAccessKey: process.env.S3_SECRET_KEY ?? '',
  },
  forcePathStyle: true, // Required for MinIO
});

const BUCKET = process.env.S3_BUCKET ?? 'servanda-office-dev';

// --- Constants ---

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const MIN_DIMENSION_PX = 50;

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/svg+xml',
]);

const MIME_TO_EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
};

// --- Types ---

export interface LogoFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export interface ValidatedFile extends LogoFile {
  extension: string;
}

// --- PNG/JPEG Dimension Detection (header-based) ---

/**
 * Reads width and height from a PNG file buffer (IHDR chunk).
 * PNG structure: 8-byte signature, then IHDR chunk at offset 16 (width) and 20 (height).
 */
function getPngDimensions(buffer: Buffer): { width: number; height: number } | null {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (buffer.length < 24) return null;
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4E || buffer[3] !== 0x47) {
    return null;
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

/**
 * Reads width and height from a JPEG file buffer (SOF0/SOF2 marker).
 * Scans for SOF markers (0xFF 0xC0 or 0xFF 0xC2) to extract dimensions.
 */
function getJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 4) return null;
  // JPEG signature: FF D8
  if (buffer[0] !== 0xFF || buffer[1] !== 0xD8) return null;

  let offset = 2;
  while (offset < buffer.length - 1) {
    if (buffer[offset] !== 0xFF) {
      offset++;
      continue;
    }

    const marker = buffer[offset + 1];

    // SOF0 (0xC0) or SOF2 (0xC2) — baseline or progressive JPEG
    if (marker === 0xC0 || marker === 0xC2) {
      if (offset + 9 > buffer.length) return null;
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return { width, height };
    }

    // Skip to next marker
    if (offset + 3 >= buffer.length) return null;
    const segmentLength = buffer.readUInt16BE(offset + 2);
    offset += 2 + segmentLength;
  }

  return null;
}

// --- Validation ---

/**
 * Validates a logo file upload.
 * Checks MIME type, file size, and dimensions (for PNG/JPEG).
 * SVG files skip dimension checks.
 */
export function validateLogoFile(file: LogoFile): ValidatedFile {
  // Check MIME type
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw new AppError(
      400,
      `Invalid file type '${file.mimetype}'. Allowed: PNG, JPEG, SVG.`,
      'VALIDATION_ERROR',
    );
  }

  // Check file size
  if (file.size > MAX_LOGO_SIZE_BYTES) {
    throw new AppError(
      400,
      `File size ${(file.size / (1024 * 1024)).toFixed(1)}MB exceeds maximum of 2MB.`,
      'VALIDATION_ERROR',
    );
  }

  if (file.size === 0) {
    throw new AppError(400, 'File is empty.', 'VALIDATION_ERROR');
  }

  // Check dimensions for raster images (PNG, JPEG)
  if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg') {
    const dims = file.mimetype === 'image/png'
      ? getPngDimensions(file.buffer)
      : getJpegDimensions(file.buffer);

    if (!dims) {
      throw new AppError(
        400,
        'Could not read image dimensions. The file may be corrupted.',
        'VALIDATION_ERROR',
      );
    }

    if (dims.width < MIN_DIMENSION_PX || dims.height < MIN_DIMENSION_PX) {
      throw new AppError(
        400,
        `Image dimensions ${dims.width}x${dims.height}px are below the minimum of ${MIN_DIMENSION_PX}x${MIN_DIMENSION_PX}px.`,
        'VALIDATION_ERROR',
      );
    }
  }

  // SVG: skip dimension check (vector format, scalable)

  const extension = MIME_TO_EXTENSION[file.mimetype] ?? 'bin';
  return { ...file, extension };
}

// --- S3 Operations ---

/**
 * Uploads a validated logo file to S3 with tenant-scoped path.
 * Path format: logos/{tenantId}/{styleTemplateId}/{timestamp}.{ext}
 * Returns the S3 key (relative path within the bucket).
 */
export async function uploadLogo(
  tenantId: string,
  styleTemplateId: string,
  file: ValidatedFile,
): Promise<string> {
  const timestamp = Date.now();
  const key = `logos/${tenantId}/${styleTemplateId}/${timestamp}.${file.extension}`;

  const contentTypeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    svg: 'image/svg+xml',
  };

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: file.buffer,
    ContentType: contentTypeMap[file.extension] ?? file.mimetype,
  }));

  logger.info({ tenantId, styleTemplateId, key }, 'Logo uploaded to S3');
  return key;
}

/**
 * Deletes a logo from S3 by its key/URL.
 */
export async function deleteLogo(logoKey: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: logoKey,
  }));

  logger.info({ key: logoKey }, 'Logo deleted from S3');
}

// --- Route Handler ---

/**
 * Express route handler for POST /branding/style-templates/:id/logo
 *
 * Expects the request body to be raw binary (application/octet-stream)
 * or a JSON body with base64-encoded file data:
 * { "file": "<base64>", "mimetype": "image/png", "filename": "logo.png" }
 *
 * Updates the StyleTemplate.logoUrl in the database.
 */
export async function logoUploadHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ctx = getTenantContext(req);
    const styleTemplateId = req.params.id;

    if (!styleTemplateId) {
      throw new AppError(400, 'Missing style template ID', 'VALIDATION_ERROR');
    }

    // Extract file data from request
    let fileBuffer: Buffer;
    let fileMimetype: string;
    let fileSize: number;

    const contentType = req.headers['content-type'] ?? '';

    if (contentType.startsWith('application/json')) {
      // JSON body with base64-encoded file
      const body = req.body as { file?: string; mimetype?: string };
      if (!body.file || !body.mimetype) {
        throw new AppError(400, 'Missing file or mimetype in request body', 'VALIDATION_ERROR');
      }
      fileBuffer = Buffer.from(body.file, 'base64');
      fileMimetype = body.mimetype;
      fileSize = fileBuffer.length;
    } else {
      // Raw binary body (application/octet-stream or multipart)
      if (!Buffer.isBuffer(req.body)) {
        throw new AppError(400, 'Request body must be a file buffer or JSON with base64 file', 'VALIDATION_ERROR');
      }
      fileBuffer = req.body;
      fileMimetype = contentType.split(';')[0]?.trim() || 'application/octet-stream';
      fileSize = fileBuffer.length;
    }

    // Validate file
    const validatedFile = validateLogoFile({
      buffer: fileBuffer,
      mimetype: fileMimetype,
      size: fileSize,
    });

    // Verify StyleTemplate exists and belongs to tenant
    const template = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);
      return tx.styleTemplate.findFirst({
        where: { id: styleTemplateId, tenantId: ctx.tenantId },
      });
    });

    if (!template) {
      throw new NotFoundError('StyleTemplate', styleTemplateId);
    }

    // Delete old logo if present
    if (template.logoUrl) {
      try {
        await deleteLogo(template.logoUrl);
      } catch (err) {
        logger.warn({ err, oldLogoUrl: template.logoUrl }, 'Failed to delete old logo from S3');
      }
    }

    // Upload new logo
    const logoKey = await uploadLogo(ctx.tenantId, styleTemplateId, validatedFile);

    // Update StyleTemplate with new logo URL
    const updated = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);
      return tx.styleTemplate.update({
        where: { id: styleTemplateId },
        data: { logoUrl: logoKey },
      });
    });

    await auditService.log(ctx, {
      action: 'branding.logo.upload',
      objectType: 'style_template',
      objectId: styleTemplateId,
      details: {
        logoKey,
        mimetype: fileMimetype,
        sizeBytes: fileSize,
      },
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });

    res.json({
      id: updated.id,
      logoUrl: logoKey,
      message: 'Logo uploaded successfully',
    });
  } catch (err) {
    next(err);
  }
}
