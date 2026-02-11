/**
 * JWT Authentication Middleware — Sprint 5 (Team 02)
 *
 * Production: Validates JWT against Keycloak OIDC via JWKS.
 * Development: Falls back to x-tenant-id / x-user-id / x-user-role headers.
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import type { TenantContext, UserRole } from '@servanda/shared';
import { logger } from '../shared/logger';
import { AppError } from './error-handler';

const OIDC_ISSUER = process.env.OIDC_ISSUER_URL;
const OIDC_AUDIENCE = process.env.OIDC_CLIENT_ID ?? 'servanda-office';
const DEV_MODE = !OIDC_ISSUER || process.env.NODE_ENV === 'development';

let jwks: jwksClient.JwksClient | null = null;

if (OIDC_ISSUER) {
  jwks = jwksClient({
    jwksUri: `${OIDC_ISSUER}/protocol/openid-connect/certs`,
    cache: true,
    cacheMaxAge: 600_000, // 10 min
    rateLimit: true,
    jwksRequestsPerMinute: 10,
  });
}

function getSigningKey(header: jwt.JwtHeader): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!jwks) return reject(new Error('JWKS client not initialized'));
    jwks.getSigningKey(header.kid, (err, key) => {
      if (err) return reject(err);
      resolve(key!.getPublicKey());
    });
  });
}

interface JwtPayload {
  sub: string;
  tenant_id: string;
  realm_access?: { roles: string[] };
  resource_access?: Record<string, { roles: string[] }>;
  preferred_username?: string;
  email?: string;
}

function extractRole(payload: JwtPayload): UserRole {
  // Check resource_access for client-specific roles first
  const clientRoles = payload.resource_access?.[OIDC_AUDIENCE]?.roles ?? [];
  if (clientRoles.includes('admin')) return 'admin';
  if (clientRoles.includes('editor')) return 'editor';

  // Fallback to realm roles
  const realmRoles = payload.realm_access?.roles ?? [];
  if (realmRoles.includes('admin')) return 'admin';
  if (realmRoles.includes('editor')) return 'editor';

  return 'user';
}

/**
 * Authenticates the request and attaches TenantContext.
 * In dev mode, uses header-based identity (no JWT required).
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (DEV_MODE) {
      // Development: extract from headers
      const tenantId = req.headers['x-tenant-id'] as string | undefined;
      const userId = req.headers['x-user-id'] as string | undefined;
      const role = req.headers['x-user-role'] as string | undefined;

      if (!tenantId || !userId) {
        throw new AppError(401, 'Missing x-tenant-id or x-user-id headers (dev mode)', 'UNAUTHORIZED');
      }

      (req as Request & { tenant: TenantContext }).tenant = {
        tenantId,
        userId,
        role: (role as UserRole) ?? 'user',
      };
      return next();
    }

    // Production: validate JWT Bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError(401, 'Missing or invalid Authorization header', 'UNAUTHORIZED');
    }

    const token = authHeader.slice(7);

    const decoded = await new Promise<JwtPayload>((resolve, reject) => {
      jwt.verify(
        token,
        (header, callback) => {
          getSigningKey(header as jwt.JwtHeader)
            .then((key) => callback(null, key))
            .catch(callback);
        },
        {
          issuer: OIDC_ISSUER,
          audience: OIDC_AUDIENCE,
          algorithms: ['RS256'],
        },
        (err, payload) => {
          if (err) return reject(err);
          resolve(payload as JwtPayload);
        },
      );
    });

    if (!decoded.tenant_id) {
      throw new AppError(401, 'JWT missing tenant_id claim', 'UNAUTHORIZED');
    }

    (req as Request & { tenant: TenantContext }).tenant = {
      tenantId: decoded.tenant_id,
      userId: decoded.sub,
      role: extractRole(decoded),
    };

    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    logger.warn({ err }, 'Authentication failed');
    next(new AppError(401, 'Authentication failed', 'UNAUTHORIZED'));
  }
}

/**
 * Role-based access control middleware factory.
 * Returns middleware that checks if the user has one of the allowed roles.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const tenant = (req as Request & { tenant?: TenantContext }).tenant;
    if (!tenant) {
      return next(new AppError(401, 'Not authenticated', 'UNAUTHORIZED'));
    }
    if (!allowedRoles.includes(tenant.role)) {
      return next(new AppError(403, `Role '${tenant.role}' not authorized. Required: ${allowedRoles.join(', ')}`, 'FORBIDDEN'));
    }
    next();
  };
}
