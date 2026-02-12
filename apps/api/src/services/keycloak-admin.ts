/**
 * KeycloakAdminService — Sprint 9 (Team 02)
 *
 * Service wrapper for the Keycloak Admin REST API.
 * Synchronises user operations from the local PostgreSQL database to Keycloak.
 *
 * Design principles:
 * - Uses native fetch (no extra dependencies).
 * - All calls are wrapped in try/catch — Keycloak sync must NEVER block
 *   the main operation. Errors are logged via pino, not re-thrown.
 * - Admin token is obtained via password grant against the master realm
 *   and cached until expiry (minus 30 s buffer).
 *
 * Env vars:
 *   KEYCLOAK_ADMIN_URL       — Base URL (default: http://localhost:8080)
 *   KEYCLOAK_REALM           — Target realm (default: servanda)
 *   KEYCLOAK_ADMIN_CLIENT_ID — Admin CLI client (default: admin-cli)
 *   KEYCLOAK_ADMIN_USERNAME  — Admin user (default: admin)
 *   KEYCLOAK_ADMIN_PASSWORD  — Admin password (default: admin)
 */

import { logger } from '../shared/logger';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = process.env.KEYCLOAK_ADMIN_URL ?? 'http://localhost:8080';
const REALM = process.env.KEYCLOAK_REALM ?? 'servanda';
const ADMIN_CLIENT_ID = process.env.KEYCLOAK_ADMIN_CLIENT_ID ?? 'admin-cli';
const ADMIN_USERNAME = process.env.KEYCLOAK_ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin';

/** Safety buffer before token expiry (seconds). */
const TOKEN_EXPIRY_BUFFER_S = 30;

