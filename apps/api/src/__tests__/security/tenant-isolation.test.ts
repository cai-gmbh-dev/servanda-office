/**
 * Security Test Scenarios T-01..T-12 — Sprint 9 (Team 06)
 *
 * Automated security tests validating:
 * - Authentication enforcement (T-01..T-03)
 * - Tenant isolation / cross-tenant access prevention (T-04..T-05, T-09..T-10)
 * - Role-based access control (T-06..T-08)
 * - CORS policy (T-11)
 * - Security headers via Helmet (T-12)
 *
 * These tests run against the live API on localhost:3000.
 * Prerequisites: API running, seeded database with vendor + lawfirm tenants.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API = 'http://localhost:3000/api/v1';

// Seed tenants
const VENDOR_TENANT = '00000000-0000-0000-0000-000000000001';
const LAWFIRM_TENANT = '00000000-0000-0000-0000-000000000002';

// Seed users
const VENDOR_EDITOR_USER = '00000000-0000-0000-0001-000000000001';
const LAWFIRM_ADMIN_USER = '00000000-0000-0000-0002-000000000001';
const LAWFIRM_USER_USER = '00000000-0000-0000-0002-000000000003';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function headers(tenantId: string, userId: string, role: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-tenant-id': tenantId,
    'x-user-id': userId,
    'x-user-role': role,
  };
}

/**
 * Helper to build headers for the Lawfirm Admin (most common authenticated caller).
 */
function lawfirmAdminHeaders(): Record<string, string> {
  return headers(LAWFIRM_TENANT, LAWFIRM_ADMIN_USER, 'admin');
}

/**
 * Helper to build headers for the Lawfirm User (role = 'user').
 */
function lawfirmUserHeaders(): Record<string, string> {
  return headers(LAWFIRM_TENANT, LAWFIRM_USER_USER, 'user');
}

/**
 * Helper to build headers for the Vendor Editor (role = 'editor').
 */
function vendorEditorHeaders(): Record<string, string> {
  return headers(VENDOR_TENANT, VENDOR_EDITOR_USER, 'editor');
}

// ---------------------------------------------------------------------------
// Security Tests T-01 .. T-12
// ---------------------------------------------------------------------------

