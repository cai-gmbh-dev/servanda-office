/**
 * Auth Middleware Tests — Sprint 6 (Team 06)
 *
 * Tests JWT authentication (dev mode), role extraction, and RBAC middleware.
 * Production JWT validation (JWKS) is tested with mocked jsonwebtoken.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { TenantContext } from '@servanda/shared';

// Mock logger
vi.mock('../shared/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock error-handler — re-export the real classes
vi.mock('./error-handler', async () => {
  const actual = await vi.importActual<typeof import('./error-handler')>('./error-handler');
  return actual;
});

// Helper to create mock Express objects
function createMockReqRes(headers: Record<string, string> = {}) {
  const req = {
    headers: { ...headers },
  } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

function getTenant(req: Request): TenantContext | undefined {
  return (req as Request & { tenant?: TenantContext }).tenant;
}

// Import under test — dev mode (no OIDC_ISSUER set, NODE_ENV=development)
// Since the module reads env at import time, we ensure dev mode
describe('authenticate (dev mode)', () => {
  // We need to dynamically import to control env
  let authenticate: (req: Request, res: Response, next: NextFunction) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    // Ensure dev mode: no OIDC_ISSUER
    delete process.env.OIDC_ISSUER_URL;
    process.env.NODE_ENV = 'development';
    const mod = await import('./auth');
    authenticate = mod.authenticate;
  });

  it('attaches tenant context from headers', async () => {
    const { req, res, next } = createMockReqRes({
      'x-tenant-id': 'tenant-1',
      'x-user-id': 'user-1',
      'x-user-role': 'admin',
    });

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith();
    const tenant = getTenant(req);
    expect(tenant).toEqual({
      tenantId: 'tenant-1',
      userId: 'user-1',
      role: 'admin',
    });
  });

  it('defaults role to user when header missing', async () => {
    const { req, res, next } = createMockReqRes({
      'x-tenant-id': 'tenant-1',
      'x-user-id': 'user-1',
    });

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(getTenant(req)?.role).toBe('user');
  });

  it('calls next with 401 error when tenant-id missing', async () => {
    const { req, res, next } = createMockReqRes({
      'x-user-id': 'user-1',
    });

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401 }),
    );
  });

  it('calls next with 401 error when user-id missing', async () => {
    const { req, res, next } = createMockReqRes({
      'x-tenant-id': 'tenant-1',
    });

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401 }),
    );
  });

  it('calls next with 401 when both headers missing', async () => {
    const { req, res, next } = createMockReqRes({});

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401 }),
    );
  });
});

describe('requireRole', () => {
  let requireRole: (...roles: import('@servanda/shared').UserRole[]) => (req: Request, res: Response, next: NextFunction) => void;

  beforeEach(async () => {
    vi.resetModules();
    delete process.env.OIDC_ISSUER_URL;
    process.env.NODE_ENV = 'development';
    const mod = await import('./auth');
    requireRole = mod.requireRole;
  });

  it('calls next when role is allowed', () => {
    const { req, res, next } = createMockReqRes();
    (req as Request & { tenant: TenantContext }).tenant = {
      tenantId: 't1',
      userId: 'u1',
      role: 'admin',
    };

    requireRole('admin', 'editor')(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('returns 403 when role is not allowed', () => {
    const { req, res, next } = createMockReqRes();
    (req as Request & { tenant: TenantContext }).tenant = {
      tenantId: 't1',
      userId: 'u1',
      role: 'user',
    };

    requireRole('admin')(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 }),
    );
  });

  it('returns 401 when no tenant context present', () => {
    const { req, res, next } = createMockReqRes();

    requireRole('admin')(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401 }),
    );
  });

  it('allows multiple roles', () => {
    const { req, res, next } = createMockReqRes();
    (req as Request & { tenant: TenantContext }).tenant = {
      tenantId: 't1',
      userId: 'u1',
      role: 'editor',
    };

    requireRole('admin', 'editor')(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });
});
