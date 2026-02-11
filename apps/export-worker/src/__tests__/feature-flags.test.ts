/**
 * Feature Flag Tests — Sprint 7 (Team 05)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isOdtExportEnabled, isFeatureEnabled } from '../config/feature-flags';

describe('Feature Flags', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isOdtExportEnabled', () => {
    it('should return true when tenant settings enable ODT', () => {
      const settings = { features: { odt_export_enabled: true } };
      expect(isOdtExportEnabled(settings)).toBe(true);
    });

    it('should return false when tenant settings disable ODT', () => {
      const settings = { features: { odt_export_enabled: false } };
      expect(isOdtExportEnabled(settings)).toBe(false);
    });

    it('should fall back to env var when tenant settings have no ODT flag', () => {
      process.env.FEATURE_ODT_EXPORT = 'true';
      expect(isOdtExportEnabled({ features: {} })).toBe(true);
    });

    it('should fall back to env var when tenant settings are null', () => {
      process.env.FEATURE_ODT_EXPORT = 'true';
      expect(isOdtExportEnabled(null)).toBe(true);
    });

    it('should return false when env var is not true', () => {
      process.env.FEATURE_ODT_EXPORT = 'false';
      expect(isOdtExportEnabled(null)).toBe(false);
    });

    it('should return false when no settings and no env var', () => {
      delete process.env.FEATURE_ODT_EXPORT;
      expect(isOdtExportEnabled(null)).toBe(false);
    });

    it('should prioritize tenant settings over env var', () => {
      process.env.FEATURE_ODT_EXPORT = 'true';
      const settings = { features: { odt_export_enabled: false } };
      expect(isOdtExportEnabled(settings)).toBe(false);
    });
  });

  describe('isFeatureEnabled', () => {
    it('should resolve tenant-specific flag', () => {
      const settings = { features: { custom_branding: true } };
      expect(isFeatureEnabled('custom_branding', settings)).toBe(true);
    });

    it('should fall back to FEATURE_ env var', () => {
      process.env.FEATURE_CUSTOM_BRANDING = 'true';
      expect(isFeatureEnabled('custom_branding', null)).toBe(true);
    });

    it('should return false for unknown flags', () => {
      expect(isFeatureEnabled('nonexistent', null)).toBe(false);
    });

    it('should prioritize tenant settings', () => {
      process.env.FEATURE_BETA_FEATURE = 'true';
      const settings = { features: { beta_feature: false } };
      expect(isFeatureEnabled('beta_feature', settings)).toBe(false);
    });
  });
});
