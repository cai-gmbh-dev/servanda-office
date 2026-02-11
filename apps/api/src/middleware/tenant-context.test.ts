/**
 * Tenant Context Middleware Tests — Sprint 6 (Team 06)
 */

import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { TenantContext } from '@servanda/shared';
import { tenantContext, getTenantContext } from './tenant-context';

vi.mock('../shared/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

function createMockReqRes(headers: Record<string, string> = {}) {
  const req = { headers: { ...headers } } as unknown as Request;
  const res = {} as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

describe('tenantContext middleware', () => {
  it('extracts tenant context from headers', () => {
    const { req, res, next } = createMockReqRes({
      'x-tenant-id': 'tenant-abc',
      'x-user-id': 'user-xyz',
      'x-user-role': 'editor',
    });

    tenantContext(req, res, next);

    expect(next).toHaveBeenCalled();
    const tenant = (req as Request & { tenant?: TenantContext }).tenant;
    expect(tenant).toEqual({
      tenantId: 'tenant-abc',
      userId: 'user-xyz',
      role: 'editor',
    });
  });

  it('defaults to empty strings and user role when headers missing', () => {
    const { req, res, next } = createMockReqRes({});

    tenantContext(req, res, next);

    expect(next).toHaveBeenCalled();
    const tenant = (req as Request & { tenant?: TenantContext }).tenant;
    expect(tenant?.tenantId).toBe('');
    expect(tenant?.userId).toBe('');
    expect(tenant?.role).toBe('user');
  });
});

describe('getTenantContext', () => {
  it('returns tenant context when present', () => {
    const req = {
      headers: {},
    } as unknown as Request;
    (req as Request & { tenant: TenantContext }).tenant = {
      tenantId: 't1',
      userId: 'u1',
      role: 'admin',
    };

    const ctx = getTenantContext(req);
    expect(ctx).toEqual({ tenantId: 't1', userId: 'u1', role: 'admin' });
  });

  it('throws when tenant context is missing', () => {
    const req = { headers: {} } as unknown as Request;

    expect(() => getTenantContext(req)).toThrow('Tenant context not available');
  });

  it('throws when tenantId is empty', () => {
    const req = { headers: {} } as unknown as Request;
    (req as Request & { tenant: TenantContext }).tenant = {
      tenantId: '',
      userId: 'u1',
      role: 'user',
    };

    expect(() => getTenantContext(req)).toThrow('Tenant context not available');
  });
});
