/**
 * Identity API Routes — Sprint 5+8 (Team 02)
 *
 * Endpoints:
 * - GET    /users           — List users in tenant
 * - GET    /users/:id       — Get single user
 * - POST   /users/invite    — Invite user (admin only)
 * - PATCH  /users/:id       — Update user (admin only)
 * - POST   /users/:id/activate   — Activate invited user (admin only)
 * - POST   /users/:id/deactivate — Deactivate user (admin only)
 * - DELETE /users/:id       — Delete user (admin only)
 * - GET    /audit-logs      — Query audit events (admin only)
 * - GET    /me              — Current user info
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma, setTenantContext } from '../../shared/db';
import { getTenantContext } from '../../middleware/tenant-context';
import { requireRole } from '../../middleware/auth';
import { auditService } from '../../services/audit.service';
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

    await auditService.log(ctx, {
      action: 'user.invite',
      objectType: 'user',
      objectId: user.id,
      details: { email: input.email, role: input.role },
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

    await auditService.log(ctx, {
      action: 'user.activate',
      objectType: 'user',
      objectId: user.id,
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

    await auditService.log(ctx, {
      action: 'user.deactivate',
      objectType: 'user',
      objectId: user.id,
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

    await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      const existing = await tx.user.findFirst({
        where: { id: req.params.id, tenantId: ctx.tenantId },
      });
      if (!existing) throw new NotFoundError('User', req.params.id!);
      if (existing.id === ctx.userId) {
        throw new AppError(400, 'Cannot delete yourself', 'BAD_REQUEST');
      }

      await tx.user.delete({ where: { id: req.params.id } });
    });

    await auditService.log(ctx, {
      action: 'user.delete',
      objectType: 'user',
      objectId: req.params.id!,
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
