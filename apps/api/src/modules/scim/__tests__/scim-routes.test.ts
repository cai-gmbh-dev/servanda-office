/**
 * SCIM 2.0 Routes & Provisioning Service Tests — Sprint 13 (Team 02)
 *
 * Tests all SCIM endpoints:
 *   - SCIM filtering (userName eq)
 *   - Tenant isolation via API key
 *   - Schema mapping (SCIM ↔ internal User model)
 *   - CRUD lifecycle: create, read, update (PATCH), deactivate (DELETE)
 *   - ServiceProviderConfig and Schemas endpoints
 *   - Error cases: auth failure, not found, conflict
 *
 * All DB and Keycloak calls are mocked — no external dependencies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Dependencies
// ---------------------------------------------------------------------------

const mockTx = {
  user: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
};

vi.mock('../../../shared/db', () => ({
  prisma: {
    $transaction: vi.fn((fn: any) => fn(mockTx)),
  },
  setTenantContext: vi.fn(),
}));

vi.mock('../../../middleware/tenant-context', () => ({
  getTenantContext: vi.fn().mockReturnValue({
    tenantId: 'tenant-001',
    userId: 'scim-service',
    role: 'admin',
  }),
}));

vi.mock('../../../services/audit.service', () => ({
  auditService: { log: vi.fn() },
}));

vi.mock('../../../shared/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../services/keycloak-admin', () => ({
  keycloakAdmin: {
    createUser: vi.fn().mockResolvedValue('kc-uuid-001'),
    assignRealmRole: vi.fn().mockResolvedValue(undefined),
    disableUser: vi.fn().mockResolvedValue(undefined),
    updateUser: vi.fn().mockResolvedValue(undefined),
  },
}));

// Set up a SCIM API key for testing
process.env.SCIM_API_KEY_TENANT_001 = 'test-scim-api-key-tenant-001';
process.env.SCIM_API_KEY_TENANT_002 = 'test-scim-api-key-tenant-002';

import { scimRouter } from '../routes';
import { auditService } from '../../../services/audit.service';
import { keycloakAdmin } from '../../../services/keycloak-admin';
import {
  SCIM_USER_SCHEMA,
  SCIM_SERVANDA_EXTENSION,
  SCIM_LIST_RESPONSE_SCHEMA,
  SCIM_ERROR_SCHEMA,
} from '../../../services/scim-provisioning';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockReqRes(overrides: {
  method?: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  baseUrl?: string;
  protocol?: string;
} = {}) {
  return {
    req: {
      method: overrides.method ?? 'GET',
      params: overrides.params ?? {},
      query: overrides.query ?? {},
      body: overrides.body ?? {},
      headers: {
        authorization: 'Bearer test-scim-api-key-tenant-001',
        host: 'localhost:3000',
        ...overrides.headers,
      },
      baseUrl: overrides.baseUrl ?? '/api/v1/scim',
      protocol: overrides.protocol ?? 'https',
      ip: '127.0.0.1',
      get: vi.fn().mockImplementation((name: string) => {
        if (name === 'host') return 'localhost:3000';
        return undefined;
      }),
    } as any,
    res: {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
    } as any,
    next: vi.fn(),
  };
}

/**
 * Finds a route handler in the Express router stack.
 * Accounts for middleware layers (scimAuth, content-type setter).
 */
function findHandler(router: any, method: string, path: string) {
  const layer = router.stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${path} not found in SCIM router`);
  // Return the last handler in the route stack (the actual handler, after any middleware)
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

/**
 * Runs a handler through the SCIM auth and content-type middleware first,
 * then the actual handler.
 */
async function executeScimHandler(
  router: any,
  method: string,
  path: string,
  reqRes: ReturnType<typeof createMockReqRes>,
) {
  const { req, res, next } = reqRes;

  // Execute the middleware chain for the specific route
  const layer = router.stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${path} not found`);

  // Run all handlers in the route stack sequentially
  for (const routeLayer of layer.route.stack) {
    // If next was called with an error, stop
    if (next.mock.calls.some((c: any[]) => c[0] instanceof Error)) break;
    await routeLayer.handle(req, res, next);
  }
}

