// === Application Constants ===

export const APP_NAME = 'Servanda Office';
export const APP_VERSION = '0.1.0';

// === Pagination ===

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// === Export ===

export const EXPORT_JOB_TIMEOUT_MS = 120_000;
export const EXPORT_MAX_RETRIES = 3;
export const EXPORT_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB input limit

// === Audit ===

export const AUDIT_RETENTION_DAYS_STARTER = 90;
export const AUDIT_RETENTION_DAYS_PRO = 365;

// === Validation ===

export const MAX_RULES_PER_EVALUATION = 2000;
export const RULE_EVALUATION_TIMEOUT_MS = 5_000;

// === Feature Flags (Defaults) ===

export const FEATURE_FLAGS = {
  odt_export_enabled: false,
} as const;
