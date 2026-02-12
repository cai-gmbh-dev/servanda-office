/**
 * SCIM 2.0 Provisioning Service — Sprint 13 (Team 02)
 *
 * RFC 7644-compliant user provisioning service for enterprise IdP integration.
 * Supports SCIM 2.0 User resource operations with tenant-scoped API key auth.
 *
 * Maps SCIM User schema to internal Servanda Office User model:
 *   - userName / emails → email
 *   - displayName       → displayName
 *   - active            → status (active/inactive)
 *   - roles (extension) → role (admin/editor/user)
 *
 * Design principles:
 *   - All operations are tenant-scoped via the SCIM bearer token (API key per tenant).
 *   - Responses follow the SCIM 2.0 JSON format with schemas, id, and meta fields.
 *   - Keycloak synchronisation is fire-and-forget (never blocks SCIM response).
 */

import { prisma, setTenantContext } from '../shared/db';
import { logger } from '../shared/logger';
import { keycloakAdmin } from './keycloak-admin';
import { auditService } from './audit.service';
import type { TenantContext } from '@servanda/shared';

// ---------------------------------------------------------------------------
// SCIM Constants
// ---------------------------------------------------------------------------

export const SCIM_USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
export const SCIM_ENTERPRISE_USER_SCHEMA = 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User';
export const SCIM_SERVANDA_EXTENSION = 'urn:ietf:params:scim:schemas:extension:servanda:2.0:User';
export const SCIM_LIST_RESPONSE_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
export const SCIM_ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error';

const SCIM_CONTENT_TYPE = 'application/scim+json';

// ---------------------------------------------------------------------------
// SCIM Types (RFC 7643 / 7644)
// ---------------------------------------------------------------------------

export interface ScimMeta {
  resourceType: string;
  created: string;
  lastModified: string;
  location: string;
}

export interface ScimUserResource {
  schemas: string[];
  id: string;
  externalId?: string;
  userName: string;
  displayName: string;
  active: boolean;
  emails: Array<{ value: string; primary: boolean; type: string }>;
  name?: { formatted: string; givenName?: string; familyName?: string };
  meta: ScimMeta;
  [SCIM_SERVANDA_EXTENSION]?: {
    role: string;
    tenantId: string;
    mfaEnabled: boolean;
  };
}

