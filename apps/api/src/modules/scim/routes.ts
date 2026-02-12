/**
 * SCIM 2.0 API Routes — Sprint 13 (Team 02)
 *
 * RFC 7644-compliant SCIM provisioning endpoints.
 * Mounted on /api/v1/scim in main.ts.
 *
 * Authentication: Bearer token (per-tenant SCIM API key).
 * These routes do NOT use the standard JWT auth middleware — they use
 * a dedicated SCIM bearer token resolver to identify the tenant.
 *
 * Endpoints:
 *   GET    /Users                — List users (supports SCIM filtering)
 *   GET    /Users/:id            — Get single user
 *   POST   /Users                — Create user
 *   PATCH  /Users/:id            — Update user attributes
 *   DELETE /Users/:id            — Deactivate user (soft delete)
 *   GET    /ServiceProviderConfig — SCIM service provider configuration
 *   GET    /Schemas              — Supported SCIM schemas
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { AppError } from '../../middleware/error-handler';
import {
  scimProvisioning,
  resolveScimApiKey,
  SCIM_CONTENT_TYPE,
  SCIM_ERROR_SCHEMA,
  type ScimError,
  type ScimPatchRequest,
  type ScimUserResource,
} from '../../services/scim-provisioning';

export const scimRouter = Router();

// ---------------------------------------------------------------------------
// SCIM Bearer Token Authentication Middleware
// ---------------------------------------------------------------------------

/**
 * Authenticates SCIM requests using per-tenant API keys.
 * Sets req.scimTenantId for downstream handlers.
 */
function scimAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next(
      new AppError(401, 'Missing or invalid Authorization header', 'UNAUTHORIZED'),
    );
  }

  const token = authHeader.slice(7);
  const resolved = resolveScimApiKey(token);

  if (!resolved) {
    return next(
      new AppError(401, 'Invalid SCIM API key', 'UNAUTHORIZED'),
    );
  }

  // Attach tenant ID to request for SCIM handlers
  (req as ScimRequest).scimTenantId = resolved.tenantId;
  next();
}

interface ScimRequest extends Request {
  scimTenantId: string;
}

// Apply SCIM auth to all SCIM routes
scimRouter.use(scimAuth);

// Set SCIM content type on all responses
scimRouter.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Content-Type', SCIM_CONTENT_TYPE);
  next();
});

// ---------------------------------------------------------------------------
// Helper: Build base URL for SCIM resource locations
// ---------------------------------------------------------------------------

function getScimBaseUrl(req: Request): string {
  const protocol = req.protocol;
  const host = req.get('host') ?? 'localhost';
  const basePath = req.baseUrl; // e.g. /api/v1/scim
  return `${protocol}://${host}${basePath}`;
}

// ---------------------------------------------------------------------------
// Helper: Create SCIM error response
// ---------------------------------------------------------------------------

function scimError(status: number, detail: string, scimType?: string): ScimError {
  return {
    schemas: [SCIM_ERROR_SCHEMA],
    status: String(status),
    detail,
    ...(scimType ? { scimType } : {}),
  };
}

// ---------------------------------------------------------------------------
// GET /ServiceProviderConfig — SCIM Service Provider Configuration
// ---------------------------------------------------------------------------

scimRouter.get('/ServiceProviderConfig', (req: Request, res: Response) => {
  const baseUrl = getScimBaseUrl(req);
  const config = scimProvisioning.getServiceProviderConfig(baseUrl);
  res.json(config);
});

// ---------------------------------------------------------------------------
// GET /Schemas — Supported SCIM Schemas
// ---------------------------------------------------------------------------

scimRouter.get('/Schemas', (_req: Request, res: Response) => {
  const schemas = scimProvisioning.getSchemas();
  res.json(schemas);
});

// ---------------------------------------------------------------------------
// GET /Users — List Users
// ---------------------------------------------------------------------------

scimRouter.get('/Users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as ScimRequest).scimTenantId;
    const baseUrl = getScimBaseUrl(req);

    const filter = req.query.filter as string | undefined;
    const startIndex = Number(req.query.startIndex) || 1;
    const count = Number(req.query.count) || 100;

    const result = await scimProvisioning.listUsers(tenantId, {
      filter,
      startIndex,
      count,
      baseUrl,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /Users/:id — Get Single User
// ---------------------------------------------------------------------------

scimRouter.get('/Users/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as ScimRequest).scimTenantId;
    const baseUrl = getScimBaseUrl(req);

    const resource = await scimProvisioning.getUser(tenantId, req.params.id!, baseUrl);

    if (!resource) {
      res.status(404).json(scimError(404, `User ${req.params.id} not found`, 'invalidValue'));
      return;
    }

    res.json(resource);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /Users — Create User
// ---------------------------------------------------------------------------

scimRouter.post('/Users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as ScimRequest).scimTenantId;
    const baseUrl = getScimBaseUrl(req);

    const scimUser = req.body as Partial<ScimUserResource>;

    // Validate required fields
    if (!scimUser.userName && !scimUser.emails?.length) {
      res.status(400).json(
        scimError(400, 'userName or emails is required', 'invalidValue'),
      );
      return;
    }

    const result = await scimProvisioning.createUser(tenantId, scimUser, baseUrl);

    if (result.alreadyExists) {
      res.status(409).json(
        scimError(409, 'User already exists', 'uniqueness'),
      );
      return;
    }

    res.status(201).json(result.resource);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /Users/:id — Update User Attributes
// ---------------------------------------------------------------------------

scimRouter.patch('/Users/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as ScimRequest).scimTenantId;
    const baseUrl = getScimBaseUrl(req);

    const patchReq = req.body as ScimPatchRequest;

    if (!patchReq.Operations || !Array.isArray(patchReq.Operations)) {
      res.status(400).json(
        scimError(400, 'Invalid PATCH request: Operations array is required', 'invalidSyntax'),
      );
      return;
    }

    const resource = await scimProvisioning.patchUser(
      tenantId,
      req.params.id!,
      patchReq.Operations,
      baseUrl,
    );

    if (!resource) {
      res.status(404).json(scimError(404, `User ${req.params.id} not found`, 'invalidValue'));
      return;
    }

    res.json(resource);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /Users/:id — Deactivate User
// ---------------------------------------------------------------------------

scimRouter.delete('/Users/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as ScimRequest).scimTenantId;

    const success = await scimProvisioning.deactivateUser(tenantId, req.params.id!);

    if (!success) {
      res.status(404).json(scimError(404, `User ${req.params.id} not found`, 'invalidValue'));
      return;
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
