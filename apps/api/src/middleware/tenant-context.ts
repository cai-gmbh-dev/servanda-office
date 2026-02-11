import type { Request, Response, NextFunction } from 'express';
import type { TenantContext } from '@servanda/shared';
import { logger } from '../shared/logger';

/**
 * Extracts tenant context from the JWT token and attaches it to the request.
 * In production, this validates the JWT against the OIDC provider.
 * The tenant_id, user_id, and role are extracted from token claims.
 *
 * ADR-001: Every API request must carry tenant context.
 */
export function tenantContext(req: Request, _res: Response, next: NextFunction): void {
  try {
    // TODO: Replace with real JWT validation (Keycloak OIDC)
    // For now, extract from headers (development mode)
    const tenantId = req.headers['x-tenant-id'] as string | undefined;
    const userId = req.headers['x-user-id'] as string | undefined;
    const role = req.headers['x-user-role'] as string | undefined;

    if (!tenantId || !userId || !role) {
      // In production, this would return 401
      logger.warn('Missing tenant context headers (dev mode)');
    }

    // Attach to request for downstream use
    (req as Request & { tenant?: TenantContext }).tenant = {
      tenantId: tenantId ?? '',
      userId: userId ?? '',
      role: (role as TenantContext['role']) ?? 'user',
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Extracts the TenantContext from an Express request.
 * Throws if tenant context is not present.
 */
export function getTenantContext(req: Request): TenantContext {
  const tenant = (req as Request & { tenant?: TenantContext }).tenant;
  if (!tenant?.tenantId) {
    throw new Error('Tenant context not available. Ensure tenantContext middleware is applied.');
  }
  return tenant;
}