// Mock user data factory
function createMockUser(overrides: Partial<{
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  mfaEnabled: boolean;
  keycloakId: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}> = {}) {
  const now = new Date('2025-01-15T10:00:00Z');
  return {
    id: overrides.id ?? 'user-uuid-001',
    tenantId: overrides.tenantId ?? 'tenant-001',
    email: overrides.email ?? 'max@kanzlei.de',
    displayName: overrides.displayName ?? 'Max Mustermann',
    role: overrides.role ?? 'user',
    status: overrides.status ?? 'active',
    mfaEnabled: overrides.mfaEnabled ?? false,
    keycloakId: overrides.keycloakId ?? 'kc-uuid-001',
    lastLoginAt: overrides.lastLoginAt ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('SCIM Routes — Sprint 13', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Authentication — SCIM Bearer Token
  // =========================================================================

  describe('SCIM Authentication', () => {
    it('should reject requests without Authorization header', async () => {
      const { req, res, next } = createMockReqRes({
        headers: { authorization: undefined as any },
      });
      // Remove the authorization header entirely
      delete req.headers.authorization;

      await executeScimHandler(scimRouter, 'get', '/Users', { req, res, next });

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          message: 'Missing or invalid Authorization header',
        }),
      );
    });

    it('should reject requests with invalid SCIM API key', async () => {
      const { req, res, next } = createMockReqRes({
        headers: { authorization: 'Bearer invalid-key-12345' },
      });

      await executeScimHandler(scimRouter, 'get', '/Users', { req, res, next });

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          message: 'Invalid SCIM API key',
        }),
      );
    });

    it('should authenticate with valid tenant-specific API key', async () => {
      mockTx.user.findMany.mockResolvedValue([]);
      mockTx.user.count.mockResolvedValue(0);

      const { req, res, next } = createMockReqRes({
        headers: { authorization: 'Bearer test-scim-api-key-tenant-001' },
      });

      await executeScimHandler(scimRouter, 'get', '/Users', { req, res, next });

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          schemas: [SCIM_LIST_RESPONSE_SCHEMA],
          totalResults: 0,
        }),
      );
    });
  });

  // =========================================================================
  // Tenant Isolation
  // =========================================================================

  describe('Tenant Isolation', () => {
    it('should scope user listing to the tenant from the API key', async () => {
      const tenantUser = createMockUser({ tenantId: 'tenant-001' });
      mockTx.user.findMany.mockResolvedValue([tenantUser]);
      mockTx.user.count.mockResolvedValue(1);

      const { req, res, next } = createMockReqRes({
        headers: { authorization: 'Bearer test-scim-api-key-tenant-001' },
      });

      await executeScimHandler(scimRouter, 'get', '/Users', { req, res, next });

      const response = res.json.mock.calls[0][0];
      expect(response.totalResults).toBe(1);
      expect(response.Resources[0].id).toBe(tenantUser.id);
    });

    it('should use different tenant context for different API keys', async () => {
      mockTx.user.findMany.mockResolvedValue([]);
      mockTx.user.count.mockResolvedValue(0);

      const { req, res, next } = createMockReqRes({
        headers: { authorization: 'Bearer test-scim-api-key-tenant-002' },
      });

      await executeScimHandler(scimRouter, 'get', '/Users', { req, res, next });

      // Verify setTenantContext was called with the correct tenant
      const { setTenantContext } = await import('../../../shared/db');
      expect(setTenantContext).toHaveBeenCalledWith(
        expect.anything(),
        'tenant-002',
      );
    });
  });

  // =========================================================================
  // GET /Users — List Users
  // =========================================================================

  describe('GET /Users — List Users', () => {
    it('should return empty list when no users exist', async () => {
      mockTx.user.findMany.mockResolvedValue([]);
      mockTx.user.count.mockResolvedValue(0);

      const { req, res, next } = createMockReqRes();
      await executeScimHandler(scimRouter, 'get', '/Users', { req, res, next });

      const response = res.json.mock.calls[0][0];
      expect(response.schemas).toEqual([SCIM_LIST_RESPONSE_SCHEMA]);
      expect(response.totalResults).toBe(0);
      expect(response.Resources).toEqual([]);
      expect(response.startIndex).toBe(1);
    });

    it('should return users in SCIM format with correct schema mapping', async () => {
      const user = createMockUser();
      mockTx.user.findMany.mockResolvedValue([user]);
      mockTx.user.count.mockResolvedValue(1);

      const { req, res, next } = createMockReqRes();
      await executeScimHandler(scimRouter, 'get', '/Users', { req, res, next });

      const response = res.json.mock.calls[0][0];
      expect(response.totalResults).toBe(1);

      const scimUser = response.Resources[0];
      expect(scimUser.schemas).toContain(SCIM_USER_SCHEMA);
      expect(scimUser.schemas).toContain(SCIM_SERVANDA_EXTENSION);
      expect(scimUser.id).toBe(user.id);
      expect(scimUser.userName).toBe(user.email);
      expect(scimUser.displayName).toBe(user.displayName);
      expect(scimUser.active).toBe(true);
      expect(scimUser.emails).toEqual([
        { value: user.email, primary: true, type: 'work' },
      ]);
      expect(scimUser.meta.resourceType).toBe('User');
      expect(scimUser[SCIM_SERVANDA_EXTENSION]).toEqual({
        role: user.role,
        tenantId: user.tenantId,
        mfaEnabled: user.mfaEnabled,
      });
    });

    it('should support SCIM filter: userName eq "value"', async () => {
      const user = createMockUser({ email: 'filtered@kanzlei.de' });
      mockTx.user.findMany.mockResolvedValue([user]);
      mockTx.user.count.mockResolvedValue(1);

      const { req, res, next } = createMockReqRes({
        query: { filter: 'userName eq "filtered@kanzlei.de"' },
      });

      await executeScimHandler(scimRouter, 'get', '/Users', { req, res, next });

      // Verify that the filter was applied (user.findMany called with email filter)
      expect(mockTx.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            email: 'filtered@kanzlei.de',
          }),
        }),
      );
    });
  });

  // =========================================================================
  // GET /Users/:id — Get Single User
  // =========================================================================

  describe('GET /Users/:id — Get Single User', () => {
    it('should return user in SCIM format', async () => {
      const user = createMockUser();
      mockTx.user.findFirst.mockResolvedValue(user);

      const { req, res, next } = createMockReqRes({
        params: { id: user.id },
      });

      await executeScimHandler(scimRouter, 'get', '/Users/:id', { req, res, next });

      const response = res.json.mock.calls[0][0];
      expect(response.id).toBe(user.id);
      expect(response.userName).toBe(user.email);
      expect(response.meta.location).toContain(`/Users/${user.id}`);
    });

    it('should return 404 for non-existent user', async () => {
      mockTx.user.findFirst.mockResolvedValue(null);

      const { req, res, next } = createMockReqRes({
        params: { id: 'nonexistent-uuid' },
      });

      await executeScimHandler(scimRouter, 'get', '/Users/:id', { req, res, next });

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          schemas: [SCIM_ERROR_SCHEMA],
          status: '404',
        }),
      );
    });
  });

  // =========================================================================
  // POST /Users — Create User
  // =========================================================================

  describe('POST /Users — Create User', () => {
    it('should create user from SCIM request and return 201', async () => {
      const newUser = createMockUser({
        email: 'new@kanzlei.de',
        displayName: 'Neue Nutzerin',
      });

      // No existing user
      mockTx.user.findUnique.mockResolvedValue(null);
      mockTx.user.create.mockResolvedValue(newUser);

      const { req, res, next } = createMockReqRes({
        body: {
          schemas: [SCIM_USER_SCHEMA],
          userName: 'new@kanzlei.de',
          displayName: 'Neue Nutzerin',
          active: true,
          emails: [{ value: 'new@kanzlei.de', primary: true, type: 'work' }],
        },
      });

      await executeScimHandler(scimRouter, 'post', '/Users', { req, res, next });

      expect(res.status).toHaveBeenCalledWith(201);
      const response = res.json.mock.calls[0][0];
      expect(response.userName).toBe('new@kanzlei.de');
      expect(response.displayName).toBe('Neue Nutzerin');
      expect(response.schemas).toContain(SCIM_USER_SCHEMA);

      // Verify Keycloak sync was triggered
      expect(keycloakAdmin.createUser).toHaveBeenCalledWith(
        'new@kanzlei.de',
        'Neue Nutzerin',
      );

      // Verify audit log
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-001' }),
        expect.objectContaining({
          action: 'user.invite',
          objectType: 'user',
          details: expect.objectContaining({ source: 'scim' }),
        }),
      );
    });

    it('should return 409 when user already exists', async () => {
      const existing = createMockUser({ email: 'existing@kanzlei.de' });
      mockTx.user.findUnique.mockResolvedValue(existing);

      const { req, res, next } = createMockReqRes({
        body: {
          schemas: [SCIM_USER_SCHEMA],
          userName: 'existing@kanzlei.de',
          active: true,
        },
      });

      await executeScimHandler(scimRouter, 'post', '/Users', { req, res, next });

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          schemas: [SCIM_ERROR_SCHEMA],
          status: '409',
          scimType: 'uniqueness',
        }),
      );
    });

    it('should reject creation without userName or emails', async () => {
      const { req, res, next } = createMockReqRes({
        body: {
          schemas: [SCIM_USER_SCHEMA],
          displayName: 'No Email User',
        },
      });

      await executeScimHandler(scimRouter, 'post', '/Users', { req, res, next });

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          schemas: [SCIM_ERROR_SCHEMA],
          status: '400',
        }),
      );
    });

    it('should map SCIM role extension to internal role', async () => {
      const newUser = createMockUser({
        email: 'editor@kanzlei.de',
        displayName: 'Editor User',
        role: 'editor',
      });

      mockTx.user.findUnique.mockResolvedValue(null);
      mockTx.user.create.mockResolvedValue(newUser);

      const { req, res, next } = createMockReqRes({
        body: {
          schemas: [SCIM_USER_SCHEMA, SCIM_SERVANDA_EXTENSION],
          userName: 'editor@kanzlei.de',
          displayName: 'Editor User',
          active: true,
          [SCIM_SERVANDA_EXTENSION]: {
            role: 'editor',
          },
        },
      });

      await executeScimHandler(scimRouter, 'post', '/Users', { req, res, next });

      // Verify role was passed to user creation
      expect(mockTx.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'editor',
          }),
        }),
      );
    });
  });

  // =========================================================================
  // PATCH /Users/:id — Update User
  // =========================================================================

  describe('PATCH /Users/:id — Update User', () => {
    it('should update user via SCIM PATCH operations', async () => {
      const existing = createMockUser();
      const updated = { ...existing, displayName: 'Updated Name' };

      mockTx.user.findFirst.mockResolvedValue(existing);
      mockTx.user.update.mockResolvedValue(updated);

      const { req, res, next } = createMockReqRes({
        params: { id: existing.id },
        body: {
          schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
          Operations: [
            { op: 'replace', path: 'displayName', value: 'Updated Name' },
          ],
        },
      });

      await executeScimHandler(scimRouter, 'patch', '/Users/:id', { req, res, next });

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Updated Name',
        }),
      );

      expect(mockTx.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ displayName: 'Updated Name' }),
        }),
      );
    });

    it('should deactivate user via active=false PATCH', async () => {
      const existing = createMockUser({ status: 'active' });
      const updated = { ...existing, status: 'inactive' };

      mockTx.user.findFirst.mockResolvedValue(existing);
      mockTx.user.update.mockResolvedValue(updated);

      const { req, res, next } = createMockReqRes({
        params: { id: existing.id },
        body: {
          schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
          Operations: [
            { op: 'replace', path: 'active', value: false },
          ],
        },
      });

      await executeScimHandler(scimRouter, 'patch', '/Users/:id', { req, res, next });

      expect(mockTx.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'inactive' }),
        }),
      );

      // Verify Keycloak sync
      expect(keycloakAdmin.updateUser).toHaveBeenCalledWith(
        existing.keycloakId,
        { enabled: false },
      );
    });

    it('should return 404 for non-existent user PATCH', async () => {
      mockTx.user.findFirst.mockResolvedValue(null);

      const { req, res, next } = createMockReqRes({
        params: { id: 'nonexistent-uuid' },
        body: {
          schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
          Operations: [
            { op: 'replace', path: 'displayName', value: 'Test' },
          ],
        },
      });

      await executeScimHandler(scimRouter, 'patch', '/Users/:id', { req, res, next });

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should reject PATCH without Operations array', async () => {
      const { req, res, next } = createMockReqRes({
        params: { id: 'user-uuid-001' },
        body: {
          schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
          // Missing Operations
        },
      });

      await executeScimHandler(scimRouter, 'patch', '/Users/:id', { req, res, next });

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          schemas: [SCIM_ERROR_SCHEMA],
          scimType: 'invalidSyntax',
        }),
      );
    });
  });

  // =========================================================================
  // DELETE /Users/:id — Deactivate User
  // =========================================================================

  describe('DELETE /Users/:id — Deactivate User', () => {
    it('should deactivate user and return 204', async () => {
      const existing = createMockUser();
      mockTx.user.findFirst.mockResolvedValue(existing);
      mockTx.user.update.mockResolvedValue({ ...existing, status: 'inactive' });

      const { req, res, next } = createMockReqRes({
        params: { id: existing.id },
      });

      await executeScimHandler(scimRouter, 'delete', '/Users/:id', { req, res, next });

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();

      // Verify user was set to inactive
      expect(mockTx.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'inactive' },
        }),
      );

      // Verify Keycloak sync
      expect(keycloakAdmin.disableUser).toHaveBeenCalledWith(existing.keycloakId);

      // Verify audit log
      expect(auditService.log).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'user.deactivate',
          details: expect.objectContaining({ source: 'scim' }),
        }),
      );
    });

    it('should return 404 for non-existent user DELETE', async () => {
      mockTx.user.findFirst.mockResolvedValue(null);

      const { req, res, next } = createMockReqRes({
        params: { id: 'nonexistent-uuid' },
      });

      await executeScimHandler(scimRouter, 'delete', '/Users/:id', { req, res, next });

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  // =========================================================================
  // GET /ServiceProviderConfig
  // =========================================================================

  describe('GET /ServiceProviderConfig', () => {
    it('should return SCIM service provider configuration', async () => {
      const { req, res, next } = createMockReqRes();

      await executeScimHandler(scimRouter, 'get', '/ServiceProviderConfig', { req, res, next });

      const response = res.json.mock.calls[0][0];
      expect(response.schemas).toContain('urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig');
      expect(response.patch.supported).toBe(true);
      expect(response.bulk.supported).toBe(false);
      expect(response.filter.supported).toBe(true);
      expect(response.authenticationSchemes).toHaveLength(1);
      expect(response.authenticationSchemes[0].type).toBe('oauthbearertoken');
    });
  });

  // =========================================================================
  // GET /Schemas
  // =========================================================================

  describe('GET /Schemas', () => {
    it('should return supported SCIM schemas', async () => {
      const { req, res, next } = createMockReqRes();

      await executeScimHandler(scimRouter, 'get', '/Schemas', { req, res, next });

      const response = res.json.mock.calls[0][0];
      expect(response.schemas).toEqual([SCIM_LIST_RESPONSE_SCHEMA]);
      expect(response.totalResults).toBe(2);
      expect(response.Resources).toHaveLength(2);

      const schemaIds = response.Resources.map((r: any) => r.id);
      expect(schemaIds).toContain(SCIM_USER_SCHEMA);
      expect(schemaIds).toContain(SCIM_SERVANDA_EXTENSION);
    });
  });

  // =========================================================================
  // Schema Mapping — SCIM ↔ Internal User Model
  // =========================================================================

  describe('Schema Mapping', () => {
    it('should map inactive user to active=false in SCIM response', async () => {
      const inactiveUser = createMockUser({ status: 'inactive' });
      mockTx.user.findFirst.mockResolvedValue(inactiveUser);

      const { req, res, next } = createMockReqRes({
        params: { id: inactiveUser.id },
      });

      await executeScimHandler(scimRouter, 'get', '/Users/:id', { req, res, next });

      const response = res.json.mock.calls[0][0];
      expect(response.active).toBe(false);
    });

    it('should map displayName to SCIM name.formatted and givenName/familyName', async () => {
      const user = createMockUser({ displayName: 'Anna Maria Schmidt' });
      mockTx.user.findFirst.mockResolvedValue(user);

      const { req, res, next } = createMockReqRes({
        params: { id: user.id },
      });

      await executeScimHandler(scimRouter, 'get', '/Users/:id', { req, res, next });

      const response = res.json.mock.calls[0][0];
      expect(response.name.formatted).toBe('Anna Maria Schmidt');
      expect(response.name.givenName).toBe('Anna');
      expect(response.name.familyName).toBe('Maria Schmidt');
    });

    it('should include meta with resourceType, created, lastModified, location', async () => {
      const user = createMockUser();
      mockTx.user.findFirst.mockResolvedValue(user);

      const { req, res, next } = createMockReqRes({
        params: { id: user.id },
      });

      await executeScimHandler(scimRouter, 'get', '/Users/:id', { req, res, next });

      const response = res.json.mock.calls[0][0];
      expect(response.meta).toEqual(
        expect.objectContaining({
          resourceType: 'User',
          created: user.createdAt.toISOString(),
          lastModified: user.updatedAt.toISOString(),
          location: expect.stringContaining(`/Users/${user.id}`),
        }),
      );
    });
  });
});