// ---------------------------------------------------------------------------
// Types (Keycloak REST API shapes — minimal subset)
// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface KeycloakRoleRepresentation {
  id: string;
  name: string;
  description?: string;
  composite?: boolean;
  clientRole?: boolean;
  containerId?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class KeycloakAdminService {
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0; // epoch ms

  // -----------------------------------------------------------------------
  // Auth — obtain admin token via Resource Owner Password Credentials grant
  // -----------------------------------------------------------------------

  private async getAdminToken(): Promise<string> {
    // Return cached token if still valid
    if (this.cachedToken && Date.now() < this.tokenExpiresAt) {
      return this.cachedToken;
    }

    const url = `${BASE_URL}/realms/master/protocol/openid-connect/token`;

    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: ADMIN_CLIENT_ID,
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '<no body>');
      throw new Error(`Keycloak token request failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as TokenResponse;
    this.cachedToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in - TOKEN_EXPIRY_BUFFER_S) * 1000;
    return this.cachedToken;
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /** Base URL for admin operations on the target realm. */
  private get realmAdminUrl(): string {
    return `${BASE_URL}/admin/realms/${REALM}`;
  }

  /**
   * Perform an authenticated request against the Keycloak Admin REST API.
   * Returns the Response object; caller is responsible for status checking.
   */
  private async request(
    path: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const token = await this.getAdminToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers as Record<string, string> | undefined),
    };

    return fetch(`${this.realmAdminUrl}${path}`, {
      ...options,
      headers,
    });
  }

  // -----------------------------------------------------------------------
  // User CRUD
  // -----------------------------------------------------------------------

  /**
   * Creates a user in Keycloak.
   *
   * @returns Keycloak user ID (UUID) or `null` on failure.
   */
  async createUser(
    email: string,
    displayName: string,
    tempPassword?: string,
  ): Promise<string | null> {
    try {
      const [firstName, ...rest] = displayName.split(' ');
      const lastName = rest.join(' ') || undefined;

      const payload: Record<string, unknown> = {
        username: email,
        email,
        firstName,
        lastName,
        enabled: true,
        emailVerified: true,
      };

      if (tempPassword) {
        payload.credentials = [
          { type: 'password', value: tempPassword, temporary: true },
        ];
      }

      const res = await this.request('/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (res.status === 201) {
        // Keycloak returns the new user's URL in the Location header
        const location = res.headers.get('Location');
        const keycloakId = location?.split('/').pop() ?? null;
        logger.info({ email, keycloakId }, 'Keycloak user created');
        return keycloakId;
      }

      // 409 = user already exists — not necessarily an error
      if (res.status === 409) {
        logger.warn({ email }, 'Keycloak user already exists');
        return null;
      }

      const text = await res.text().catch(() => '<no body>');
      logger.error(
        { email, status: res.status, body: text },
        'Keycloak createUser failed',
      );
      return null;
    } catch (err) {
      logger.error({ err, email }, 'Keycloak createUser error');
      return null;
    }
  }

  /**
   * Updates user attributes in Keycloak.
   */
  async updateUser(
    keycloakId: string,
    updates: { email?: string; enabled?: boolean },
  ): Promise<void> {
    try {
      const res = await this.request(`/users/${keycloakId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '<no body>');
        logger.error(
          { keycloakId, status: res.status, body: text },
          'Keycloak updateUser failed',
        );
        return;
      }

      logger.info({ keycloakId, updates }, 'Keycloak user updated');
    } catch (err) {
      logger.error({ err, keycloakId }, 'Keycloak updateUser error');
    }
  }

  /**
   * Deletes a user from Keycloak.
   */
  async deleteUser(keycloakId: string): Promise<void> {
    try {
      const res = await this.request(`/users/${keycloakId}`, {
        method: 'DELETE',
      });

      if (!res.ok && res.status !== 404) {
        const text = await res.text().catch(() => '<no body>');
        logger.error(
          { keycloakId, status: res.status, body: text },
          'Keycloak deleteUser failed',
        );
        return;
      }

      logger.info({ keycloakId }, 'Keycloak user deleted');
    } catch (err) {
      logger.error({ err, keycloakId }, 'Keycloak deleteUser error');
    }
  }

  /**
   * Enables a user in Keycloak (sets enabled=true).
   */
  async enableUser(keycloakId: string): Promise<void> {
    await this.updateUser(keycloakId, { enabled: true });
  }

  /**
   * Disables a user in Keycloak (sets enabled=false).
   */
  async disableUser(keycloakId: string): Promise<void> {
    await this.updateUser(keycloakId, { enabled: false });
  }

  // -----------------------------------------------------------------------
  // MFA — require TOTP configuration
  // -----------------------------------------------------------------------

  /**
   * Sets the CONFIGURE_TOTP required action on a user so they are forced
   * to set up TOTP on next login.
   */
  async requireMfa(keycloakId: string): Promise<void> {
    try {
      // First fetch the current user to get their existing required actions
      const getRes = await this.request(`/users/${keycloakId}`);
      if (!getRes.ok) {
        const text = await getRes.text().catch(() => '<no body>');
        logger.error(
          { keycloakId, status: getRes.status, body: text },
          'Keycloak requireMfa — failed to fetch user',
        );
        return;
      }

      const user = (await getRes.json()) as { requiredActions?: string[] };
      const requiredActions = user.requiredActions ?? [];

      if (!requiredActions.includes('CONFIGURE_TOTP')) {
        requiredActions.push('CONFIGURE_TOTP');
      }

      const res = await this.request(`/users/${keycloakId}`, {
        method: 'PUT',
        body: JSON.stringify({ requiredActions }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '<no body>');
        logger.error(
          { keycloakId, status: res.status, body: text },
          'Keycloak requireMfa failed',
        );
        return;
      }

      logger.info({ keycloakId }, 'Keycloak CONFIGURE_TOTP required action set');
    } catch (err) {
      logger.error({ err, keycloakId }, 'Keycloak requireMfa error');
    }
  }

  // -----------------------------------------------------------------------
  // Role mapping
  // -----------------------------------------------------------------------

  /**
   * Assigns a realm-level role to a user.
   *
   * Keycloak requires the role representation (id + name) for the mapping
   * endpoint, so we first look up the role by name.
   */
  async assignRealmRole(keycloakId: string, roleName: string): Promise<void> {
    try {
      // 1. Look up role to get its id
      const roleRes = await this.request(`/roles/${roleName}`);
      if (!roleRes.ok) {
        const text = await roleRes.text().catch(() => '<no body>');
        logger.error(
          { roleName, status: roleRes.status, body: text },
          'Keycloak assignRealmRole — role lookup failed',
        );
        return;
      }

      const role = (await roleRes.json()) as KeycloakRoleRepresentation;

      // 2. Assign the role to the user
      const mapRes = await this.request(
        `/users/${keycloakId}/role-mappings/realm`,
        {
          method: 'POST',
          body: JSON.stringify([{ id: role.id, name: role.name }]),
        },
      );

      if (!mapRes.ok) {
        const text = await mapRes.text().catch(() => '<no body>');
        logger.error(
          { keycloakId, roleName, status: mapRes.status, body: text },
          'Keycloak assignRealmRole failed',
        );
        return;
      }

      logger.info({ keycloakId, roleName }, 'Keycloak realm role assigned');
    } catch (err) {
      logger.error({ err, keycloakId, roleName }, 'Keycloak assignRealmRole error');
    }
  }

  // -----------------------------------------------------------------------
  // Utility — invalidate token cache (useful for tests)
  // -----------------------------------------------------------------------

  clearTokenCache(): void {
    this.cachedToken = null;
    this.tokenExpiresAt = 0;
  }
}

/** Singleton instance for application-wide use. */
export const keycloakAdmin = new KeycloakAdminService();
