/**
 * KeycloakAdminService Unit-Tests — Sprint 11 (Team 02)
 *
 * Full unit-test coverage for KeycloakAdminService.
 * global.fetch is mocked completely — no network calls.
 * pino logger is mocked to verify error-isolation behaviour.
 *
 * Design principle under test: ALL public methods catch errors internally,
 * log via pino, and NEVER throw — Keycloak sync must not block the caller.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock logger — capture all log calls for assertion
// ---------------------------------------------------------------------------

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock('../../shared/logger', () => ({
  logger: mockLogger,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal Response-like object for mocking fetch. */
function mockResponse(
  status: number,
  body: unknown = {},
  headers: Record<string, string> = {},
): Response {
  const headersObj = new Headers(headers);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: headersObj,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

/** Standard token response from Keycloak. */
function tokenResponse(expiresIn = 300): Response {
  return mockResponse(200, {
    access_token: 'mock-admin-token',
    expires_in: expiresIn,
    token_type: 'Bearer',
  });
}

/** Standard token response with a different token value (for refresh scenarios). */
function refreshedTokenResponse(): Response {
  return mockResponse(200, {
    access_token: 'refreshed-admin-token',
    expires_in: 300,
    token_type: 'Bearer',
  });
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('KeycloakAdminService', () => {
  let KeycloakAdminService: typeof import('../keycloak-admin').KeycloakAdminService;
  let service: InstanceType<typeof KeycloakAdminService>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();

    // Re-mock logger after resetModules
    vi.doMock('../../shared/logger', () => ({
      logger: mockLogger,
    }));

    // Reset logger mocks
    mockLogger.info.mockReset();
    mockLogger.warn.mockReset();
    mockLogger.error.mockReset();
    mockLogger.debug.mockReset();

    // Setup fetch spy
    fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    // Import fresh module
    const mod = await import('../keycloak-admin');
    KeycloakAdminService = mod.KeycloakAdminService;
    service = new KeycloakAdminService();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // getAdminToken (tested indirectly via public methods that trigger it)
  // =========================================================================

  describe('getAdminToken (via createUser)', () => {
    it('obtains token via Resource Owner Password Credentials Grant', async () => {
      // Token call + createUser call
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(
          mockResponse(201, '', { Location: 'http://localhost:8080/admin/realms/servanda/users/kc-uuid-123' }),
        );

      await service.createUser('test@example.com', 'Max Mustermann');

      // First call should be token request
      const tokenCall = fetchSpy.mock.calls[0];
      expect(tokenCall[0]).toContain('/realms/master/protocol/openid-connect/token');
      expect(tokenCall[1].method).toBe('POST');
      expect(tokenCall[1].headers['Content-Type']).toBe('application/x-www-form-urlencoded');

      const bodyStr = tokenCall[1].body;
      expect(bodyStr).toContain('grant_type=password');
      expect(bodyStr).toContain('client_id=admin-cli');
      expect(bodyStr).toContain('username=admin');
      expect(bodyStr).toContain('password=admin');
    });

    it('caches token — second call does not re-fetch', async () => {
      // First operation: token + createUser
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(
          mockResponse(201, '', { Location: 'http://localhost:8080/admin/realms/servanda/users/kc-uuid-1' }),
        );

      await service.createUser('a@example.com', 'User A');
      expect(fetchSpy).toHaveBeenCalledTimes(2); // token + createUser

      // Second operation: only createUser (token is cached)
      fetchSpy.mockResolvedValueOnce(
        mockResponse(201, '', { Location: 'http://localhost:8080/admin/realms/servanda/users/kc-uuid-2' }),
      );

      await service.createUser('b@example.com', 'User B');
      expect(fetchSpy).toHaveBeenCalledTimes(3); // NO additional token call
    });

    it('refreshes token after expiry (with 30s buffer)', async () => {
      // First operation: token (expires in 60s) + createUser
      fetchSpy
        .mockResolvedValueOnce(tokenResponse(60)) // 60s - 30s buffer = 30s valid
        .mockResolvedValueOnce(
          mockResponse(201, '', { Location: 'http://localhost:8080/admin/realms/servanda/users/kc-uuid-1' }),
        );

      await service.createUser('a@example.com', 'User A');
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      // Advance time past the effective expiry (60 - 30 = 30s buffer)
      vi.advanceTimersByTime(31_000);

      // Second operation: should re-fetch token + createUser
      fetchSpy
        .mockResolvedValueOnce(refreshedTokenResponse())
        .mockResolvedValueOnce(
          mockResponse(201, '', { Location: 'http://localhost:8080/admin/realms/servanda/users/kc-uuid-2' }),
        );

      await service.createUser('b@example.com', 'User B');
      expect(fetchSpy).toHaveBeenCalledTimes(4); // new token + createUser

      // Verify the new token was used
      const lastCreateCall = fetchSpy.mock.calls[3];
      expect(lastCreateCall[1].headers.Authorization).toBe('Bearer refreshed-admin-token');
    });
  });

  // =========================================================================
  // createUser
  // =========================================================================

  describe('createUser', () => {
    it('creates user in Keycloak and returns keycloakId from Location header', async () => {
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(
          mockResponse(201, '', {
            Location: 'http://localhost:8080/admin/realms/servanda/users/kc-uuid-abc',
          }),
        );

      const result = await service.createUser('max@kanzlei.de', 'Max Mustermann', 'temp123');

      expect(result).toBe('kc-uuid-abc');

      // Verify the POST payload
      const createCall = fetchSpy.mock.calls[1];
      expect(createCall[0]).toContain('/users');
      expect(createCall[1].method).toBe('POST');

      const payload = JSON.parse(createCall[1].body);
      expect(payload).toEqual(
        expect.objectContaining({
          username: 'max@kanzlei.de',
          email: 'max@kanzlei.de',
          firstName: 'Max',
          lastName: 'Mustermann',
          enabled: true,
          emailVerified: true,
          credentials: [{ type: 'password', value: 'temp123', temporary: true }],
        }),
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'max@kanzlei.de', keycloakId: 'kc-uuid-abc' }),
        'Keycloak user created',
      );
    });

    it('splits display name correctly (single word = firstName only)', async () => {
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(
          mockResponse(201, '', {
            Location: 'http://localhost:8080/admin/realms/servanda/users/kc-uuid-single',
          }),
        );

      await service.createUser('solo@example.com', 'Solo');

      const payload = JSON.parse(fetchSpy.mock.calls[1][1].body);
      expect(payload.firstName).toBe('Solo');
      expect(payload.lastName).toBeUndefined();
    });

    it('does not include credentials when no tempPassword is provided', async () => {
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(
          mockResponse(201, '', {
            Location: 'http://localhost:8080/admin/realms/servanda/users/kc-uuid-nopass',
          }),
        );

      await service.createUser('nopass@example.com', 'No Password');

      const payload = JSON.parse(fetchSpy.mock.calls[1][1].body);
      expect(payload.credentials).toBeUndefined();
    });

    it('returns null and logs warning on 409 conflict (user already exists)', async () => {
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(mockResponse(409, { errorMessage: 'User exists' }));

      const result = await service.createUser('existing@example.com', 'Existing User');

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'existing@example.com' }),
        'Keycloak user already exists',
      );
    });

    it('returns null and logs error on 500 server error', async () => {
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(mockResponse(500, 'Internal Server Error'));

      const result = await service.createUser('error@example.com', 'Error User');

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'error@example.com', status: 500 }),
        'Keycloak createUser failed',
      );
    });

    it('returns null and logs error on network failure — never throws', async () => {
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        .mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await service.createUser('net@example.com', 'Net User');

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'net@example.com' }),
        'Keycloak createUser error',
      );
    });

    it('returns null when token acquisition itself fails — error isolation', async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse(401, 'Unauthorized'));

      const result = await service.createUser('token-fail@example.com', 'Token Fail');

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // updateUser
  // =========================================================================

  describe('updateUser', () => {
    it('sends PUT with user data', async () => {
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(mockResponse(204));

      await service.updateUser('kc-id-1', { email: 'new@example.com', enabled: false });

      const updateCall = fetchSpy.mock.calls[1];
      expect(updateCall[0]).toContain('/users/kc-id-1');
      expect(updateCall[1].method).toBe('PUT');
      expect(JSON.parse(updateCall[1].body)).toEqual({
        email: 'new@example.com',
        enabled: false,
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          keycloakId: 'kc-id-1',
          updates: { email: 'new@example.com', enabled: false },
        }),
        'Keycloak user updated',
      );
    });

    it('logs error on non-ok response — never throws', async () => {
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(mockResponse(404, 'Not Found'));

      await expect(
        service.updateUser('kc-missing', { email: 'x@x.com' }),
      ).resolves.toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ keycloakId: 'kc-missing', status: 404 }),
        'Keycloak updateUser failed',
      );
    });

    it('catches network errors — never throws', async () => {
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        .mockRejectedValueOnce(new TypeError('fetch failed'));

      await expect(
        service.updateUser('kc-net', { enabled: true }),
      ).resolves.toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ keycloakId: 'kc-net' }),
        'Keycloak updateUser error',
      );
    });
  });

  // =========================================================================
  // deleteUser
  // =========================================================================

  describe('deleteUser', () => {
    it('sends DELETE request', async () => {
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(mockResponse(204));

      await service.deleteUser('kc-del-1');

      const deleteCall = fetchSpy.mock.calls[1];
      expect(deleteCall[0]).toContain('/users/kc-del-1');
      expect(deleteCall[1].method).toBe('DELETE');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ keycloakId: 'kc-del-1' }),
        'Keycloak user deleted',
      );
    });

    it('treats 404 as success (user already gone)', async () => {
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(mockResponse(404));

      await service.deleteUser('kc-already-gone');

      // Should NOT log error for 404
      expect(mockLogger.error).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ keycloakId: 'kc-already-gone' }),
        'Keycloak user deleted',
      );
    });

    it('logs error on 500 — never throws', async () => {
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(mockResponse(500, 'Server Error'));

      await expect(service.deleteUser('kc-err')).resolves.toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ keycloakId: 'kc-err', status: 500 }),
        'Keycloak deleteUser failed',
      );
    });

    it('catches network errors — never throws', async () => {
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        .mockRejectedValueOnce(new Error('Network unreachable'));

      await expect(service.deleteUser('kc-net-del')).resolves.toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ keycloakId: 'kc-net-del' }),
        'Keycloak deleteUser error',
      );
    });
  });

  // =========================================================================
  // enableUser / disableUser
  // =========================================================================

  describe('enableUser', () => {
    it('sends PUT with enabled=true', async () => {
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(mockResponse(204));

      await service.enableUser('kc-enable-1');

      const putCall = fetchSpy.mock.calls[1];
      expect(putCall[0]).toContain('/users/kc-enable-1');
      expect(putCall[1].method).toBe('PUT');
      expect(JSON.parse(putCall[1].body)).toEqual({ enabled: true });
    });
  });

  describe('disableUser', () => {
    it('sends PUT with enabled=false', async () => {
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(mockResponse(204));

      await service.disableUser('kc-disable-1');

      const putCall = fetchSpy.mock.calls[1];
      expect(putCall[0]).toContain('/users/kc-disable-1');
      expect(putCall[1].method).toBe('PUT');
      expect(JSON.parse(putCall[1].body)).toEqual({ enabled: false });
    });
  });

  // =========================================================================
  // requireMfa
  // =========================================================================

  describe('requireMfa', () => {
    it('reads existing required actions and merges CONFIGURE_TOTP', async () => {
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        // GET user
        .mockResolvedValueOnce(
          mockResponse(200, { requiredActions: ['VERIFY_EMAIL'] }),
        )
        // PUT user
        .mockResolvedValueOnce(mockResponse(204));

      await service.requireMfa('kc-mfa-1');

      // GET request to fetch user
      const getCall = fetchSpy.mock.calls[1];
      expect(getCall[0]).toContain('/users/kc-mfa-1');
      expect(getCall[1].method).toBeUndefined(); // default GET

      // PUT request with merged actions
      const putCall = fetchSpy.mock.calls[2];
      expect(putCall[0]).toContain('/users/kc-mfa-1');
      expect(putCall[1].method).toBe('PUT');
      expect(JSON.parse(putCall[1].body)).toEqual({
        requiredActions: ['VERIFY_EMAIL', 'CONFIGURE_TOTP'],
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ keycloakId: 'kc-mfa-1' }),
        'Keycloak CONFIGURE_TOTP required action set',
      );
    });

    it('does not duplicate CONFIGURE_TOTP if already present', async () => {
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(
          mockResponse(200, { requiredActions: ['CONFIGURE_TOTP', 'UPDATE_PASSWORD'] }),
        )
        .mockResolvedValueOnce(mockResponse(204));

      await service.requireMfa('kc-mfa-dup');

      const putCall = fetchSpy.mock.calls[2];
      const payload = JSON.parse(putCall[1].body);
      expect(payload.requiredActions).toEqual(['CONFIGURE_TOTP', 'UPDATE_PASSWORD']);
      // Ensure no duplicate
      expect(payload.requiredActions.filter((a: string) => a === 'CONFIGURE_TOTP')).toHaveLength(1);
    });

    it('handles empty requiredActions (undefined)', async () => {
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(mockResponse(200, {})) // no requiredActions field
        .mockResolvedValueOnce(mockResponse(204));

      await service.requireMfa('kc-mfa-empty');

      const putCall = fetchSpy.mock.calls[2];
      expect(JSON.parse(putCall[1].body)).toEqual({
        requiredActions: ['CONFIGURE_TOTP'],
      });
    });

    it('logs error if GET user fails — never throws', async () => {
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(mockResponse(404, 'Not Found'));

      await expect(service.requireMfa('kc-mfa-404')).resolves.toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ keycloakId: 'kc-mfa-404', status: 404 }),
        'Keycloak requireMfa — failed to fetch user',
      );
    });

    it('logs error if PUT update fails — never throws', async () => {
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(mockResponse(200, { requiredActions: [] }))
        .mockResolvedValueOnce(mockResponse(500, 'Server Error'));

      await expect(service.requireMfa('kc-mfa-put-fail')).resolves.toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ keycloakId: 'kc-mfa-put-fail', status: 500 }),
        'Keycloak requireMfa failed',
      );
    });

    it('catches network error — never throws', async () => {
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        .mockRejectedValueOnce(new Error('ETIMEDOUT'));

      await expect(service.requireMfa('kc-mfa-net')).resolves.toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ keycloakId: 'kc-mfa-net' }),
        'Keycloak requireMfa error',
      );
    });
  });

  // =========================================================================
  // assignRealmRole
  // =========================================================================

  describe('assignRealmRole', () => {
    it('performs two-step: role lookup then role-mapping POST', async () => {
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        // Role lookup GET
        .mockResolvedValueOnce(
          mockResponse(200, { id: 'role-uuid-editor', name: 'editor', composite: false }),
        )
        // Role mapping POST
        .mockResolvedValueOnce(mockResponse(204));

      await service.assignRealmRole('kc-user-1', 'editor');

      // Step 1: Role lookup
      const roleCall = fetchSpy.mock.calls[1];
      expect(roleCall[0]).toContain('/roles/editor');

      // Step 2: Role mapping
      const mapCall = fetchSpy.mock.calls[2];
      expect(mapCall[0]).toContain('/users/kc-user-1/role-mappings/realm');
      expect(mapCall[1].method).toBe('POST');
      expect(JSON.parse(mapCall[1].body)).toEqual([
        { id: 'role-uuid-editor', name: 'editor' },
      ]);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ keycloakId: 'kc-user-1', roleName: 'editor' }),
        'Keycloak realm role assigned',
      );
    });

    it('logs error and returns early if role lookup fails — never throws', async () => {
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(mockResponse(404, 'Role not found'));

      await expect(
        service.assignRealmRole('kc-user-1', 'nonexistent-role'),
      ).resolves.toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ roleName: 'nonexistent-role', status: 404 }),
        'Keycloak assignRealmRole — role lookup failed',
      );
      // Should NOT have made the mapping call
      expect(fetchSpy).toHaveBeenCalledTimes(2); // token + role lookup only
    });

    it('logs error if role mapping POST fails — never throws', async () => {
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(
          mockResponse(200, { id: 'role-uuid-admin', name: 'admin' }),
        )
        .mockResolvedValueOnce(mockResponse(500, 'Mapping failed'));

      await expect(
        service.assignRealmRole('kc-user-2', 'admin'),
      ).resolves.toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ keycloakId: 'kc-user-2', roleName: 'admin', status: 500 }),
        'Keycloak assignRealmRole failed',
      );
    });

    it('catches network error — never throws', async () => {
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        .mockRejectedValueOnce(new Error('DNS resolution failed'));

      await expect(
        service.assignRealmRole('kc-user-3', 'user'),
      ).resolves.toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ keycloakId: 'kc-user-3', roleName: 'user' }),
        'Keycloak assignRealmRole error',
      );
    });
  });

  // =========================================================================
  // Error Isolation — cross-cutting
  // =========================================================================

  describe('error isolation', () => {
    it('createUser never throws even on complete fetch failure', async () => {
      fetchSpy.mockRejectedValue(new Error('Total network failure'));
      const result = await service.createUser('e@x.com', 'E X');
      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('updateUser never throws even on complete fetch failure', async () => {
      fetchSpy.mockRejectedValue(new Error('Total network failure'));
      await expect(service.updateUser('id', { enabled: true })).resolves.toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('deleteUser never throws even on complete fetch failure', async () => {
      fetchSpy.mockRejectedValue(new Error('Total network failure'));
      await expect(service.deleteUser('id')).resolves.toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('enableUser never throws even on complete fetch failure', async () => {
      fetchSpy.mockRejectedValue(new Error('Total network failure'));
      await expect(service.enableUser('id')).resolves.toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('disableUser never throws even on complete fetch failure', async () => {
      fetchSpy.mockRejectedValue(new Error('Total network failure'));
      await expect(service.disableUser('id')).resolves.toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('requireMfa never throws even on complete fetch failure', async () => {
      fetchSpy.mockRejectedValue(new Error('Total network failure'));
      await expect(service.requireMfa('id')).resolves.toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('assignRealmRole never throws even on complete fetch failure', async () => {
      fetchSpy.mockRejectedValue(new Error('Total network failure'));
      await expect(service.assignRealmRole('id', 'role')).resolves.toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // clearTokenCache
  // =========================================================================

  describe('clearTokenCache', () => {
    it('forces re-authentication on next call', async () => {
      // First call: token + createUser
      fetchSpy
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(
          mockResponse(201, '', {
            Location: 'http://localhost:8080/admin/realms/servanda/users/kc-1',
          }),
        );

      await service.createUser('a@x.com', 'A');
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      // Clear cache
      service.clearTokenCache();

      // Next call should fetch a new token
      fetchSpy
        .mockResolvedValueOnce(refreshedTokenResponse())
        .mockResolvedValueOnce(
          mockResponse(201, '', {
            Location: 'http://localhost:8080/admin/realms/servanda/users/kc-2',
          }),
        );

      await service.createUser('b@x.com', 'B');
      expect(fetchSpy).toHaveBeenCalledTimes(4); // 2 original + 2 new (token + create)
    });
  });
});
