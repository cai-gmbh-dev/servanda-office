/**
 * Identity API Routes — Sprint 5+8+9 (Team 02)
 *
 * Endpoints:
 * - GET    /users           — List users in tenant
 * - GET    /users/:id       — Get single user
 * - POST   /users/invite    — Invite user (admin only) + Keycloak sync
 * - PATCH  /users/:id       — Update user (admin only) + Keycloak role sync
 * - POST   /users/:id/activate   — Activate invited user (admin only) + Keycloak sync
 * - POST   /users/:id/deactivate — Deactivate user (admin only) + Keycloak sync
 * - DELETE /users/:id       — Delete user (admin only) + Keycloak sync
 * - GET    /audit-logs      — Query audit events (admin only)
 * - GET    /me              — Current user info
 *
 * Sprint 9 additions:
 * - Keycloak Admin API integration: all write operations are synchronised
 *   to Keycloak via the KeycloakAdminService. Keycloak calls are fire-and-forget
 *   (wrapped in try/catch) so they never block the primary DB operation.
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma, setTenantContext } from '../../shared/db';
import { getTenantContext } from '../../middleware/tenant-context';
import { requireRole } from '../../middleware/auth';
import { auditService } from '../../services/audit.service';
import { keycloakAdmin } from '../../services/keycloak-admin';
import { logger } from '../../shared/logger';
import { NotFoundError, AppError } from '../../middleware/error-handler';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@servanda/shared';

export const identityRouter = Router();

// --- List Users ---
identityRouter.get('/users', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(Number(req.query.pageSize) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const skip = (page - 1) * pageSize;

    const [data, total] = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);
      return Promise.all([
        tx.user.findMany({
          where: { tenantId: ctx.tenantId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
        }),
        tx.user.count({ where: { tenantId: ctx.tenantId } }),
      ]);
    });

    res.json({
      data: data.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        role: u.role,
        status: u.status,
        mfaEnabled: u.mfaEnabled,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
      hasMore: skip + pageSize < total,
    });
  } catch (err) {
    next(err);
  }
});

// --- Get Single User ---
identityRouter.get('/users/:id', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);

    const user = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);
      return tx.user.findFirst({
        where: { id: req.params.id, tenantId: ctx.tenantId },
      });
    });

    if (!user) throw new NotFoundError('User', req.params.id!);

    res.json(formatUser(user));
  } catch (err) {
    next(err);
  }
});

// --- Current User Info ---
identityRouter.get('/me', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);

    const user = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);
      return tx.user.findFirst({
        where: { id: ctx.userId, tenantId: ctx.tenantId },
      });
    });

    if (!user) throw new NotFoundError('User', ctx.userId);

    res.json(formatUser(user));
  } catch (err) {
    next(err);
  }
});

// --- Invite User (Admin only) ---
const inviteSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(255),
  role: z.enum(['admin', 'editor', 'user']),
});

identityRouter.post('/users/invite', requireRole('admin'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const input = inviteSchema.parse(req.body);

    const user = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      const existing = await tx.user.findUnique({
        where: { tenantId_email: { tenantId: ctx.tenantId, email: input.email } },
      });
      if (existing) {
        throw new AppError(409, `User with email ${input.email} already exists`, 'CONFLICT');
      }

      return tx.user.create({
        data: {
          tenantId: ctx.tenantId,
          email: input.email,
          displayName: input.displayName,
          role: input.role,
          status: 'invited',
        },
      });
    });

    // --- Keycloak sync (fire-and-forget, never blocks main operation) ---
    let keycloakUserId: string | null = null;
    try {
      keycloakUserId = await keycloakAdmin.createUser(input.email, input.displayName);
      if (keycloakUserId) {
        await keycloakAdmin.assignRealmRole(keycloakUserId, input.role);
        logger.info(
          { userId: user.id, keycloakUserId, role: input.role },
          'Keycloak user created and role assigned on invite',
        );
      }
    } catch (kcErr) {
      logger.error(
        { err: kcErr, userId: user.id, email: input.email },
        'Keycloak sync failed during user invite (non-blocking)',
      );
    }

    await auditService.log(ctx, {
      action: 'user.invite',
      objectType: 'user',
      objectId: user.id,
      details: { email: input.email, role: input.role, keycloakUserId },
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });

    res.status(201).json({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// --- Update User (Admin only) ---
const updateUserSchema = z.object({
  role: z.enum(['admin', 'editor', 'user']).optional(),
  displayName: z.string().min(1).max(255).optional(),
});

identityRouter.patch('/users/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const input = updateUserSchema.parse(req.body);

    const user = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      const existing = await tx.user.findFirst({
        where: { id: req.params.id, tenantId: ctx.tenantId },
      });
      if (!existing) throw new NotFoundError('User', req.params.id!);

      const updateData: Record<string, unknown> = {};
      if (input.role !== undefined) updateData.role = input.role;
      if (input.displayName !== undefined) updateData.displayName = input.displayName;

      return tx.user.update({
        where: { id: req.params.id },
        data: updateData,
      });
    });

    // --- Keycloak sync: role change (fire-and-forget) ---
    if (input.role !== undefined && user.keycloakId) {
      try {
        await keycloakAdmin.assignRealmRole(user.keycloakId, input.role);
        logger.info(
          { userId: user.id, keycloakId: user.keycloakId, newRole: input.role },
          'Keycloak realm role updated on user patch',
        );
      } catch (kcErr) {
        logger.error(
          { err: kcErr, userId: user.id, role: input.role },
          'Keycloak role sync failed during user update (non-blocking)',
        );
      }
    }

    await auditService.log(ctx, {
      action: 'user.update',
      objectType: 'user',
      objectId: user.id,
      details: { updatedFields: Object.keys(input).filter((k) => input[k as keyof typeof input] !== undefined) },
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });

    res.json(formatUser(user));
  } catch (err) {
    next(err);
  }
});

// --- Activate User (Admin only) ---
identityRouter.post('/users/:id/activate', requireRole('admin'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);

    const user = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      const existing = await tx.user.findFirst({
        where: { id: req.params.id, tenantId: ctx.tenantId },
      });
      if (!existing) throw new NotFoundError('User', req.params.id!);
      if (existing.status === 'active') {
        throw new AppError(409, 'User is already active', 'CONFLICT');
      }

      return tx.user.update({
        where: { id: req.params.id },
        data: { status: 'active' },
      });
    });

    // --- Keycloak sync: enable user (fire-and-forget) ---
    if (user.keycloakId) {
      try {
        await keycloakAdmin.enableUser(user.keycloakId);
        logger.info(
          { userId: user.id, keycloakId: user.keycloakId },
          'Keycloak user enabled on activate',
        );
      } catch (kcErr) {
        logger.error(
          { err: kcErr, userId: user.id },
          'Keycloak enable failed during user activate (non-blocking)',
        );
      }
    }

    await auditService.log(ctx, {
      action: 'user.activate',
      objectType: 'user',
      objectId: user.id,
      details: { keycloakSynced: !!user.keycloakId },
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });

    res.json(formatUser(user));
  } catch (err) {
    next(err);
  }
});

// --- Deactivate User (Admin only) ---
identityRouter.post('/users/:id/deactivate', requireRole('admin'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);

    const user = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      const existing = await tx.user.findFirst({
        where: { id: req.params.id, tenantId: ctx.tenantId },
      });
      if (!existing) throw new NotFoundError('User', req.params.id!);
      if (existing.status === 'inactive') {
        throw new AppError(409, 'User is already inactive', 'CONFLICT');
      }
      if (existing.id === ctx.userId) {
        throw new AppError(400, 'Cannot deactivate yourself', 'BAD_REQUEST');
      }

      return tx.user.update({
        where: { id: req.params.id },
        data: { status: 'inactive' },
      });
    });

    // --- Keycloak sync: disable user (fire-and-forget) ---
    if (user.keycloakId) {
      try {
        await keycloakAdmin.disableUser(user.keycloakId);
        logger.info(
          { userId: user.id, keycloakId: user.keycloakId },
          'Keycloak user disabled on deactivate',
        );
      } catch (kcErr) {
        logger.error(
          { err: kcErr, userId: user.id },
          'Keycloak disable failed during user deactivate (non-blocking)',
        );
      }
    }

    await auditService.log(ctx, {
      action: 'user.deactivate',
      objectType: 'user',
      objectId: user.id,
      details: { keycloakSynced: !!user.keycloakId },
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });

    res.json(formatUser(user));
  } catch (err) {
    next(err);
  }
});

// --- Delete User (Admin only) ---
identityRouter.delete('/users/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);

    // Fetch user before deletion to get keycloakId
    let keycloakId: string | null = null;

    await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      const existing = await tx.user.findFirst({
        where: { id: req.params.id, tenantId: ctx.tenantId },
      });
      if (!existing) throw new NotFoundError('User', req.params.id!);
      if (existing.id === ctx.userId) {
        throw new AppError(400, 'Cannot delete yourself', 'BAD_REQUEST');
      }

      keycloakId = existing.keycloakId ?? null;

      await tx.user.delete({ where: { id: req.params.id } });
    });

    // --- Keycloak sync: delete user (fire-and-forget) ---
    if (keycloakId) {
      try {
        await keycloakAdmin.deleteUser(keycloakId);
        logger.info(
          { userId: req.params.id, keycloakId },
          'Keycloak user deleted on user deletion',
        );
      } catch (kcErr) {
        logger.error(
          { err: kcErr, userId: req.params.id, keycloakId },
          'Keycloak delete failed during user deletion (non-blocking)',
        );
      }
    }

    await auditService.log(ctx, {
      action: 'user.delete',
      objectType: 'user',
      objectId: req.params.id!,
      details: { keycloakSynced: !!keycloakId },
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// --- Query Audit Logs (Admin only) ---
identityRouter.get('/audit-logs', requireRole('admin'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(Number(req.query.pageSize) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const result = await auditService.query(
      ctx,
      {
        action: req.query.action as string | undefined,
        objectType: req.query.objectType as string | undefined,
        objectId: req.query.objectId as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
      },
      page,
      pageSize,
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// FORMATTER
// ============================================================

function formatUser(u: {
  id: string; email: string; displayName: string;
  role: string; status: string; mfaEnabled: boolean;
  lastLoginAt: Date | null; createdAt: Date;
  keycloakId?: string | null;
}) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    status: u.status,
    mfaEnabled: u.mfaEnabled,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}
