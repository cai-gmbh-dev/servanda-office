/**
 * Export Result Cache — Sprint 13 (Team 05)
 *
 * Caches exported documents in S3 to avoid re-rendering identical contracts.
 * Cache key is a SHA-256 hash of the contract's deterministic inputs
 * (contractInstanceId, clauseVersionIds, answers, styleTemplateId, format).
 *
 * Flow:
 * 1. Before rendering: check if cached result exists in S3 at exports/cache/{hash}.{format}
 * 2. Cache hit:  copy S3 object to export result path, skip rendering
 * 3. Cache miss: render normally, then store a copy in the cache path
 *
 * TTL: configurable via EXPORT_CACHE_TTL_HOURS (default 24h).
 * Objects are tagged with an expiration timestamp in S3 metadata.
 * On read, expired entries are treated as cache misses.
 *
 * Based on: export performance optimization (Sprint 13)
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { logger } from '../logger';
import { computeCacheKey, type CacheKeyInput } from './cache-key';

/** TTL in hours for cached export results (default: 24h) */
const CACHE_TTL_HOURS = Number(process.env.EXPORT_CACHE_TTL_HOURS) || 24;

const S3_BUCKET = process.env.S3_BUCKET ?? 'servanda-office-dev';

/** S3 prefix for cached export results */
const CACHE_PREFIX = 'exports/cache';

export interface ResultCacheConfig {
  s3Client: S3Client;
  bucket?: string;
  ttlHours?: number;
}

export interface CacheCheckResult {
  cacheHit: boolean;
  cacheKey: string;
  cachePath?: string;
}

export interface CacheLookupResult {
  cacheHit: boolean;
  cacheKey: string;
  buffer?: Buffer;
}

/**
 * Export Result Cache service.
 *
 * Wraps S3 operations for storing and retrieving cached export results.
 * Designed for injection into the export handler pipeline.
 */
export class ResultCache {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly ttlHours: number;

  constructor(config: ResultCacheConfig) {
    this.s3 = config.s3Client;
    this.bucket = config.bucket ?? S3_BUCKET;
    this.ttlHours = config.ttlHours ?? CACHE_TTL_HOURS;
  }

  /**
   * Build the S3 cache path for a given hash and format.
   */
  getCachePath(cacheKey: string, format: string): string {
    return `${CACHE_PREFIX}/${cacheKey}.${format}`;
  }

  /**
   * Check if a cached result exists and is not expired.
   *
   * @returns CacheLookupResult with cacheHit=true and the buffer if found,
   *          or cacheHit=false if not found or expired.
   */
  async lookup(input: CacheKeyInput): Promise<CacheLookupResult> {
    const cacheKey = computeCacheKey(input);
    const cachePath = this.getCachePath(cacheKey, input.format);

    try {
      // Check if object exists and read metadata for TTL check
      const headResponse = await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: cachePath,
        }),
      );

      // Check TTL via metadata
      const cachedAtStr = headResponse.Metadata?.['cached-at'];
      if (cachedAtStr) {
        const cachedAt = new Date(cachedAtStr);
        const expiresAt = new Date(cachedAt.getTime() + this.ttlHours * 60 * 60 * 1000);

        if (new Date() > expiresAt) {
          logger.info(
            { cacheKey, cachePath, cachedAt: cachedAtStr },
            'Result cache TTL expired — treating as miss',
          );
          return { cacheHit: false, cacheKey };
        }
      }

      // Object exists and is not expired — fetch the content
      const getResponse = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: cachePath,
        }),
      );

      const bodyBytes = await getResponse.Body?.transformToByteArray();
      if (!bodyBytes || bodyBytes.length === 0) {
        logger.warn({ cacheKey, cachePath }, 'Result cache entry is empty — treating as miss');
        return { cacheHit: false, cacheKey };
      }

      const buffer = Buffer.from(bodyBytes);

      logger.info(
        { cacheKey, cachePath, size: buffer.length },
        'Result cache HIT',
      );

      return { cacheHit: true, cacheKey, buffer };
    } catch (err: unknown) {
      // NoSuchKey or any S3 error → treat as cache miss
      const errorName = (err as { name?: string })?.name;
      if (errorName === 'NotFound' || errorName === 'NoSuchKey') {
        logger.debug({ cacheKey, cachePath }, 'Result cache MISS (not found)');
      } else {
        logger.warn({ cacheKey, cachePath, err }, 'Result cache lookup error — treating as miss');
      }
      return { cacheHit: false, cacheKey };
    }
  }

  /**
   * Store a rendered export result in the cache.
   *
   * @param cacheKey - The SHA-256 hash (from computeCacheKey)
   * @param format - File format (docx or odt)
   * @param buffer - The rendered document buffer
   */
  async store(cacheKey: string, format: string, buffer: Buffer): Promise<void> {
    const cachePath = this.getCachePath(cacheKey, format);
    const contentType =
      format === 'odt'
        ? 'application/vnd.oasis.opendocument.text'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: cachePath,
          Body: buffer,
          ContentType: contentType,
          Metadata: {
            'cached-at': new Date().toISOString(),
            'ttl-hours': String(this.ttlHours),
          },
        }),
      );

      logger.info(
        { cacheKey, cachePath, size: buffer.length, ttlHours: this.ttlHours },
        'Result cached in S3',
      );
    } catch (err) {
      // Cache store failures should not break the export pipeline
      logger.warn({ cacheKey, cachePath, err }, 'Failed to store result in cache — continuing');
    }
  }

  /**
   * Copy a cached result to the export result path.
   * Used when a cache hit occurs to place the file at the expected location.
   *
   * @param cacheKey - The SHA-256 hash
   * @param format - File format
   * @param destinationPath - Target S3 key for the export result
   */
  async copyToResultPath(cacheKey: string, format: string, destinationPath: string): Promise<void> {
    const cachePath = this.getCachePath(cacheKey, format);

    try {
      await this.s3.send(
        new CopyObjectCommand({
          Bucket: this.bucket,
          CopySource: `${this.bucket}/${cachePath}`,
          Key: destinationPath,
        }),
      );

      logger.info(
        { cacheKey, cachePath, destinationPath },
        'Cached result copied to export path',
      );
    } catch (err) {
      logger.error(
        { cacheKey, cachePath, destinationPath, err },
        'Failed to copy cached result — will need to re-render',
      );
      throw err;
    }
  }
}

/**
 * Create a ResultCache instance with default S3 configuration.
 * Used in the export handler for production use.
 */
export function createResultCache(s3Client: S3Client): ResultCache {
  return new ResultCache({
    s3Client,
    bucket: S3_BUCKET,
    ttlHours: CACHE_TTL_HOURS,
  });
}