export interface ScimListResponse {
  schemas: string[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: ScimUserResource[];
}

export interface ScimError {
  schemas: string[];
  status: string;
  detail: string;
  scimType?: string;
}

export interface ScimPatchOperation {
  op: 'add' | 'replace' | 'remove';
  path?: string;
  value?: unknown;
}

export interface ScimPatchRequest {
  schemas: string[];
  Operations: ScimPatchOperation[];
}

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

interface InternalUser {
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
}

// ---------------------------------------------------------------------------
// API Key → Tenant Resolution
// ---------------------------------------------------------------------------

/**
 * SCIM API key store. In production, these would be stored in the database
 * with hashed values. For now, we use environment-based configuration.
 *
 * Format: SCIM_API_KEY_<TENANT_ID>=<api-key-value>
 * The authenticate function resolves the bearer token to a tenantId.
 */
const apiKeyCache = new Map<string, string>(); // token → tenantId

/**
 * Resolves a SCIM bearer token to a tenant context.
 * Returns null if the token is invalid or not found.
 */
export function resolveScimApiKey(bearerToken: string): { tenantId: string } | null {
  // Check in-memory cache first
  if (apiKeyCache.has(bearerToken)) {
    return { tenantId: apiKeyCache.get(bearerToken)! };
  }

  // Scan environment for matching API key
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('SCIM_API_KEY_') && value === bearerToken) {
      const tenantId = key.replace('SCIM_API_KEY_', '').toLowerCase().replace(/_/g, '-');
      apiKeyCache.set(bearerToken, tenantId);
      return { tenantId };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// SCIM Provisioning Service
// ---------------------------------------------------------------------------

export class ScimProvisioningService {
  /**
   * Lists users in the tenant scope, with optional SCIM filter support.
   * Supports: filter=userName eq "value"
   */
  async listUsers(
    tenantId: string,
    options: {
      filter?: string;
      startIndex?: number;
      count?: number;
      baseUrl: string;
    },
  ): Promise<ScimListResponse> {
    const startIndex = Math.max(1, options.startIndex ?? 1);
    const count = Math.min(Math.max(1, options.count ?? 100), 200);
    const skip = startIndex - 1;

    const where: Record<string, unknown> = { tenantId };

    // Parse SCIM filter (basic support: userName eq "value")
    if (options.filter) {
      const parsedFilter = parseScimFilter(options.filter);
      if (parsedFilter) {
        Object.assign(where, parsedFilter);
      }
    }

    const [users, total] = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, tenantId);
      return Promise.all([
        tx.user.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: count,
        }),
        tx.user.count({ where }),
      ]);
    });

    return {
      schemas: [SCIM_LIST_RESPONSE_SCHEMA],
      totalResults: total,
      startIndex,
      itemsPerPage: users.length,
      Resources: users.map((u) =>
        mapUserToScimResource(u as InternalUser, options.baseUrl),
      ),
    };
  }

  /**
   * Gets a single user by ID within the tenant scope.
   */
  async getUser(
    tenantId: string,
    userId: string,
    baseUrl: string,
  ): Promise<ScimUserResource | null> {
    const user = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, tenantId);
      return tx.user.findFirst({
        where: { id: userId, tenantId },
      });
    });

    if (!user) return null;

    return mapUserToScimResource(user as InternalUser, baseUrl);
  }

  /**
   * Creates a user from a SCIM User resource.
   * Maps SCIM schema to internal User model and syncs to Keycloak.
   */
  async createUser(
    tenantId: string,
    scimUser: Partial<ScimUserResource>,
    baseUrl: string,
  ): Promise<{ resource: ScimUserResource; alreadyExists: boolean }> {
    const email = extractEmail(scimUser);
    const displayName = scimUser.displayName ?? scimUser.userName ?? email;
    const active = scimUser.active !== false; // default active
    const role = extractRole(scimUser);

    // Check for existing user
    const existing = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, tenantId);
      return tx.user.findUnique({
        where: { tenantId_email: { tenantId, email } },
      });
    });

    if (existing) {
      return {
        resource: mapUserToScimResource(existing as InternalUser, baseUrl),
        alreadyExists: true,
      };
    }

    const user = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, tenantId);
      return tx.user.create({
        data: {
          tenantId,
          email,
          displayName,
          role,
          status: active ? 'active' : 'inactive',
        },
      });
    });

    // Keycloak sync (fire-and-forget)
    try {
      const keycloakId = await keycloakAdmin.createUser(email, displayName);
      if (keycloakId) {
        await keycloakAdmin.assignRealmRole(keycloakId, role);
        if (!active) {
          await keycloakAdmin.disableUser(keycloakId);
        }
        logger.info(
          { userId: user.id, keycloakId, role, tenantId },
          'SCIM: Keycloak user created and role assigned',
        );
      }
    } catch (kcErr) {
      logger.error(
        { err: kcErr, userId: user.id, email },
        'SCIM: Keycloak sync failed during user creation (non-blocking)',
      );
    }

    // Audit log
    const ctx: TenantContext = { tenantId, userId: 'scim-service', role: 'admin' };
    await auditService.log(ctx, {
      action: 'user.invite',
      objectType: 'user',
      objectId: user.id,
      details: { email, role, source: 'scim', active },
    });

    return {
      resource: mapUserToScimResource(user as InternalUser, baseUrl),
      alreadyExists: false,
    };
  }

  /**
   * Patches a user using SCIM PATCH operations (RFC 7644 Section 3.5.2).
   */
  async patchUser(
    tenantId: string,
    userId: string,
    operations: ScimPatchOperation[],
    baseUrl: string,
  ): Promise<ScimUserResource | null> {
    const existing = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, tenantId);
      return tx.user.findFirst({
        where: { id: userId, tenantId },
      });
    });

    if (!existing) return null;

    const updateData: Record<string, unknown> = {};

    for (const op of operations) {
      if (op.op === 'replace' || op.op === 'add') {
        applyPatchOperation(op, updateData);
      } else if (op.op === 'remove') {
        // SCIM remove: for user attributes we typically set to default
        if (op.path === 'displayName') updateData.displayName = '';
      }
    }

    const user = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, tenantId);
      return tx.user.update({
        where: { id: userId },
        data: updateData,
      });
    });

    // Keycloak sync (fire-and-forget)
    if ((existing as InternalUser).keycloakId) {
      try {
        const kcUpdates: Record<string, unknown> = {};
        if (updateData.status !== undefined) {
          kcUpdates.enabled = updateData.status === 'active';
        }
        if (Object.keys(kcUpdates).length > 0) {
          await keycloakAdmin.updateUser(
            (existing as InternalUser).keycloakId!,
            kcUpdates as { email?: string; enabled?: boolean },
          );
        }
        if (updateData.role) {
          await keycloakAdmin.assignRealmRole(
            (existing as InternalUser).keycloakId!,
            updateData.role as string,
          );
        }
      } catch (kcErr) {
        logger.error(
          { err: kcErr, userId, tenantId },
          'SCIM: Keycloak sync failed during user patch (non-blocking)',
        );
      }
    }

    // Audit log
    const ctx: TenantContext = { tenantId, userId: 'scim-service', role: 'admin' };
    await auditService.log(ctx, {
      action: 'user.update',
      objectType: 'user',
      objectId: userId,
      details: {
        source: 'scim',
        operations: operations.map((o) => ({ op: o.op, path: o.path })),
      },
    });

    return mapUserToScimResource(user as InternalUser, baseUrl);
  }

  /**
   * Deactivates a user (SCIM DELETE = soft delete / deactivation).
   * Per SCIM convention, DELETE does not physically remove the user.
   */
  async deactivateUser(
    tenantId: string,
    userId: string,
  ): Promise<boolean> {
    const existing = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, tenantId);
      return tx.user.findFirst({
        where: { id: userId, tenantId },
      });
    });

    if (!existing) return false;

    await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, tenantId);
      await tx.user.update({
        where: { id: userId },
        data: { status: 'inactive' },
      });
    });

    // Keycloak sync (fire-and-forget)
    if ((existing as InternalUser).keycloakId) {
      try {
        await keycloakAdmin.disableUser((existing as InternalUser).keycloakId!);
        logger.info(
          { userId, keycloakId: (existing as InternalUser).keycloakId, tenantId },
          'SCIM: Keycloak user disabled on SCIM DELETE',
        );
      } catch (kcErr) {
        logger.error(
          { err: kcErr, userId, tenantId },
          'SCIM: Keycloak sync failed during user deactivation (non-blocking)',
        );
      }
    }

    // Audit log
    const ctx: TenantContext = { tenantId, userId: 'scim-service', role: 'admin' };
    await auditService.log(ctx, {
      action: 'user.deactivate',
      objectType: 'user',
      objectId: userId,
      details: { source: 'scim' },
    });

    return true;
  }

  /**
   * Returns the SCIM Service Provider Configuration (RFC 7643 Section 5).
   */
  getServiceProviderConfig(baseUrl: string): Record<string, unknown> {
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
      documentationUri: 'https://docs.servanda.de/scim',
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: {
        supported: true,
        maxResults: 200,
      },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [
        {
          type: 'oauthbearertoken',
          name: 'OAuth Bearer Token',
          description: 'Authentication scheme using the OAuth Bearer Token Standard (per-tenant API key)',
          specUri: 'https://www.rfc-editor.org/info/rfc6750',
          primary: true,
        },
      ],
      meta: {
        resourceType: 'ServiceProviderConfig',
        location: `${baseUrl}/ServiceProviderConfig`,
      },
    };
  }

  /**
   * Returns the SCIM Schemas endpoint (RFC 7643 Section 7).
   */
  getSchemas(): Record<string, unknown> {
    return {
      schemas: [SCIM_LIST_RESPONSE_SCHEMA],
      totalResults: 2,
      startIndex: 1,
      itemsPerPage: 2,
      Resources: [
        {
          id: SCIM_USER_SCHEMA,
          name: 'User',
          description: 'SCIM 2.0 User Resource (RFC 7643)',
          attributes: [
            { name: 'userName', type: 'string', required: true, uniqueness: 'server' },
            { name: 'displayName', type: 'string', required: false },
            { name: 'active', type: 'boolean', required: false },
            {
              name: 'emails',
              type: 'complex',
              multiValued: true,
              subAttributes: [
                { name: 'value', type: 'string' },
                { name: 'primary', type: 'boolean' },
                { name: 'type', type: 'string' },
              ],
            },
            {
              name: 'name',
              type: 'complex',
              subAttributes: [
                { name: 'formatted', type: 'string' },
                { name: 'givenName', type: 'string' },
                { name: 'familyName', type: 'string' },
              ],
            },
          ],
          meta: {
            resourceType: 'Schema',
            location: `/Schemas/${SCIM_USER_SCHEMA}`,
          },
        },
        {
          id: SCIM_SERVANDA_EXTENSION,
          name: 'ServandaUser',
          description: 'Servanda Office user extension for roles and tenant info',
          attributes: [
            { name: 'role', type: 'string', required: false, canonicalValues: ['admin', 'editor', 'user'] },
            { name: 'tenantId', type: 'string', required: false, mutability: 'readOnly' },
            { name: 'mfaEnabled', type: 'boolean', required: false, mutability: 'readOnly' },
          ],
          meta: {
            resourceType: 'Schema',
            location: `/Schemas/${SCIM_SERVANDA_EXTENSION}`,
          },
        },
      ],
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps an internal User model to a SCIM User Resource.
 */
function mapUserToScimResource(user: InternalUser, baseUrl: string): ScimUserResource {
  const [givenName, ...familyParts] = (user.displayName || '').split(' ');
  const familyName = familyParts.join(' ') || undefined;

  return {
    schemas: [SCIM_USER_SCHEMA, SCIM_SERVANDA_EXTENSION],
    id: user.id,
    userName: user.email,
    displayName: user.displayName,
    active: user.status === 'active',
    emails: [
      {
        value: user.email,
        primary: true,
        type: 'work',
      },
    ],
    name: {
      formatted: user.displayName,
      givenName: givenName || undefined,
      familyName,
    },
    meta: {
      resourceType: 'User',
      created: user.createdAt.toISOString(),
      lastModified: user.updatedAt.toISOString(),
      location: `${baseUrl}/Users/${user.id}`,
    },
    [SCIM_SERVANDA_EXTENSION]: {
      role: user.role,
      tenantId: user.tenantId,
      mfaEnabled: user.mfaEnabled,
    },
  };
}

/**
 * Extracts email from a SCIM User resource. Falls back to userName.
 */
function extractEmail(scimUser: Partial<ScimUserResource>): string {
  // Try primary email first
  const primaryEmail = scimUser.emails?.find((e) => e.primary)?.value;
  if (primaryEmail) return primaryEmail;

  // Fall back to first email
  const firstEmail = scimUser.emails?.[0]?.value;
  if (firstEmail) return firstEmail;

  // Fall back to userName (which is typically email in SCIM)
  return scimUser.userName ?? '';
}

/**
 * Extracts the role from the Servanda SCIM extension.
 * Defaults to 'user' if not specified.
 */
function extractRole(scimUser: Partial<ScimUserResource>): string {
  const extension = scimUser[SCIM_SERVANDA_EXTENSION];
  if (extension?.role && ['admin', 'editor', 'user'].includes(extension.role)) {
    return extension.role;
  }
  return 'user';
}

/**
 * Parses a basic SCIM filter expression.
 * Currently supports: userName eq "value"
 */
function parseScimFilter(filter: string): Record<string, unknown> | null {
  // Pattern: attributeName op "value"
  const match = filter.match(/^(\w+)\s+(eq|ne|co|sw|ew)\s+"([^"]*)"$/i);
  if (!match) return null;

  const [, attribute, operator, value] = match;

  const fieldMap: Record<string, string> = {
    userName: 'email',
    displayName: 'displayName',
    'emails.value': 'email',
  };

  const dbField = fieldMap[attribute!] ?? attribute!;

  switch (operator!.toLowerCase()) {
    case 'eq':
      return { [dbField]: value };
    case 'ne':
      return { [dbField]: { not: value } };
    case 'co':
      return { [dbField]: { contains: value } };
    case 'sw':
      return { [dbField]: { startsWith: value } };
    case 'ew':
      return { [dbField]: { endsWith: value } };
    default:
      return null;
  }
}

/**
 * Applies a single SCIM PATCH operation to the update data object.
 */
function applyPatchOperation(
  op: ScimPatchOperation,
  updateData: Record<string, unknown>,
): void {
  const path = op.path;
  const value = op.value;

  if (!path && typeof value === 'object' && value !== null) {
    // No path: value is a full resource patch
    const v = value as Record<string, unknown>;
    if (v.displayName !== undefined) updateData.displayName = v.displayName;
    if (v.active !== undefined) updateData.status = v.active ? 'active' : 'inactive';
    if (v.userName !== undefined) updateData.email = v.userName;
    return;
  }

  switch (path) {
    case 'displayName':
      updateData.displayName = value;
      break;
    case 'active':
      updateData.status = value ? 'active' : 'inactive';
      break;
    case 'userName':
      updateData.email = value;
      break;
    case `${SCIM_SERVANDA_EXTENSION}:role`:
      if (typeof value === 'string' && ['admin', 'editor', 'user'].includes(value)) {
        updateData.role = value;
      }
      break;
    case 'emails[type eq "work"].value':
    case 'emails':
      if (typeof value === 'string') {
        updateData.email = value;
      } else if (Array.isArray(value) && value.length > 0) {
        const primary = (value as Array<{ value: string; primary?: boolean }>).find(
          (e) => e.primary,
        );
        updateData.email = primary?.value ?? (value[0] as { value: string }).value;
      }
      break;
    default:
      logger.debug({ path, op: op.op }, 'SCIM: Ignoring unsupported PATCH path');
  }
}

/** Singleton instance for application-wide use. */
export const scimProvisioning = new ScimProvisioningService();

/** SCIM-specific content type header value. */
export { SCIM_CONTENT_TYPE };
