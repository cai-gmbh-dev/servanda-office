/**
 * Template Cache & Pre-Warm Tests — Sprint 11 (Team 05)
 *
 * Unit tests for the LRU template cache and pre-warm service.
 * Covers: hit/miss, LRU eviction, TTL expiration, memory limits,
 * stats tracking, and pre-warm top-N loading.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TemplateCache } from '../cache/template-cache';
import type { CacheStats } from '../cache/template-cache';

// Mock logger to suppress output in tests
vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Helper to create a Buffer of a specific size
function makeBuffer(sizeBytes: number, fill = 0x41): Buffer {
  return Buffer.alloc(sizeBytes, fill);
}

describe('TemplateCache', () => {
  let cache: TemplateCache;

  beforeEach(() => {
    cache = new TemplateCache({ maxCapacity: 5, defaultTtlMs: 60_000, memoryLimitBytes: 1024 });
  });

  // ── Basic Hit/Miss ──────────────────────────────────────────────

  describe('Cache Hit/Miss', () => {
    it('should return null on cache miss', () => {
      const result = cache.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should return buffer on cache hit', () => {
      const buf = makeBuffer(64);
      cache.set('template-1', buf);

      const result = cache.get('template-1');
      expect(result).not.toBeNull();
      expect(result).toEqual(buf);
    });

    it('should track hits and misses in stats', () => {
      const buf = makeBuffer(32);
      cache.set('t1', buf);

      // 1 miss
      cache.get('nonexistent');
      // 2 hits
      cache.get('t1');
      cache.get('t1');

      const stats = cache.stats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRatio).toBeCloseTo(2 / 3, 5);
    });

    it('should return 0 hit ratio when no requests made', () => {
      const stats = cache.stats();
      expect(stats.hitRatio).toBe(0);
    });

    it('should handle set then get for multiple templates', () => {
      const buf1 = makeBuffer(16, 0x01);
      const buf2 = makeBuffer(16, 0x02);
      const buf3 = makeBuffer(16, 0x03);

      cache.set('a', buf1);
      cache.set('b', buf2);
      cache.set('c', buf3);

      expect(cache.get('a')).toEqual(buf1);
      expect(cache.get('b')).toEqual(buf2);
      expect(cache.get('c')).toEqual(buf3);
    });
  });

  // ── LRU Eviction ────────────────────────────────────────────────

  describe('LRU Eviction', () => {
    it('should evict least recently used entry when capacity is reached', () => {
      // Capacity is 5
      cache.set('t1', makeBuffer(10));
      cache.set('t2', makeBuffer(10));
      cache.set('t3', makeBuffer(10));
      cache.set('t4', makeBuffer(10));
      cache.set('t5', makeBuffer(10));

      // Access t1 to make it recently used
      cache.get('t1');

      // Adding t6 should evict t2 (oldest non-accessed)
      cache.set('t6', makeBuffer(10));

      expect(cache.get('t1')).not.toBeNull(); // recently used, kept
      expect(cache.get('t2')).toBeNull(); // evicted (LRU)
      expect(cache.get('t6')).not.toBeNull(); // newly added
    });

    it('should evict multiple entries if needed for capacity', () => {
      // Fill to capacity
      for (let i = 0; i < 5; i++) {
        cache.set(`t${i}`, makeBuffer(10));
      }

      const stats = cache.stats();
      expect(stats.entryCount).toBe(5);

      // Add one more — should evict oldest
      cache.set('t-new', makeBuffer(10));
      expect(cache.stats().entryCount).toBe(5);
    });

    it('should update existing entry without increasing count', () => {
      cache.set('t1', makeBuffer(10));
      cache.set('t1', makeBuffer(20));

      expect(cache.stats().entryCount).toBe(1);
      expect(cache.stats().totalSizeBytes).toBe(20);
    });
  });

  // ── TTL Expiration ──────────────────────────────────────────────

  describe('TTL Expiration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return null for expired entries', () => {
      cache.set('t1', makeBuffer(32), 100); // 100ms TTL

      // Before expiry
      expect(cache.get('t1')).not.toBeNull();

      // After expiry
      vi.advanceTimersByTime(150);
      expect(cache.get('t1')).toBeNull();
    });

    it('should count expired entry access as a miss', () => {
      cache.set('t1', makeBuffer(32), 100);

      cache.get('t1'); // hit
      vi.advanceTimersByTime(150);
      cache.get('t1'); // miss (expired)

      const stats = cache.stats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should use default TTL when none specified', () => {
      // defaultTtlMs is 60_000 (60 seconds)
      cache.set('t1', makeBuffer(32));

      vi.advanceTimersByTime(59_000);
      expect(cache.get('t1')).not.toBeNull();

      vi.advanceTimersByTime(2_000); // now at 61s
      expect(cache.get('t1')).toBeNull();
    });

    it('should evict expired entries before LRU during capacity eviction', () => {
      cache.set('t1', makeBuffer(10), 100); // expires quickly
      cache.set('t2', makeBuffer(10)); // default TTL
      cache.set('t3', makeBuffer(10));
      cache.set('t4', makeBuffer(10));
      cache.set('t5', makeBuffer(10));

      vi.advanceTimersByTime(150); // t1 is now expired

      // Adding t6 — t1 should be evicted first (expired) before any LRU eviction
      cache.set('t6', makeBuffer(10));

      expect(cache.get('t2')).not.toBeNull(); // not evicted
      expect(cache.get('t1')).toBeNull(); // was expired
      expect(cache.get('t6')).not.toBeNull(); // newly added
    });
  });

  // ── Memory Limit ────────────────────────────────────────────────

  describe('Memory Limit', () => {
    it('should evict entries when memory limit would be exceeded', () => {
      // memoryLimitBytes = 1024
      cache.set('big1', makeBuffer(400));
      cache.set('big2', makeBuffer(400));

      expect(cache.stats().totalSizeBytes).toBe(800);

      // Adding 400 more bytes would exceed 1024 — should evict big1
      cache.set('big3', makeBuffer(400));

      expect(cache.stats().totalSizeBytes).toBeLessThanOrEqual(1024);
      expect(cache.get('big1')).toBeNull(); // evicted (LRU)
      expect(cache.get('big3')).not.toBeNull();
    });

    it('should handle single entry larger than remaining space', () => {
      cache.set('small', makeBuffer(100));

      // Adding 950 bytes — still under 1024 total
      cache.set('big', makeBuffer(950));

      // small should be evicted to make room
      expect(cache.get('small')).toBeNull();
      expect(cache.get('big')).not.toBeNull();
      expect(cache.stats().totalSizeBytes).toBe(950);
    });

    it('should track total size correctly after evictions', () => {
      cache.set('a', makeBuffer(200));
      cache.set('b', makeBuffer(200));
      cache.set('c', makeBuffer(200));
      expect(cache.stats().totalSizeBytes).toBe(600);

      // Remove one
      cache.invalidate('b');
      expect(cache.stats().totalSizeBytes).toBe(400);
    });
  });

  // ── Invalidation ────────────────────────────────────────────────

  describe('Invalidation', () => {
    it('should remove a specific entry via invalidate()', () => {
      cache.set('t1', makeBuffer(32));
      cache.set('t2', makeBuffer(32));

      const removed = cache.invalidate('t1');
      expect(removed).toBe(true);
      expect(cache.get('t1')).toBeNull();
      expect(cache.get('t2')).not.toBeNull();
    });

    it('should return false when invalidating non-existent entry', () => {
      const removed = cache.invalidate('does-not-exist');
      expect(removed).toBe(false);
    });

    it('should clear all entries via clear()', () => {
      cache.set('t1', makeBuffer(32));
      cache.set('t2', makeBuffer(32));
      cache.set('t3', makeBuffer(32));

      cache.clear();

      expect(cache.get('t1')).toBeNull();
      expect(cache.get('t2')).toBeNull();
      expect(cache.get('t3')).toBeNull();
      expect(cache.stats().entryCount).toBe(0);
      expect(cache.stats().totalSizeBytes).toBe(0);
    });

    it('should reset hit/miss counters on clear()', () => {
      cache.set('t1', makeBuffer(32));
      cache.get('t1');
      cache.get('nonexistent');

      cache.clear();

      const stats = cache.stats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  // ── has() ───────────────────────────────────────────────────────

  describe('has()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return true for existing non-expired entry', () => {
      cache.set('t1', makeBuffer(16));
      expect(cache.has('t1')).toBe(true);
    });

    it('should return false for non-existent entry', () => {
      expect(cache.has('missing')).toBe(false);
    });

    it('should return false for expired entry', () => {
      cache.set('t1', makeBuffer(16), 100);
      vi.advanceTimersByTime(150);
      expect(cache.has('t1')).toBe(false);
    });
  });

  // ── Stats ───────────────────────────────────────────────────────

  describe('Stats', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should report correct entry count', () => {
      cache.set('a', makeBuffer(10));
      cache.set('b', makeBuffer(10));
      expect(cache.stats().entryCount).toBe(2);
    });

    it('should report correct total size', () => {
      cache.set('a', makeBuffer(100));
      cache.set('b', makeBuffer(200));
      expect(cache.stats().totalSizeBytes).toBe(300);
    });

    it('should report null oldest entry age when cache is empty', () => {
      expect(cache.stats().oldestEntryAge).toBeNull();
    });

    it('should report oldest entry age correctly', () => {
      cache.set('old', makeBuffer(10));
      vi.advanceTimersByTime(5000);
      cache.set('new', makeBuffer(10));

      const stats = cache.stats();
      expect(stats.oldestEntryAge).toBeGreaterThanOrEqual(5000);
    });

    it('should expose config limits in stats', () => {
      const stats = cache.stats();
      expect(stats.memoryLimitBytes).toBe(1024);
      expect(stats.maxCapacity).toBe(5);
    });
  });
});

// ── Pre-Warm Service Tests ──────────────────────────────────────

describe('Pre-Warm Service', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should load top-N templates into cache', async () => {
    // Mock PrismaClient
    const mockPrisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        { templateVersionId: 'tv-001', export_count: BigInt(50) },
        { templateVersionId: 'tv-002', export_count: BigInt(30) },
      ]),
      templateVersion: {
        findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => {
          return Promise.resolve({
            id: where.id,
            templateId: `template-for-${where.id}`,
          });
        }),
      },
      styleTemplate: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    // Mock fs.readFileSync for default template
    vi.doMock('fs', () => ({
      readFileSync: vi.fn().mockReturnValue(Buffer.from('mock-template-content')),
    }));

    // Import after mocking
    const { preWarmTemplates } = await import('../cache/pre-warm');
    const templateCacheModule = await import('../cache/template-cache');

    // Clear any prior cache state
    templateCacheModule.default.clear();

    await preWarmTemplates(mockPrisma as any);

    // Verify templates were loaded into cache
    expect(templateCacheModule.default.get('tv-001')).not.toBeNull();
    expect(templateCacheModule.default.get('tv-002')).not.toBeNull();
    expect(templateCacheModule.default.stats().entryCount).toBe(2);

    // Cleanup
    templateCacheModule.default.clear();
  });

  it('should handle empty export history gracefully', async () => {
    const mockPrisma = {
      $queryRaw: vi.fn().mockResolvedValue([]),
    };

    const { preWarmTemplates } = await import('../cache/pre-warm');

    // Should not throw
    await expect(preWarmTemplates(mockPrisma as any)).resolves.toBeUndefined();
  });

  it('should handle DB errors without throwing', async () => {
    const mockPrisma = {
      $queryRaw: vi.fn().mockRejectedValue(new Error('DB connection failed')),
    };

    const { preWarmTemplates } = await import('../cache/pre-warm');

    // Should not throw — errors are logged and swallowed
    await expect(preWarmTemplates(mockPrisma as any)).resolves.toBeUndefined();
  });

  it('should skip templates that fail to load individually', async () => {
    const mockPrisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        { templateVersionId: 'tv-good', export_count: BigInt(50) },
        { templateVersionId: 'tv-bad', export_count: BigInt(30) },
      ]),
      templateVersion: {
        findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => {
          if (where.id === 'tv-bad') {
            return Promise.reject(new Error('Template not found'));
          }
          return Promise.resolve({
            id: where.id,
            templateId: `template-for-${where.id}`,
          });
        }),
      },
      styleTemplate: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    vi.doMock('fs', () => ({
      readFileSync: vi.fn().mockReturnValue(Buffer.from('mock-template-content')),
    }));

    const { preWarmTemplates } = await import('../cache/pre-warm');
    const templateCacheModule = await import('../cache/template-cache');

    templateCacheModule.default.clear();

    await preWarmTemplates(mockPrisma as any);

    // tv-good should be cached, tv-bad should not
    expect(templateCacheModule.default.get('tv-good')).not.toBeNull();
    // tv-bad failed to load — should have been skipped
    expect(templateCacheModule.default.stats().entryCount).toBeGreaterThanOrEqual(1);

    templateCacheModule.default.clear();
  });
});

// ── CACHE_METRICS Export ────────────────────────────────────────

describe('CACHE_METRICS', () => {
  it('should export Prometheus metric descriptors', async () => {
    const { CACHE_METRICS } = await import('../cache/template-cache');

    expect(CACHE_METRICS.cache_hits_total.name).toBe('export_template_cache_hits_total');
    expect(CACHE_METRICS.cache_hits_total.type).toBe('counter');

    expect(CACHE_METRICS.cache_misses_total.name).toBe('export_template_cache_misses_total');
    expect(CACHE_METRICS.cache_misses_total.type).toBe('counter');

    expect(CACHE_METRICS.cache_size_bytes.name).toBe('export_template_cache_size_bytes');
    expect(CACHE_METRICS.cache_size_bytes.type).toBe('gauge');

    expect(CACHE_METRICS.cache_entries.name).toBe('export_template_cache_entries');
    expect(CACHE_METRICS.cache_entries.type).toBe('gauge');
  });
});
