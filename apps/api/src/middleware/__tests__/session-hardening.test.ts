/**
 * Session-Hardening Middleware Unit-Tests — Sprint 12 (Team 02)
 *
 * Covers:
 * - tokenFingerprint: Deterministic hashing, different inputs produce different hashes
 * - idleTimeoutCheck: Within timeout -> pass, beyond -> 401
 * - concurrentSessionCheck: Under limit -> pass, over limit -> 429
 * - logoutHandler: Invalidates session + audit log
 * - backchannelLogoutHandler: Processes valid/invalid logout_token
 *
 * All tests use mock Express req/res objects — no network calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock logger
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
// Mock audit service
// ---------------------------------------------------------------------------

const mockAuditLog = vi.fn().mockResolvedValue(undefined);

vi.mock('../../services/audit.service', () => ({
  auditService: {
    log: mockAuditLog,
  },
}));

// ---------------------------------------------------------------------------
// Mock keycloak-admin
// ---------------------------------------------------------------------------

vi.mock('../../services/keycloak-admin', () => ({
  keycloakAdmin: {
    logoutUser: vi.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import type { Request, Response, NextFunction } from 'express';

/** Creates a mock Express Request. */
function mockRequest(overrides: Partial<Request> & Record<string, unknown> = {}): Request {
  const req = {
    headers: {
      'user-agent': 'TestBrowser/1.0',
      ...((overrides.headers as Record<string, string>) ?? {}),
    },
    ip: '192.168.1.42',
    socket: { remoteAddress: '192.168.1.42' },
    body: {},
    ...overrides,
  } as unknown as Request;

  return req;
}

/** Creates a mock Express Response with chainable methods. */
function mockResponse(): Response & { _status: number; _json: unknown } {
  const res = {
    _status: 0,
    _json: null as unknown,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: unknown) {
      res._json = body;
      return res;
    },
    set: vi.fn().mockReturnThis(),
  } as unknown as Response & { _status: number; _json: unknown };
  return res;
}

/** Creates a mock NextFunction that captures errors. */
function mockNext(): NextFunction & { error: unknown; called: boolean } {
  const fn = ((err?: unknown) => {
    fn.error = err ?? null;
    fn.called = true;
  }) as NextFunction & { error: unknown; called: boolean };
  fn.error = null;
  fn.called = false;
  return fn;
}

/**
 * Encodes a JWT payload as a mock token (header.payload.signature).
 * No real cryptographic signature — for testing only.
 */
function createMockJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = 'mock-signature';
  return `${header}.${body}.${signature}`;
}

// ---------------------------------------------------------------------------
// Import module under test (after mocks are set up)
// ---------------------------------------------------------------------------