describe('Security Tests T-01..T-12', () => {

  // =========================================================================
  // T-01: Unauthenticated request returns 401
  // =========================================================================
  it('T-01: Unauthenticated request returns 401', async () => {
    // No auth headers at all — should be rejected
    const res = await fetch(`${API}/content/clauses`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  }, 10_000);

  // =========================================================================
  // T-02: Missing x-tenant-id returns 401
  // =========================================================================
  it('T-02: Missing x-tenant-id returns 401', async () => {
    // Provide x-user-id and x-user-role but NOT x-tenant-id
    const res = await fetch(`${API}/content/clauses`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': LAWFIRM_ADMIN_USER,
        'x-user-role': 'admin',
      },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  }, 10_000);

  // =========================================================================
  // T-03: Missing x-user-id returns 401
  // =========================================================================
  it('T-03: Missing x-user-id returns 401', async () => {
    // Provide x-tenant-id and x-user-role but NOT x-user-id
    const res = await fetch(`${API}/content/clauses`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': LAWFIRM_TENANT,
        'x-user-role': 'admin',
      },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  }, 10_000);

  // =========================================================================
  // T-04: Tenant A cannot see Clauses of Tenant B
  //       (Lawfirm user lists clauses and must NOT see Vendor clauses)
  // =========================================================================
  it('T-04: Tenant A cannot see Clauses of Tenant B', async () => {
    // Step 1: Create a clause as Vendor Editor
    const createRes = await fetch(`${API}/content/clauses`, {
      method: 'POST',
      headers: vendorEditorHeaders(),
      body: JSON.stringify({
        title: 'Vendor-Only Geheimhaltungsklausel T-04',
        jurisdiction: 'DE',
      }),
    });
    // If creation succeeds (201) or the clause already exists, proceed with the check
    const vendorClause = createRes.status === 201 ? await createRes.json() : null;

    // Step 2: List clauses as Lawfirm Admin — should NOT contain Vendor clauses
    const listRes = await fetch(`${API}/content/clauses?pageSize=100`, {
      method: 'GET',
      headers: lawfirmAdminHeaders(),
    });

    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();

    // Verify every returned clause belongs to the Lawfirm tenant
    for (const clause of listBody.data) {
      expect(clause.tenantId).toBe(LAWFIRM_TENANT);
    }

    // If we created a vendor clause, make sure its ID does NOT appear
    if (vendorClause?.id) {
      const ids = listBody.data.map((c: { id: string }) => c.id);
      expect(ids).not.toContain(vendorClause.id);
    }
  }, 10_000);

  // =========================================================================
  // T-05: Tenant A cannot see Contracts of Tenant B
  // =========================================================================
  it('T-05: Tenant A cannot see Contracts of Tenant B', async () => {
    // List contracts as Vendor Editor — should NOT see any Lawfirm contracts
    const vendorRes = await fetch(`${API}/contracts?pageSize=100`, {
      method: 'GET',
      headers: vendorEditorHeaders(),
    });
    expect(vendorRes.status).toBe(200);
    const vendorBody = await vendorRes.json();

    for (const contract of vendorBody.data) {
      expect(contract.tenantId).toBe(VENDOR_TENANT);
    }

    // List contracts as Lawfirm Admin — should NOT see any Vendor contracts
    const lawfirmRes = await fetch(`${API}/contracts?pageSize=100`, {
      method: 'GET',
      headers: lawfirmAdminHeaders(),
    });
    expect(lawfirmRes.status).toBe(200);
    const lawfirmBody = await lawfirmRes.json();

    for (const contract of lawfirmBody.data) {
      expect(contract.tenantId).toBe(LAWFIRM_TENANT);
    }
  }, 10_000);

  // =========================================================================
  // T-06: User role cannot POST /identity/users/invite (admin only)
  // =========================================================================
  it('T-06: User role cannot POST /identity/users/invite (admin only)', async () => {
    const res = await fetch(`${API}/identity/users/invite`, {
      method: 'POST',
      headers: lawfirmUserHeaders(),
      body: JSON.stringify({
        email: 'should-not-work@example.com',
        displayName: 'Forbidden User',
        role: 'user',
      }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
  }, 10_000);

  // =========================================================================
  // T-07: User role cannot DELETE /identity/users/:id (admin only)
  // =========================================================================
  it('T-07: User role cannot DELETE /identity/users/:id (admin only)', async () => {
    // Use a dummy UUID — the role check should fire before any DB lookup
    const dummyUserId = '00000000-0000-0000-0000-999999999999';

    const res = await fetch(`${API}/identity/users/${dummyUserId}`, {
      method: 'DELETE',
      headers: lawfirmUserHeaders(),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
  }, 10_000);

  // =========================================================================
  // T-08: User role cannot POST /export/style-templates (admin only)
  // =========================================================================
  it('T-08: User role cannot POST /export/style-templates (admin only)', async () => {
    const res = await fetch(`${API}/export/style-templates`, {
      method: 'POST',
      headers: lawfirmUserHeaders(),
      body: JSON.stringify({
        name: 'Should Not Be Created',
        primaryFont: 'Arial',
        fontSize: 11,
      }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
  }, 10_000);

  // =========================================================================
  // T-09: Tenant A cannot deactivate a User of Tenant B
  // =========================================================================
  it('T-09: Tenant A cannot deactivate a User of Tenant B', async () => {
    // Vendor admin tries to deactivate the Lawfirm user
    // First, we need a vendor admin identity
    const vendorAdminHeaders = headers(VENDOR_TENANT, VENDOR_EDITOR_USER, 'admin');

    const res = await fetch(`${API}/identity/users/${LAWFIRM_USER_USER}/deactivate`, {
      method: 'POST',
      headers: vendorAdminHeaders,
    });

    // Should be 404 (user not found in vendor tenant due to RLS) or 403
    // RLS ensures the user lookup returns null -> NotFoundError (404)
    expect([403, 404]).toContain(res.status);

    // The lawfirm user must NOT have been deactivated.
    // Verify by fetching the user from the lawfirm tenant.
    const verifyRes = await fetch(`${API}/identity/users/${LAWFIRM_USER_USER}`, {
      method: 'GET',
      headers: lawfirmAdminHeaders(),
    });

    if (verifyRes.status === 200) {
      const verifyBody = await verifyRes.json();
      // User should still be in their original status (not 'inactive' from the cross-tenant attack)
      expect(verifyBody.status).not.toBe('inactive');
    }
    // If 404, that's also acceptable (user may not exist in seed, but the cross-tenant call was blocked)
  }, 10_000);

  // =========================================================================
  // T-10: Audit logs show only own tenant's events
  // =========================================================================
  it('T-10: Audit logs show only own tenant events', async () => {
    // Query audit logs as Lawfirm Admin
    const res = await fetch(`${API}/identity/audit-logs?pageSize=100`, {
      method: 'GET',
      headers: lawfirmAdminHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    // Every returned audit event must belong to the lawfirm tenant
    for (const event of body.data) {
      expect(event.tenantId).toBe(LAWFIRM_TENANT);
    }
  }, 10_000);

  // =========================================================================
  // T-11: CORS — non-allowed origin is blocked
  // =========================================================================
  it('T-11: CORS blocks non-allowed origins', async () => {
    // Send a preflight (OPTIONS) from a disallowed origin
    const res = await fetch(`${API}/content/clauses`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://evil-site.example.com',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'x-tenant-id,x-user-id,x-user-role',
      },
    });

    // The response should NOT contain an Access-Control-Allow-Origin header
    // matching the evil origin. It may be absent or not match.
    const allowedOrigin = res.headers.get('access-control-allow-origin');
    expect(allowedOrigin).not.toBe('https://evil-site.example.com');

    // Additionally, if CORS is strict, the wildcard '*' should NOT be used
    // (because credentials: true is set, which disallows wildcard).
    expect(allowedOrigin).not.toBe('*');
  }, 10_000);

  // =========================================================================
  // T-12: Security headers present (Helmet)
  // =========================================================================
  it('T-12: Security headers present (Helmet)', async () => {
    // Use an authenticated request to get past auth middleware
    const res = await fetch(`${API}/content/clauses`, {
      method: 'GET',
      headers: lawfirmAdminHeaders(),
    });

    // X-Content-Type-Options: nosniff
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');

    // X-Frame-Options: SAMEORIGIN (or DENY — Helmet defaults to SAMEORIGIN)
    const xFrameOptions = res.headers.get('x-frame-options');
    expect(xFrameOptions).toBeTruthy();
    expect(['DENY', 'SAMEORIGIN']).toContain(xFrameOptions!.toUpperCase());

    // Strict-Transport-Security (HSTS)
    // Note: Helmet sets this by default. In local dev over HTTP it may still be present.
    const hsts = res.headers.get('strict-transport-security');
    if (hsts) {
      expect(hsts).toMatch(/max-age=\d+/);
    }

    // Content-Security-Policy
    const csp = res.headers.get('content-security-policy');
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");

    // X-DNS-Prefetch-Control (Helmet default)
    const dnsPrefetch = res.headers.get('x-dns-prefetch-control');
    expect(dnsPrefetch).toBe('off');

    // X-Powered-By should NOT be 'Express' (Helmet removes it)
    // Our custom middleware sets it to 'Servanda Office'
    const poweredBy = res.headers.get('x-powered-by');
    expect(poweredBy).not.toBe('Express');

    // Cross-Origin-Embedder-Policy
    const coep = res.headers.get('cross-origin-embedder-policy');
    expect(coep).toBeTruthy();

    // Cross-Origin-Opener-Policy
    const coop = res.headers.get('cross-origin-opener-policy');
    expect(coop).toBe('same-origin');

    // Cross-Origin-Resource-Policy
    const corp = res.headers.get('cross-origin-resource-policy');
    expect(corp).toBe('same-origin');

    // Referrer-Policy
    const referrer = res.headers.get('referrer-policy');
    expect(referrer).toBeTruthy();
    expect(referrer).toContain('strict-origin-when-cross-origin');

    // X-API-Version header (custom)
    const apiVersion = res.headers.get('x-api-version');
    expect(apiVersion).toBeTruthy();
  }, 10_000);

}, { timeout: 120_000 });
