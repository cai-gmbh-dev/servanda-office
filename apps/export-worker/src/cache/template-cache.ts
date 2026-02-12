/**
 * Template Cache — Sprint 11 (Team 05)
 *
 * In-Memory LRU cache for DOCX template buffers.
 * Reduces S3/DB round-trips per export job from ~200ms to <1ms on cache hit.
 *
 * Features:
 * - LRU eviction when capacity is reached
 * - Per-entry TTL (default 30 minutes)
 * - Global memory limit (default 100 MB)
 * - Prometheus-ready metrics (hit/miss counters, size gauge)
 * - Singleton export for worker-wide usage
 */

import { logger } from '../logger';

/** Configuration for TemplateCache */
export interface TemplateCacheConfig {
  /** Maximum number of templates to cache (default: 50) */
  maxCapacity: number;
  /** Default TTL in milliseconds (default: 30 minutes) */
  defaultTtlMs: number;
  /** Maximum total memory for cached buffers in bytes (default: 100 MB) */
  memoryLimitBytes: number;
}

/** Internal cache entry */
interface CacheEntry {
  buffer: Buffer;
  expiresAt: number;
  lastAccessedAt: number;
  size: number;
}

/** Cache statistics */
export interface CacheStats {
  hits: number;
  misses: number;
  hitRatio: number;
  entryCount: number;
  totalSizeBytes: number;
  oldestEntryAge: number | null;
  memoryLimitBytes: number;
  maxCapacity: number;
}

const DEFAULT_CONFIG: TemplateCacheConfig = {
  maxCapacity: 50,
  defaultTtlMs: 30 * 60 * 1000, // 30 minutes
  memoryLimitBytes: 100 * 1024 * 1024, // 100 MB
};

