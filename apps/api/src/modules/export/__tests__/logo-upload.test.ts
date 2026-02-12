/**
 * Logo-Upload Service Tests — Sprint 12 (Team 05)
 *
 * Tests file validation, S3 upload path generation, and S3 deletion.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock S3 Client ---
const { mockS3Send } = vi.hoisted(() => {
  const mockS3Send = vi.fn().mockResolvedValue({});
  return { mockS3Send };
});

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    send: mockS3Send,
  })),
  PutObjectCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: 'PutObject' })),
  DeleteObjectCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: 'DeleteObject' })),
}));

vi.mock('../../../shared/db', () => {
  const mockTx = {
    styleTemplate: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };
  return {
    prisma: {
      $transaction: vi.fn((fn: any) => fn(mockTx)),
    },
    setTenantContext: vi.fn(),
    __mockTx: mockTx,
  };
});

vi.mock('../../../middleware/tenant-context', () => ({
  getTenantContext: vi.fn().mockReturnValue({
    tenantId: 'tenant-001',
    userId: 'user-001',
    role: 'admin',
  }),
}));

vi.mock('../../../services/audit.service', () => ({
  auditService: { log: vi.fn() },
}));

vi.mock('../../../shared/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { validateLogoFile, uploadLogo, deleteLogo } from '../logo-upload';
import type { LogoFile, ValidatedFile } from '../logo-upload';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

// --- Helper: Create valid PNG buffer with specific dimensions ---

function createPngBuffer(width: number, height: number): Buffer {
  // Minimal PNG: 8-byte signature + IHDR chunk (25 bytes total minimum)
  const buf = Buffer.alloc(33);

  // PNG Signature
  buf[0] = 0x89;
  buf[1] = 0x50; // P
  buf[2] = 0x4E; // N
  buf[3] = 0x47; // G
  buf[4] = 0x0D;
  buf[5] = 0x0A;
  buf[6] = 0x1A;
  buf[7] = 0x0A;

  // IHDR chunk length (13 bytes)
  buf.writeUInt32BE(13, 8);

  // IHDR chunk type
  buf[12] = 0x49; // I
  buf[13] = 0x48; // H
  buf[14] = 0x44; // D
  buf[15] = 0x52; // R

  // Width and Height (4 bytes each, big-endian)
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);

  // Bit depth, color type, compression, filter, interlace
  buf[24] = 8;  // bit depth
  buf[25] = 2;  // color type (RGB)
  buf[26] = 0;  // compression
  buf[27] = 0;  // filter
  buf[28] = 0;  // interlace

  // CRC (placeholder)
  buf.writeUInt32BE(0x00000000, 29);

  return buf;
}

// --- Helper: Create valid JPEG buffer with specific dimensions ---

function createJpegBuffer(width: number, height: number): Buffer {
  // Minimal JPEG with SOI + SOF0 marker
  const buf = Buffer.alloc(20);

  // SOI marker
  buf[0] = 0xFF;
  buf[1] = 0xD8;

  // SOF0 marker (Start of Frame, baseline)
  buf[2] = 0xFF;
  buf[3] = 0xC0;

  // Segment length (11 bytes)
  buf.writeUInt16BE(11, 4);

  // Sample precision
  buf[6] = 8;

  // Height and Width (2 bytes each, big-endian)
  buf.writeUInt16BE(height, 7);
  buf.writeUInt16BE(width, 9);

  // Number of components
  buf[11] = 3;

  return buf;
}

// --- Tests ---

describe('Logo Upload Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateLogoFile', () => {
    it('should accept a valid PNG file under 2MB', () => {
      const pngBuffer = createPngBuffer(200, 100);
      const file: LogoFile = {
        buffer: pngBuffer,
        mimetype: 'image/png',
        size: pngBuffer.length,
      };

      const result = validateLogoFile(file);
      expect(result.extension).toBe('png');
      expect(result.mimetype).toBe('image/png');
    });

    it('should accept a valid JPEG file', () => {
      const jpegBuffer = createJpegBuffer(100, 100);
      const file: LogoFile = {
        buffer: jpegBuffer,
        mimetype: 'image/jpeg',
        size: jpegBuffer.length,
      };

      const result = validateLogoFile(file);
      expect(result.extension).toBe('jpg');
    });

    it('should accept a valid SVG file (no dimension check)', () => {
      const svgContent = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>';
      const file: LogoFile = {
        buffer: Buffer.from(svgContent),
        mimetype: 'image/svg+xml',
        size: Buffer.byteLength(svgContent),
      };

      const result = validateLogoFile(file);
      expect(result.extension).toBe('svg');
    });

    it('should reject a file exceeding 2MB', () => {
      const pngBuffer = createPngBuffer(200, 200);
      const file: LogoFile = {
        buffer: pngBuffer,
        mimetype: 'image/png',
        size: 5 * 1024 * 1024, // 5 MB
      };

      expect(() => validateLogoFile(file)).toThrow(/exceeds maximum of 2MB/);
    });

    it('should reject a non-image MIME type (e.g. .exe)', () => {
      const file: LogoFile = {
        buffer: Buffer.from('MZ'),
        mimetype: 'application/x-msdownload',
        size: 2,
      };

      expect(() => validateLogoFile(file)).toThrow(/Invalid file type/);
    });

    it('should reject a PNG image below minimum dimensions (50x50)', () => {
      const smallPng = createPngBuffer(30, 30);
      const file: LogoFile = {
        buffer: smallPng,
        mimetype: 'image/png',
        size: smallPng.length,
      };

      expect(() => validateLogoFile(file)).toThrow(/below the minimum/);
    });

    it('should reject an empty file', () => {
      const file: LogoFile = {
        buffer: Buffer.alloc(0),
        mimetype: 'image/png',
        size: 0,
      };

      expect(() => validateLogoFile(file)).toThrow(/empty/);
    });

    it('should reject a JPEG image below minimum dimensions', () => {
      const smallJpeg = createJpegBuffer(40, 80);
      const file: LogoFile = {
        buffer: smallJpeg,
        mimetype: 'image/jpeg',
        size: smallJpeg.length,
      };

      expect(() => validateLogoFile(file)).toThrow(/below the minimum/);
    });
  });

  describe('uploadLogo', () => {
    it('should generate correct S3 path with tenantId scope', async () => {
      const file: ValidatedFile = {
        buffer: createPngBuffer(100, 100),
        mimetype: 'image/png',
        size: 100,
        extension: 'png',
      };

      const key = await uploadLogo('tenant-001', 'style-tpl-001', file);

      // Verify the key structure: logos/{tenantId}/{styleTemplateId}/{timestamp}.{ext}
      expect(key).toMatch(/^logos\/tenant-001\/style-tpl-001\/\d+\.png$/);

      // Verify S3 PutObjectCommand was called
      expect(mockS3Send).toHaveBeenCalledTimes(1);
      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: key,
          ContentType: 'image/png',
        }),
      );
    });

    it('should use correct MIME type for JPEG', async () => {
      const file: ValidatedFile = {
        buffer: createJpegBuffer(100, 100),
        mimetype: 'image/jpeg',
        size: 100,
        extension: 'jpg',
      };

      const key = await uploadLogo('tenant-002', 'style-tpl-002', file);

      expect(key).toMatch(/^logos\/tenant-002\/style-tpl-002\/\d+\.jpg$/);
      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ContentType: 'image/jpeg',
        }),
      );
    });
  });

  describe('deleteLogo', () => {
    it('should call S3 DeleteObjectCommand with correct key', async () => {
      const key = 'logos/tenant-001/style-tpl-001/1234567890.png';

      await deleteLogo(key);

      expect(mockS3Send).toHaveBeenCalledTimes(1);
      expect(DeleteObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: key,
        }),
      );
    });
  });
});
