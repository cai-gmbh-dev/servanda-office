/**
 * Cache Key Computation — Sprint 13 (Team 05)
 *
 * Computes a deterministic SHA-256 hash for export job data.
 * Used to identify identical export results in the result cache
 * and avoid redundant rendering.
 *
 * Determinism guarantees:
 * - All arrays are sorted before hashing
 * - All object keys are sorted recursively
 * - Same inputs always produce the same hash
 */

import { createHash } from 'crypto';

export interface CacheKeyInput {
  contractInstanceId: string;
  clauseVersionIds: string[];
  answers: Record<string, unknown>;
  styleTemplateId?: string;
  format: 'docx' | 'odt';
}

/**
 * Compute a deterministic SHA-256 cache key from export job data.
 *
 * The key is based on:
 * - contractInstanceId
 * - clauseVersionIds (sorted alphabetically)
 * - answers (keys sorted, values serialized deterministically)
 * - styleTemplateId (if present)
 * - format (docx or odt)
 *
 * @returns Hex-encoded SHA-256 hash string
 */
export function computeCacheKey(data: CacheKeyInput): string {
  const normalized = {
    contractInstanceId: data.contractInstanceId,
    clauseVersionIds: [...data.clauseVersionIds].sort(),
    answers: sortObjectKeys(data.answers),
    styleTemplateId: data.styleTemplateId ?? null,
    format: data.format,
  };

  const serialized = JSON.stringify(normalized);

  return createHash('sha256').update(serialized, 'utf-8').digest('hex');
}

/**
 * Recursively sort all object keys for deterministic JSON serialization.
 * Arrays are kept in their sorted order (primitive arrays are sorted,
 * object arrays are sorted by their JSON representation).
 */
function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    const sorted = obj.map(sortObjectKeys);
    // Sort primitive arrays for determinism
    if (sorted.length > 0 && typeof sorted[0] !== 'object') {
      return sorted.sort();
    }
    // Sort object arrays by their serialized form
    return sorted.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }

  if (typeof obj === 'object') {
    const sortedEntries = Object.keys(obj as Record<string, unknown>)
      .sort()
      .map((key) => [key, sortObjectKeys((obj as Record<string, unknown>)[key])]);
    return Object.fromEntries(sortedEntries);
  }

  return obj;
}
