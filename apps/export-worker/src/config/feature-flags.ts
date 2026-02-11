/**
 * Feature Flag Resolution — Sprint 7 (Team 05)
 *
 * Resolves feature flags from tenant settings (DB) with env-var fallback.
 * Supports per-tenant ODT export enablement.
 */

export interface TenantSettings {
  features?: {
    odt_export_enabled?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Check if ODT export is enabled for a given tenant.
 * Resolution order:
 * 1. Tenant settings in DB (tenant.settings.features.odt_export_enabled)
 * 2. Environment variable FEATURE_ODT_EXPORT
 * 3. Default: false
 */
export function isOdtExportEnabled(tenantSettings: TenantSettings | null): boolean {
  // 1. Check tenant-specific setting
  if (tenantSettings?.features?.odt_export_enabled !== undefined) {
    return tenantSettings.features.odt_export_enabled === true;
  }

  // 2. Fallback to environment variable
  if (process.env.FEATURE_ODT_EXPORT !== undefined) {
    return process.env.FEATURE_ODT_EXPORT === 'true';
  }

  // 3. Default: disabled
  return false;
}

/**
 * Check if a generic feature flag is enabled for a tenant.
 * Looks up tenant.settings.features[flagName] with env-var fallback.
 */
export function isFeatureEnabled(
  flagName: string,
  tenantSettings: TenantSettings | null,
): boolean {
  // 1. Tenant-specific
  if (tenantSettings?.features?.[flagName] !== undefined) {
    return tenantSettings.features[flagName] === true;
  }

  // 2. Environment variable (FEATURE_ prefix, uppercase)
  const envKey = `FEATURE_${flagName.toUpperCase()}`;
  if (process.env[envKey] !== undefined) {
    return process.env[envKey] === 'true';
  }

  return false;
}
