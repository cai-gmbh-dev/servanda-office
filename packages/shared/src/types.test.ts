/**
 * Shared Types & Constants Tests — Sprint 6 (Team 06)
 *
 * Validates that exported types and constants are correct.
 */

import { describe, it, expect } from 'vitest';
import {
  APP_NAME,
  APP_VERSION,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  EXPORT_JOB_TIMEOUT_MS,
  EXPORT_MAX_RETRIES,
  EXPORT_MAX_FILE_SIZE_BYTES,
  AUDIT_RETENTION_DAYS_STARTER,
  AUDIT_RETENTION_DAYS_PRO,
  MAX_RULES_PER_EVALUATION,
  RULE_EVALUATION_TIMEOUT_MS,
  FEATURE_FLAGS,
} from './constants';

describe('Constants', () => {
  it('APP_NAME is Servanda Office', () => {
    expect(APP_NAME).toBe('Servanda Office');
  });

  it('APP_VERSION follows semver', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  describe('Pagination', () => {
    it('DEFAULT_PAGE_SIZE is a positive number', () => {
      expect(DEFAULT_PAGE_SIZE).toBeGreaterThan(0);
      expect(DEFAULT_PAGE_SIZE).toBe(20);
    });

    it('MAX_PAGE_SIZE is greater than DEFAULT_PAGE_SIZE', () => {
      expect(MAX_PAGE_SIZE).toBeGreaterThan(DEFAULT_PAGE_SIZE);
      expect(MAX_PAGE_SIZE).toBe(100);
    });
  });

  describe('Export', () => {
    it('EXPORT_JOB_TIMEOUT_MS is 2 minutes', () => {
      expect(EXPORT_JOB_TIMEOUT_MS).toBe(120_000);
    });

    it('EXPORT_MAX_RETRIES is 3', () => {
      expect(EXPORT_MAX_RETRIES).toBe(3);
    });

    it('EXPORT_MAX_FILE_SIZE_BYTES is 5 MB', () => {
      expect(EXPORT_MAX_FILE_SIZE_BYTES).toBe(5 * 1024 * 1024);
    });
  });

  describe('Audit', () => {
    it('retention days differ by plan', () => {
      expect(AUDIT_RETENTION_DAYS_STARTER).toBe(90);
      expect(AUDIT_RETENTION_DAYS_PRO).toBe(365);
      expect(AUDIT_RETENTION_DAYS_PRO).toBeGreaterThan(AUDIT_RETENTION_DAYS_STARTER);
    });
  });

  describe('Validation', () => {
    it('MAX_RULES_PER_EVALUATION is 2000', () => {
      expect(MAX_RULES_PER_EVALUATION).toBe(2000);
    });

    it('RULE_EVALUATION_TIMEOUT_MS is 5 seconds', () => {
      expect(RULE_EVALUATION_TIMEOUT_MS).toBe(5_000);
    });
  });

  describe('Feature Flags', () => {
    it('odt_export_enabled defaults to false', () => {
      expect(FEATURE_FLAGS.odt_export_enabled).toBe(false);
    });
  });
});

describe('Type exports (compile-time check)', () => {
  it('can import and use TenantContext', async () => {
    const { default: _ } = await import('./types') as { default: undefined };
    // If this compiles, types are exported correctly
    const ctx: import('./types').TenantContext = {
      tenantId: 'test',
      userId: 'test',
      role: 'admin',
    };
    expect(ctx.tenantId).toBe('test');
  });

  it('can import and use PaginatedResult', async () => {
    const result: import('./types').PaginatedResult<string> = {
      data: ['a', 'b'],
      total: 2,
      page: 1,
      pageSize: 20,
      hasMore: false,
    };
    expect(result.data).toHaveLength(2);
    expect(result.hasMore).toBe(false);
  });
});