import {
  tokenFingerprint,
  sessionHardening,
  idleTimeoutCheck,
  concurrentSessionCheck,
  logoutHandler,
  backchannelLogoutHandler,
  clearSessionState,
  lastActiveMap,
  userSessionsMap,
  invalidatedSessions,
  IDLE_TIMEOUT_MS,
  MAX_CONCURRENT_SESSIONS,
} from '../session-hardening';

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Session Hardening Middleware', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearSessionState();
    mockLogger.info.mockReset();
    mockLogger.warn.mockReset();
    mockLogger.error.mockReset();
    mockLogger.debug.mockReset();
    mockAuditLog.mockReset();
    mockAuditLog.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // tokenFingerprint
  // =========================================================================

  describe('tokenFingerprint', () => {
    it('produces a deterministic hash for the same input', () => {
      const req1 = mockRequest({ ip: '10.0.0.1', headers: { 'user-agent': 'Chrome/120' } });
      const req2 = mockRequest({ ip: '10.0.0.1', headers: { 'user-agent': 'Chrome/120' } });

      const fp1 = tokenFingerprint(req1);
      const fp2 = tokenFingerprint(req2);

      expect(fp1).toBe(fp2);
      expect(fp1).toHaveLength(64); // SHA-256 hex = 64 chars
    });

    it('produces different hashes for different User-Agents', () => {
      const req1 = mockRequest({ ip: '10.0.0.1', headers: { 'user-agent': 'Chrome/120' } });
      const req2 = mockRequest({ ip: '10.0.0.1', headers: { 'user-agent': 'Firefox/115' } });

      expect(tokenFingerprint(req1)).not.toBe(tokenFingerprint(req2));
    });

    it('produces different hashes for different /24 subnets', () => {
      const req1 = mockRequest({ ip: '10.0.1.100', headers: { 'user-agent': 'Chrome/120' } });
      const req2 = mockRequest({ ip: '10.0.2.100', headers: { 'user-agent': 'Chrome/120' } });

      expect(tokenFingerprint(req1)).not.toBe(tokenFingerprint(req2));
    });

    it('produces the SAME hash for different IPs in the same /24 subnet', () => {
      const req1 = mockRequest({ ip: '10.0.1.50', headers: { 'user-agent': 'Chrome/120' } });
      const req2 = mockRequest({ ip: '10.0.1.200', headers: { 'user-agent': 'Chrome/120' } });

      expect(tokenFingerprint(req1)).toBe(tokenFingerprint(req2));
    });

    it('handles IPv4-mapped IPv6 addresses', () => {
      const req1 = mockRequest({ ip: '::ffff:192.168.1.42', headers: { 'user-agent': 'Chrome/120' } });
      const req2 = mockRequest({ ip: '192.168.1.99', headers: { 'user-agent': 'Chrome/120' } });

      // Both should resolve to the same /24 subnet (192.168.1)
      expect(tokenFingerprint(req1)).toBe(tokenFingerprint(req2));
    });

    it('handles missing user-agent gracefully', () => {
      const req = mockRequest({ ip: '10.0.0.1', headers: {} });

      const fp = tokenFingerprint(req);
      expect(fp).toHaveLength(64);
    });

    it('handles missing IP gracefully', () => {
      const req = mockRequest({
        ip: undefined as unknown as string,
        socket: { remoteAddress: undefined } as unknown as Request['socket'],
        headers: { 'user-agent': 'Chrome/120' },
      });

      const fp = tokenFingerprint(req);
      expect(fp).toHaveLength(64);
    });
  });

  // =========================================================================
  // sessionHardening
  // =========================================================================

  describe('sessionHardening', () => {
    it('passes through when no tenant context is set (unauthenticated)', async () => {
      const middleware = sessionHardening();
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      await middleware(req, res, next);

      expect(next.called).toBe(true);
      expect(next.error).toBeNull();
    });

    it('passes through when fingerprint matches sid_fp claim', async () => {
      const req = mockRequest({
        ip: '10.0.0.1',
        headers: {
          'user-agent': 'Chrome/120',
          'x-session-id': 'sess-123',
        },
      });

      // Compute the expected fingerprint
      const expectedFp = tokenFingerprint(req);

      // Set up authenticated request
      (req as Request & { tenant: unknown }).tenant = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        role: 'user',
      };
      (req as Request & { jwtPayload: unknown }).jwtPayload = {
        sid: 'sess-123',
        sid_fp: expectedFp,
      };

      const middleware = sessionHardening();
      const res = mockResponse();
      const next = mockNext();

      await middleware(req, res, next);

      expect(next.called).toBe(true);
      expect(next.error).toBeNull();
    });

    it('rejects with 401 when fingerprint does NOT match sid_fp claim', async () => {
      const req = mockRequest({
        ip: '10.0.0.1',
        headers: {
          'user-agent': 'Chrome/120',
          'x-session-id': 'sess-456',
        },
      });

      (req as Request & { tenant: unknown }).tenant = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        role: 'user',
      };
      (req as Request & { jwtPayload: unknown }).jwtPayload = {
        sid: 'sess-456',
        sid_fp: 'completely-wrong-fingerprint-value-that-does-not-match-anything',
      };

      const middleware = sessionHardening();
      const res = mockResponse();
      const next = mockNext();

      await middleware(req, res, next);

      expect(next.called).toBe(true);
      expect(next.error).not.toBeNull();
      const error = next.error as { statusCode: number; code: string };
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('SESSION_FINGERPRINT_MISMATCH');

      // Should log security event via audit service
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', tenantId: 'tenant-1' }),
        expect.objectContaining({ action: 'session.fingerprint_mismatch' }),
        expect.any(Object),
      );
    });

    it('rejects with 401 for invalidated sessions', async () => {
      const req = mockRequest({
        headers: { 'x-session-id': 'sess-invalidated' },
      });

      (req as Request & { tenant: unknown }).tenant = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        role: 'user',
      };
      (req as Request & { jwtPayload: unknown }).jwtPayload = {
        sid: 'sess-invalidated',
      };

      // Pre-invalidate the session
      invalidatedSessions.add('sess-invalidated');

      const middleware = sessionHardening();
      const res = mockResponse();
      const next = mockNext();

      await middleware(req, res, next);

      expect(next.called).toBe(true);
      const error = next.error as { statusCode: number; code: string };
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('SESSION_INVALIDATED');
    });

    it('registers session in lastActiveMap and userSessionsMap', async () => {
      const req = mockRequest({
        headers: { 'x-session-id': 'sess-register' },
      });

      (req as Request & { tenant: unknown }).tenant = {
        tenantId: 'tenant-1',
        userId: 'user-reg',
        role: 'user',
      };
      (req as Request & { jwtPayload: unknown }).jwtPayload = {
        sid: 'sess-register',
      };

      const middleware = sessionHardening();
      const res = mockResponse();
      const next = mockNext();

      await middleware(req, res, next);

      expect(next.error).toBeNull();
      expect(lastActiveMap.has('user-reg:sess-register')).toBe(true);
      expect(userSessionsMap.get('user-reg')?.has('sess-register')).toBe(true);
    });
  });

  // =========================================================================
  // idleTimeoutCheck
  // =========================================================================

  describe('idleTimeoutCheck', () => {
    it('passes when session is within idle timeout', () => {
      const req = mockRequest({
        headers: { 'x-session-id': 'sess-active' },
      });

      (req as Request & { tenant: unknown }).tenant = {
        tenantId: 'tenant-1',
        userId: 'user-active',
        role: 'user',
      };
      (req as Request & { jwtPayload: unknown }).jwtPayload = {
        sid: 'sess-active',
      };

      // Set last active to "now"
      lastActiveMap.set('user-active:sess-active', Date.now());

      const middleware = idleTimeoutCheck();
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(next.called).toBe(true);
      expect(next.error).toBeNull();
    });

    it('passes when session has no previous activity (first request)', () => {
      const req = mockRequest({
        headers: { 'x-session-id': 'sess-new' },
      });

      (req as Request & { tenant: unknown }).tenant = {
        tenantId: 'tenant-1',
        userId: 'user-new',
        role: 'user',
      };
      (req as Request & { jwtPayload: unknown }).jwtPayload = {
        sid: 'sess-new',
      };

      const middleware = idleTimeoutCheck();
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(next.called).toBe(true);
      expect(next.error).toBeNull();
      // Should register the session
      expect(lastActiveMap.has('user-new:sess-new')).toBe(true);
    });

    it('rejects with 401 when session exceeds idle timeout', () => {
      const req = mockRequest({
        headers: { 'x-session-id': 'sess-idle' },
      });

      (req as Request & { tenant: unknown }).tenant = {
        tenantId: 'tenant-1',
        userId: 'user-idle',
        role: 'user',
      };
      (req as Request & { jwtPayload: unknown }).jwtPayload = {
        sid: 'sess-idle',
      };

      // Set last active to well beyond the idle timeout
      lastActiveMap.set('user-idle:sess-idle', Date.now() - IDLE_TIMEOUT_MS - 1000);

      const middleware = idleTimeoutCheck();
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(next.called).toBe(true);
      const error = next.error as { statusCode: number; code: string };
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('SESSION_IDLE_TIMEOUT');

      // Session should be cleaned up
      expect(lastActiveMap.has('user-idle:sess-idle')).toBe(false);
    });

    it('passes when session is exactly at the timeout boundary', () => {
      const req = mockRequest({
        headers: { 'x-session-id': 'sess-boundary' },
      });

      (req as Request & { tenant: unknown }).tenant = {
        tenantId: 'tenant-1',
        userId: 'user-boundary',
        role: 'user',
      };
      (req as Request & { jwtPayload: unknown }).jwtPayload = {
        sid: 'sess-boundary',
      };

      // Set last active to exactly at the timeout (not exceeded)
      lastActiveMap.set('user-boundary:sess-boundary', Date.now() - IDLE_TIMEOUT_MS);

      const middleware = idleTimeoutCheck();
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(next.called).toBe(true);
      // At exactly the boundary, elapsed === IDLE_TIMEOUT_MS, which is NOT > IDLE_TIMEOUT_MS
      expect(next.error).toBeNull();
    });

    it('passes through for unauthenticated requests', () => {
      const req = mockRequest();
      const middleware = idleTimeoutCheck();
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(next.called).toBe(true);
      expect(next.error).toBeNull();
    });
  });

  // =========================================================================
  // concurrentSessionCheck
  // =========================================================================

  describe('concurrentSessionCheck', () => {
    it('passes when user has fewer sessions than the limit', () => {
      const req = mockRequest({
        headers: { 'x-session-id': 'sess-1' },
      });

      (req as Request & { tenant: unknown }).tenant = {
        tenantId: 'tenant-1',
        userId: 'user-concurrent',
        role: 'user',
      };
      (req as Request & { jwtPayload: unknown }).jwtPayload = {
        sid: 'sess-1',
      };

      // User has 2 sessions (under default limit of 3)
      userSessionsMap.set('user-concurrent', new Set(['sess-1', 'sess-2']));

      const middleware = concurrentSessionCheck();
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(next.called).toBe(true);
      expect(next.error).toBeNull();
    });

    it('passes when user has exactly MAX_CONCURRENT_SESSIONS', () => {
      const req = mockRequest({
        headers: { 'x-session-id': 'sess-1' },
      });

      (req as Request & { tenant: unknown }).tenant = {
        tenantId: 'tenant-1',
        userId: 'user-exact',
        role: 'user',
      };
      (req as Request & { jwtPayload: unknown }).jwtPayload = {
        sid: 'sess-1',
      };

      // User has exactly MAX_CONCURRENT_SESSIONS (including current)
      const sessions = new Set<string>();
      for (let i = 1; i <= MAX_CONCURRENT_SESSIONS; i++) {
        sessions.add(`sess-${i}`);
      }
      userSessionsMap.set('user-exact', sessions);

      const middleware = concurrentSessionCheck();
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(next.called).toBe(true);
      expect(next.error).toBeNull();
    });

    it('rejects with 429 when user exceeds MAX_CONCURRENT_SESSIONS with a new session', () => {
      const req = mockRequest({
        headers: { 'x-session-id': 'sess-new' },
      });

      (req as Request & { tenant: unknown }).tenant = {
        tenantId: 'tenant-1',
        userId: 'user-over',
        role: 'user',
      };
      (req as Request & { jwtPayload: unknown }).jwtPayload = {
        sid: 'sess-new',
      };

      // User has MAX_CONCURRENT_SESSIONS + 1 sessions, and the current session is NOT in the set
      const sessions = new Set<string>();
      for (let i = 1; i <= MAX_CONCURRENT_SESSIONS + 1; i++) {
        sessions.add(`sess-existing-${i}`);
      }
      userSessionsMap.set('user-over', sessions);

      const middleware = concurrentSessionCheck();
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(next.called).toBe(true);
      const error = next.error as { statusCode: number; code: string };
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('SESSION_LIMIT_EXCEEDED');
    });

    it('passes when no sessions are tracked for the user', () => {
      const req = mockRequest({
        headers: { 'x-session-id': 'sess-first' },
      });

      (req as Request & { tenant: unknown }).tenant = {
        tenantId: 'tenant-1',
        userId: 'user-fresh',
        role: 'user',
      };
      (req as Request & { jwtPayload: unknown }).jwtPayload = {
        sid: 'sess-first',
      };

      // No sessions tracked for this user
      const middleware = concurrentSessionCheck();
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(next.called).toBe(true);
      expect(next.error).toBeNull();
    });

    it('passes through for unauthenticated requests', () => {
      const req = mockRequest();
      const middleware = concurrentSessionCheck();
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(next.called).toBe(true);
      expect(next.error).toBeNull();
    });
  });

  // =========================================================================
  // logoutHandler
  // =========================================================================

  describe('logoutHandler', () => {
    it('invalidates session and responds with 200', async () => {
      const req = mockRequest({
        headers: { 'x-session-id': 'sess-logout' },
      });

      (req as Request & { tenant: unknown }).tenant = {
        tenantId: 'tenant-1',
        userId: 'user-logout',
        role: 'user',
      };
      (req as Request & { jwtPayload: unknown }).jwtPayload = {
        sid: 'sess-logout',
      };

      // Pre-register the session
      lastActiveMap.set('user-logout:sess-logout', Date.now());
      userSessionsMap.set('user-logout', new Set(['sess-logout', 'sess-other']));

      const res = mockResponse();

      await logoutHandler(req, res);

      expect(res._status).toBe(200);
      expect(res._json).toEqual({ message: 'Logged out successfully' });

      // Session should be invalidated
      expect(invalidatedSessions.has('sess-logout')).toBe(true);
      expect(lastActiveMap.has('user-logout:sess-logout')).toBe(false);
      expect(userSessionsMap.get('user-logout')?.has('sess-logout')).toBe(false);
      // Other sessions should remain
      expect(userSessionsMap.get('user-logout')?.has('sess-other')).toBe(true);
    });

    it('logs audit event on successful logout', async () => {
      const req = mockRequest({
        headers: { 'x-session-id': 'sess-audit' },
      });

      (req as Request & { tenant: unknown }).tenant = {
        tenantId: 'tenant-1',
        userId: 'user-audit',
        role: 'admin',
      };
      (req as Request & { jwtPayload: unknown }).jwtPayload = {
        sid: 'sess-audit',
      };

      const res = mockResponse();

      await logoutHandler(req, res);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-1', userId: 'user-audit' }),
        expect.objectContaining({
          action: 'session.logout',
          objectType: 'session',
          objectId: 'sess-audit',
        }),
        expect.any(Object),
      );
    });

    it('responds with 401 when not authenticated', async () => {
      const req = mockRequest();
      const res = mockResponse();

      await logoutHandler(req, res);

      expect(res._status).toBe(401);
      expect(res._json).toEqual({ error: 'Not authenticated' });
    });

    it('cleans up userSessionsMap when last session is removed', async () => {
      const req = mockRequest({
        headers: { 'x-session-id': 'sess-only' },
      });

      (req as Request & { tenant: unknown }).tenant = {
        tenantId: 'tenant-1',
        userId: 'user-single-sess',
        role: 'user',
      };
      (req as Request & { jwtPayload: unknown }).jwtPayload = {
        sid: 'sess-only',
      };

      // Single session for this user
      lastActiveMap.set('user-single-sess:sess-only', Date.now());
      userSessionsMap.set('user-single-sess', new Set(['sess-only']));

      const res = mockResponse();

      await logoutHandler(req, res);

      expect(res._status).toBe(200);
      // User should be fully removed from the map
      expect(userSessionsMap.has('user-single-sess')).toBe(false);
    });
  });

  // =========================================================================
  // backchannelLogoutHandler
  // =========================================================================

  describe('backchannelLogoutHandler', () => {
    it('invalidates specific session from valid logout_token', async () => {
      const logoutToken = createMockJwt({
        sub: 'user-bc',
        sid: 'sess-bc-123',
        events: {
          'http://schemas.openid.net/event/backchannel-logout': {},
        },
        iat: Math.floor(Date.now() / 1000),
      });

      const req = mockRequest({
        body: { logout_token: logoutToken },
      });

      // Pre-register the session
      lastActiveMap.set('user-bc:sess-bc-123', Date.now());
      userSessionsMap.set('user-bc', new Set(['sess-bc-123', 'sess-bc-other']));

      const res = mockResponse();

      await backchannelLogoutHandler(req, res);

      expect(res._status).toBe(200);
      expect(res._json).toEqual({ message: 'Logout processed' });

      // Specific session should be invalidated
      expect(invalidatedSessions.has('sess-bc-123')).toBe(true);
      expect(lastActiveMap.has('user-bc:sess-bc-123')).toBe(false);
      expect(userSessionsMap.get('user-bc')?.has('sess-bc-123')).toBe(false);
      // Other session should remain
      expect(userSessionsMap.get('user-bc')?.has('sess-bc-other')).toBe(true);
    });

    it('invalidates ALL user sessions when no sid in logout_token', async () => {
      const logoutToken = createMockJwt({
        sub: 'user-bc-all',
        events: {
          'http://schemas.openid.net/event/backchannel-logout': {},
        },
        iat: Math.floor(Date.now() / 1000),
      });

      const req = mockRequest({
        body: { logout_token: logoutToken },
      });

      // Pre-register multiple sessions
      lastActiveMap.set('user-bc-all:sess-1', Date.now());
      lastActiveMap.set('user-bc-all:sess-2', Date.now());
      lastActiveMap.set('user-bc-all:sess-3', Date.now());
      userSessionsMap.set('user-bc-all', new Set(['sess-1', 'sess-2', 'sess-3']));

      const res = mockResponse();

      await backchannelLogoutHandler(req, res);

      expect(res._status).toBe(200);

      // All sessions should be invalidated
      expect(invalidatedSessions.has('sess-1')).toBe(true);
      expect(invalidatedSessions.has('sess-2')).toBe(true);
      expect(invalidatedSessions.has('sess-3')).toBe(true);
      expect(lastActiveMap.has('user-bc-all:sess-1')).toBe(false);
      expect(lastActiveMap.has('user-bc-all:sess-2')).toBe(false);
      expect(lastActiveMap.has('user-bc-all:sess-3')).toBe(false);
      expect(userSessionsMap.has('user-bc-all')).toBe(false);
    });

    it('rejects with 400 when logout_token is missing', async () => {
      const req = mockRequest({ body: {} });
      const res = mockResponse();

      await backchannelLogoutHandler(req, res);

      expect(res._status).toBe(400);
      expect(res._json).toEqual({ error: 'Missing logout_token' });
    });

    it('rejects with 400 when logout_token is not a valid JWT', async () => {
      const req = mockRequest({
        body: { logout_token: 'not-a-jwt' },
      });
      const res = mockResponse();

      await backchannelLogoutHandler(req, res);

      expect(res._status).toBe(400);
      expect(res._json).toEqual({ error: 'Invalid logout_token' });
    });

    it('rejects with 400 when logout_token has invalid base64 payload', async () => {
      const req = mockRequest({
        body: { logout_token: 'header.!!!invalid-base64!!!.signature' },
      });
      const res = mockResponse();

      await backchannelLogoutHandler(req, res);

      // Should handle gracefully (either invalid format or missing event)
      expect(res._status).toBe(400);
    });

    it('rejects with 400 when logout_token is missing the logout event claim', async () => {
      const logoutToken = createMockJwt({
        sub: 'user-no-event',
        sid: 'sess-no-event',
        events: {}, // No backchannel-logout event
      });

      const req = mockRequest({
        body: { logout_token: logoutToken },
      });
      const res = mockResponse();

      await backchannelLogoutHandler(req, res);

      expect(res._status).toBe(400);
      expect(res._json).toEqual({ error: 'Invalid logout_token: missing logout event' });
    });

    it('rejects with 400 when logout_token is missing the sub claim', async () => {
      const logoutToken = createMockJwt({
        sid: 'sess-no-sub',
        events: {
          'http://schemas.openid.net/event/backchannel-logout': {},
        },
      });

      const req = mockRequest({
        body: { logout_token: logoutToken },
      });
      const res = mockResponse();

      await backchannelLogoutHandler(req, res);

      expect(res._status).toBe(400);
      expect(res._json).toEqual({ error: 'Invalid logout_token: missing sub' });
    });
  });

  // =========================================================================
  // clearSessionState (utility)
  // =========================================================================

  describe('clearSessionState', () => {
    it('clears all in-memory session stores', () => {
      lastActiveMap.set('user-1:sess-1', Date.now());
      userSessionsMap.set('user-1', new Set(['sess-1']));
      invalidatedSessions.add('sess-old');

      clearSessionState();

      expect(lastActiveMap.size).toBe(0);
      expect(userSessionsMap.size).toBe(0);
      expect(invalidatedSessions.size).toBe(0);
    });
  });

  // =========================================================================
  // Integration: Full middleware chain
  // =========================================================================

  describe('integration: middleware chain', () => {
    it('sessionHardening + idleTimeoutCheck + concurrentSessionCheck all pass for valid session', async () => {
      const req = mockRequest({
        headers: { 'x-session-id': 'sess-chain' },
      });

      (req as Request & { tenant: unknown }).tenant = {
        tenantId: 'tenant-1',
        userId: 'user-chain',
        role: 'user',
      };
      (req as Request & { jwtPayload: unknown }).jwtPayload = {
        sid: 'sess-chain',
      };

      // Step 1: sessionHardening
      const sh = sessionHardening();
      const next1 = mockNext();
      await sh(req, mockResponse(), next1);
      expect(next1.error).toBeNull();

      // Step 2: idleTimeoutCheck (session was just registered, so it's fresh)
      const itc = idleTimeoutCheck();
      const next2 = mockNext();
      itc(req, mockResponse(), next2);
      expect(next2.error).toBeNull();

      // Step 3: concurrentSessionCheck (only 1 session)
      const csc = concurrentSessionCheck();
      const next3 = mockNext();
      csc(req, mockResponse(), next3);
      expect(next3.error).toBeNull();
    });
  });
});
