/**
 * Result Cache & Cache Key Tests — Sprint 13 (Team 05)
 *
 * Unit tests for:
 * - Deterministic cache key computation (cache-key.ts)
 * - Result cache S3 hit/miss/TTL scenarios (result-cache.ts)
 *
 * Tests cover:
 * 1. Cache key determinism (same inputs → same hash)
 * 2. Cache key order-independence (sorted arrays/objects)
 * 3. Cache key uniqueness (different inputs → different hash)
 * 4. Cache key with optional fields
 * 5. Cache hit scenario (mock S3 head + get)
 * 6. Cache miss scenario (S3 NotFound)
 * 7. Cache TTL expiry
 * 8. Cache store operation
 * 9. Cache lookup error handling
 * 10. Cache with empty answers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeCacheKey, type CacheKeyInput } from '../cache/cache-key';
import { ResultCache, type ResultCacheConfig } from '../cache/result-cache';

// Mock logger to suppress output in tests
vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Cache Key Tests ─────────────────────────────────────────────────

describe('computeCacheKey', () => {
  const baseInput: CacheKeyInput = {
    contractInstanceId: 'contract-001',
    clauseVersionIds: ['cv-aaa', 'cv-bbb', 'cv-ccc'],
    answers: { kaufpreis: 50000, gerichtsort: 'Berlin', haftungsbeschraenkung: false },
    styleTemplateId: 'style-001',
    format: 'docx',
  };

  it('should produce a deterministic hash for the same input', () => {
    const hash1 = computeCacheKey(baseInput);
    const hash2 = computeCacheKey(baseInput);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it('should produce the same hash regardless of clauseVersionIds order', () => {
    const inputA: CacheKeyInput = {
      ...baseInput,
      clauseVersionIds: ['cv-ccc', 'cv-aaa', 'cv-bbb'],
    };
    const inputB: CacheKeyInput = {
      ...baseInput,
      clauseVersionIds: ['cv-bbb', 'cv-ccc', 'cv-aaa'],
    };

    const hashA = computeCacheKey(inputA);
    const hashB = computeCacheKey(inputB);

    expect(hashA).toBe(hashB);
  });

  it('should produce the same hash regardless of answers key order', () => {
    const inputA: CacheKeyInput = {
      ...baseInput,
      answers: { gerichtsort: 'Berlin', kaufpreis: 50000, haftungsbeschraenkung: false },
    };
    const inputB: CacheKeyInput = {
      ...baseInput,
      answers: { haftungsbeschraenkung: false, kaufpreis: 50000, gerichtsort: 'Berlin' },
    };

    const hashA = computeCacheKey(inputA);
    const hashB = computeCacheKey(inputB);

    expect(hashA).toBe(hashB);
  });

  it('should produce different hashes for different contractInstanceIds', () => {
    const inputA: CacheKeyInput = { ...baseInput, contractInstanceId: 'contract-001' };
    const inputB: CacheKeyInput = { ...baseInput, contractInstanceId: 'contract-002' };

    expect(computeCacheKey(inputA)).not.toBe(computeCacheKey(inputB));
  });

  it('should produce different hashes for different formats', () => {
    const inputDocx: CacheKeyInput = { ...baseInput, format: 'docx' };
    const inputOdt: CacheKeyInput = { ...baseInput, format: 'odt' };

    expect(computeCacheKey(inputDocx)).not.toBe(computeCacheKey(inputOdt));
  });

  it('should produce different hashes when answers differ', () => {
    const inputA: CacheKeyInput = {
      ...baseInput,
      answers: { kaufpreis: 50000 },
    };
    const inputB: CacheKeyInput = {
      ...baseInput,
      answers: { kaufpreis: 75000 },
    };

    expect(computeCacheKey(inputA)).not.toBe(computeCacheKey(inputB));
  });

  it('should handle missing styleTemplateId (undefined → null in hash)', () => {
    const inputWithStyle: CacheKeyInput = { ...baseInput, styleTemplateId: 'style-001' };
    const inputWithoutStyle: CacheKeyInput = { ...baseInput, styleTemplateId: undefined };

    // Different hashes because styleTemplateId differs
    expect(computeCacheKey(inputWithStyle)).not.toBe(computeCacheKey(inputWithoutStyle));

    // But deterministic when both undefined
    const hash1 = computeCacheKey(inputWithoutStyle);
    const hash2 = computeCacheKey(inputWithoutStyle);
    expect(hash1).toBe(hash2);
  });

  it('should handle empty answers object', () => {
    const input: CacheKeyInput = {
      ...baseInput,
      answers: {},
    };

    const hash = computeCacheKey(input);
    expect(hash).toHaveLength(64);
    expect(hash).not.toBe(computeCacheKey(baseInput)); // different from non-empty answers
  });

  it('should handle empty clauseVersionIds array', () => {
    const input: CacheKeyInput = {
      ...baseInput,
      clauseVersionIds: [],
    };

    const hash = computeCacheKey(input);
    expect(hash).toHaveLength(64);
    expect(hash).not.toBe(computeCacheKey(baseInput));
  });

  it('should handle nested objects in answers deterministically', () => {
    const inputA: CacheKeyInput = {
      ...baseInput,
      answers: {
        nested: { b: 2, a: 1 },
        flat: 'value',
      },
    };
    const inputB: CacheKeyInput = {
      ...baseInput,
      answers: {
        flat: 'value',
        nested: { a: 1, b: 2 },
      },
    };

    expect(computeCacheKey(inputA)).toBe(computeCacheKey(inputB));
  });
});

// ── Result Cache Tests (S3 mock) ────────────────────────────────────

describe('ResultCache', () => {
  let cache: ResultCache;
  let mockS3Send: ReturnType<typeof vi.fn>;

  const cacheInput: CacheKeyInput = {
    contractInstanceId: 'contract-001',
    clauseVersionIds: ['cv-aaa', 'cv-bbb'],
    answers: { kaufpreis: 50000 },
    styleTemplateId: 'style-001',
    format: 'docx',
  };

  beforeEach(() => {
    mockS3Send = vi.fn();

    const mockS3Client = {
      send: mockS3Send,
    } as any;

    cache = new ResultCache({
      s3Client: mockS3Client,
      bucket: 'test-bucket',
      ttlHours: 24,
    });
  });

  it('should return cache hit when S3 object exists and is not expired', async () => {
    const cachedBuffer = Buffer.from('cached-docx-content');
    const cachedAt = new Date().toISOString();

    // HeadObject response (TTL check)
    mockS3Send.mockResolvedValueOnce({
      Metadata: { 'cached-at': cachedAt, 'ttl-hours': '24' },
    });

    // GetObject response (content)
    mockS3Send.mockResolvedValueOnce({
      Body: {
        transformToByteArray: vi.fn().mockResolvedValue(new Uint8Array(cachedBuffer)),
      },
    });

    const result = await cache.lookup(cacheInput);

    expect(result.cacheHit).toBe(true);
    expect(result.buffer).toBeDefined();
    expect(result.buffer!.length).toBe(cachedBuffer.length);
    expect(result.cacheKey).toHaveLength(64);
  });

  it('should return cache miss when S3 object does not exist', async () => {
    // HeadObject throws NotFound
    mockS3Send.mockRejectedValueOnce(
      Object.assign(new Error('Not Found'), { name: 'NotFound' }),
    );

    const result = await cache.lookup(cacheInput);

    expect(result.cacheHit).toBe(false);
    expect(result.buffer).toBeUndefined();
    expect(result.cacheKey).toHaveLength(64);
  });

  it('should return cache miss when S3 object is expired (TTL exceeded)', async () => {
    // Cached 25 hours ago with 24h TTL
    const cachedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

    mockS3Send.mockResolvedValueOnce({
      Metadata: { 'cached-at': cachedAt, 'ttl-hours': '24' },
    });

    const result = await cache.lookup(cacheInput);

    expect(result.cacheHit).toBe(false);
    expect(result.buffer).toBeUndefined();
    // GetObject should NOT have been called (expired → early return)
    expect(mockS3Send).toHaveBeenCalledTimes(1);
  });

  it('should store result in S3 with correct metadata', async () => {
    mockS3Send.mockResolvedValueOnce({}); // PutObject

    const cacheKey = computeCacheKey(cacheInput);
    const buffer = Buffer.from('rendered-docx-output');

    await cache.store(cacheKey, 'docx', buffer);

    expect(mockS3Send).toHaveBeenCalledTimes(1);

    // Verify the PutObjectCommand was called with correct params
    const putCommand = mockS3Send.mock.calls[0][0];
    expect(putCommand.input.Bucket).toBe('test-bucket');
    expect(putCommand.input.Key).toContain(cacheKey);
    expect(putCommand.input.Key).toContain('.docx');
    expect(putCommand.input.Body).toEqual(buffer);
    expect(putCommand.input.Metadata['cached-at']).toBeDefined();
    expect(putCommand.input.Metadata['ttl-hours']).toBe('24');
  });

  it('should not throw when store fails (graceful degradation)', async () => {
    mockS3Send.mockRejectedValueOnce(new Error('S3 write failed'));

    const cacheKey = computeCacheKey(cacheInput);
    const buffer = Buffer.from('rendered-docx-output');

    // Should not throw
    await expect(cache.store(cacheKey, 'docx', buffer)).resolves.toBeUndefined();
  });

  it('should return cache miss when S3 body is empty', async () => {
    const cachedAt = new Date().toISOString();

    mockS3Send.mockResolvedValueOnce({
      Metadata: { 'cached-at': cachedAt },
    });

    mockS3Send.mockResolvedValueOnce({
      Body: {
        transformToByteArray: vi.fn().mockResolvedValue(new Uint8Array(0)),
      },
    });

    const result = await cache.lookup(cacheInput);

    expect(result.cacheHit).toBe(false);
  });

  it('should handle S3 errors gracefully during lookup', async () => {
    mockS3Send.mockRejectedValueOnce(new Error('Network timeout'));

    const result = await cache.lookup(cacheInput);

    expect(result.cacheHit).toBe(false);
    expect(result.buffer).toBeUndefined();
  });

  it('should generate correct cache path format', () => {
    const cacheKey = 'abc123def456';
    const path = cache.getCachePath(cacheKey, 'docx');

    expect(path).toBe('exports/cache/abc123def456.docx');
  });

  it('should generate correct cache path for ODT format', () => {
    const cacheKey = 'abc123def456';
    const path = cache.getCachePath(cacheKey, 'odt');

    expect(path).toBe('exports/cache/abc123def456.odt');
  });

  it('should treat missing cached-at metadata as valid (no TTL check)', async () => {
    const cachedBuffer = Buffer.from('cached-content');

    // HeadObject with no metadata
    mockS3Send.mockResolvedValueOnce({
      Metadata: {},
    });

    // GetObject
    mockS3Send.mockResolvedValueOnce({
      Body: {
        transformToByteArray: vi.fn().mockResolvedValue(new Uint8Array(cachedBuffer)),
      },
    });

    const result = await cache.lookup(cacheInput);

    // Without cached-at metadata, TTL check is skipped → treated as hit
    expect(result.cacheHit).toBe(true);
    expect(result.buffer).toBeDefined();
  });

  it('should copy cached result to export path via copyToResultPath', async () => {
    mockS3Send.mockResolvedValueOnce({}); // CopyObject

    const cacheKey = computeCacheKey(cacheInput);

    await cache.copyToResultPath(cacheKey, 'docx', 'tenant-001/exports/job-123.docx');

    expect(mockS3Send).toHaveBeenCalledTimes(1);
    const copyCommand = mockS3Send.mock.calls[0][0];
    expect(copyCommand.input.Key).toBe('tenant-001/exports/job-123.docx');
    expect(copyCommand.input.CopySource).toContain(cacheKey);
  });

  it('should throw when copyToResultPath fails', async () => {
    mockS3Send.mockRejectedValueOnce(new Error('Copy failed'));

    const cacheKey = computeCacheKey(cacheInput);

    await expect(
      cache.copyToResultPath(cacheKey, 'docx', 'tenant-001/exports/job-123.docx'),
    ).rejects.toThrow('Copy failed');
  });
});