export class TemplateCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly config: TemplateCacheConfig;
  private hits = 0;
  private misses = 0;
  private totalSizeBytes = 0;

  constructor(config?: Partial<TemplateCacheConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Retrieve a cached template buffer.
   * Returns null on miss or if the entry has expired.
   */
  get(templateId: string): Buffer | null {
    const entry = this.entries.get(templateId);

    // Miss: entry does not exist
    if (!entry) {
      this.misses++;
      return null;
    }

    // Miss: entry expired
    if (Date.now() > entry.expiresAt) {
      this.removeEntry(templateId);
      this.misses++;
      return null;
    }

    // Hit: update LRU timestamp
    entry.lastAccessedAt = Date.now();
    this.hits++;
    return entry.buffer;
  }

  /**
   * Store a template buffer in the cache.
   * Evicts LRU entries when capacity or memory limit is exceeded.
   *
   * @param templateId - Unique template identifier
   * @param buffer - DOCX template buffer
   * @param ttl - Optional TTL in ms (overrides default)
   */
  set(templateId: string, buffer: Buffer, ttl?: number): void {
    const ttlMs = ttl ?? this.config.defaultTtlMs;
    const size = buffer.length;

    // If updating an existing entry, remove the old one first
    if (this.entries.has(templateId)) {
      this.removeEntry(templateId);
    }

    // Evict until we have capacity for the new entry
    this.evictIfNeeded(size);

    const entry: CacheEntry = {
      buffer,
      expiresAt: Date.now() + ttlMs,
      lastAccessedAt: Date.now(),
      size,
    };

    this.entries.set(templateId, entry);
    this.totalSizeBytes += size;

    logger.debug(
      { templateId, size, ttlMs, cacheSize: this.entries.size },
      'Template cached',
    );
  }

  /**
   * Invalidate (remove) a single template from the cache.
   */
  invalidate(templateId: string): boolean {
    if (!this.entries.has(templateId)) {
      return false;
    }
    this.removeEntry(templateId);
    logger.debug({ templateId, cacheSize: this.entries.size }, 'Template invalidated');
    return true;
  }

  /**
   * Clear all cached templates.
   */
  clear(): void {
    this.entries.clear();
    this.totalSizeBytes = 0;
    this.hits = 0;
    this.misses = 0;
    logger.debug('Template cache cleared');
  }

  /**
   * Return current cache statistics.
   */
  stats(): CacheStats {
    const totalRequests = this.hits + this.misses;

    let oldestEntryAge: number | null = null;
    if (this.entries.size > 0) {
      let oldestAccess = Infinity;
      for (const entry of this.entries.values()) {
        if (entry.lastAccessedAt < oldestAccess) {
          oldestAccess = entry.lastAccessedAt;
        }
      }
      oldestEntryAge = Date.now() - oldestAccess;
    }

    return {
      hits: this.hits,
      misses: this.misses,
      hitRatio: totalRequests > 0 ? this.hits / totalRequests : 0,
      entryCount: this.entries.size,
      totalSizeBytes: this.totalSizeBytes,
      oldestEntryAge,
      memoryLimitBytes: this.config.memoryLimitBytes,
      maxCapacity: this.config.maxCapacity,
    };
  }

  /**
   * Check if a template is currently cached (and not expired).
   */
  has(templateId: string): boolean {
    const entry = this.entries.get(templateId);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.removeEntry(templateId);
      return false;
    }
    return true;
  }

  // ── Internal helpers ──────────────────────────────────────────────

  /**
   * Remove entry and update size tracking.
   */
  private removeEntry(templateId: string): void {
    const entry = this.entries.get(templateId);
    if (entry) {
      this.totalSizeBytes -= entry.size;
      this.entries.delete(templateId);
    }
  }

  /**
   * Evict entries when capacity or memory limit would be exceeded.
   * Strategy: remove expired first, then LRU.
   */
  private evictIfNeeded(incomingSize: number): void {
    // Phase 1: evict expired entries
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt < now) {
        this.removeEntry(key);
      }
    }

    // Phase 2: evict LRU entries if capacity limit exceeded
    while (this.entries.size >= this.config.maxCapacity) {
      this.evictLru();
    }

    // Phase 3: evict LRU entries if memory limit would be exceeded
    while (
      this.totalSizeBytes + incomingSize > this.config.memoryLimitBytes &&
      this.entries.size > 0
    ) {
      this.evictLru();
    }
  }

  /**
   * Evict the least-recently-used entry.
   */
  private evictLru(): void {
    let lruKey: string | null = null;
    let lruTime = Infinity;

    for (const [key, entry] of this.entries) {
      if (entry.lastAccessedAt < lruTime) {
        lruTime = entry.lastAccessedAt;
        lruKey = key;
      }
    }

    if (lruKey) {
      logger.debug({ templateId: lruKey }, 'Evicting LRU template from cache');
      this.removeEntry(lruKey);
    }
  }
}

// ── Prometheus Metrics Descriptors ────────────────────────────────
// These are exposed for the observability stack (Prometheus + Grafana).
// Actual registration happens in the metrics setup module.
export const CACHE_METRICS = {
  cache_hits_total: {
    name: 'export_template_cache_hits_total',
    help: 'Total number of template cache hits',
    type: 'counter' as const,
  },
  cache_misses_total: {
    name: 'export_template_cache_misses_total',
    help: 'Total number of template cache misses',
    type: 'counter' as const,
  },
  cache_size_bytes: {
    name: 'export_template_cache_size_bytes',
    help: 'Current total size of cached templates in bytes',
    type: 'gauge' as const,
  },
  cache_entries: {
    name: 'export_template_cache_entries',
    help: 'Current number of cached template entries',
    type: 'gauge' as const,
  },
};

// ── Singleton ─────────────────────────────────────────────────────
// Worker-wide singleton. Config can be overridden via env vars.
const singletonCache = new TemplateCache({
  maxCapacity: Number(process.env.TEMPLATE_CACHE_MAX_CAPACITY) || DEFAULT_CONFIG.maxCapacity,
  defaultTtlMs: Number(process.env.TEMPLATE_CACHE_TTL_MS) || DEFAULT_CONFIG.defaultTtlMs,
  memoryLimitBytes: Number(process.env.TEMPLATE_CACHE_MEMORY_LIMIT_BYTES) || DEFAULT_CONFIG.memoryLimitBytes,
});

export default singletonCache;
