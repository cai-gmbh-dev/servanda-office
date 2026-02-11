/**
 * Kanzlei-Branding Style Template Routes — Sprint 5 (Team 05)
 *
 * CRUD for style templates that control the visual appearance of exported
 * documents (fonts, colors, margins, logos, footer text). Each template is
 * tenant-scoped and can be referenced by export jobs.
 *
 * Endpoints:
 * - POST   /style-templates      — Create a style template (admin)
 * - GET    /style-templates      — List style templates (paginated)
 * - GET    /style-templates/:id  — Get a single style template
 * - PATCH  /style-templates/:id  — Update a style template (admin)
 * - DELETE /style-templates/:id  — Delete a style template (admin)
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma, setTenantContext } from '../../shared/db';
import { getTenantContext } from '../../middleware/tenant-context';
import { requireRole } from '../../middleware/auth';
import { auditService } from '../../services/audit.service';
import { NotFoundError, ConflictError } from '../../middleware/error-handler';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@servanda/shared';

export const brandingRouter = Router();

// --- Validation Schemas ---

const pageMarginsSchema = z.object({
  top: z.number().min(0).max(100),
  right: z.number().min(0).max(100),
  bottom: z.number().min(0).max(100),
  left: z.number().min(0).max(100),
});

const createStyleTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  logoUrl: z.string().url().max(2048).optional(),
  primaryFont: z.string().max(100).default('Arial'),
  fontSize: z.number().int().min(6).max(72).default(11),
  headerFont: z.string().max(100).optional(),
  headerFontSize: z.number().int().min(6).max(72).optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  footerText: z.string().max(500).optional(),
  pageMargins: pageMarginsSchema.optional(),
});

const updateStyleTemplateSchema = createStyleTemplateSchema.partial();

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

// --- Create Style Template (admin only) ---
brandingRouter.post('/style-templates', requireRole('admin'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const input = createStyleTemplateSchema.parse(req.body);

    const template = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);
      return tx.styleTemplate.create({
        data: {
          tenantId: ctx.tenantId,
          name: input.name,
          description: input.description ?? null,
          logoUrl: input.logoUrl ?? null,
          primaryFont: input.primaryFont,
          fontSize: input.fontSize,
          headerFont: input.headerFont ?? null,
          headerFontSize: input.headerFontSize ?? null,
          primaryColor: input.primaryColor ?? null,
          secondaryColor: input.secondaryColor ?? null,
          footerText: input.footerText ?? null,
          pageMargins: input.pageMargins ?? undefined,
        },
      });
    });

    await auditService.log(ctx, {
      action: 'branding.style_template.create',
      objectType: 'style_template',
      objectId: template.id,
      details: { name: input.name },
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });

    res.status(201).json(formatStyleTemplate(template));
  } catch (err) {
    next(err);
  }
});

// --- List Style Templates (paginated) ---
brandingRouter.get('/style-templates', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const { page, pageSize } = listQuerySchema.parse(req.query);
    const take = Math.min(pageSize, MAX_PAGE_SIZE);
    const skip = (page - 1) * take;

    const [data, total] = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);
      return Promise.all([
        tx.styleTemplate.findMany({
          where: { tenantId: ctx.tenantId },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        tx.styleTemplate.count({
          where: { tenantId: ctx.tenantId },
        }),
      ]);
    });

    res.json({
      data: data.map(formatStyleTemplate),
      total,
      page,
      pageSize: take,
      hasMore: skip + take < total,
    });
  } catch (err) {
    next(err);
  }
});

// --- Get Single Style Template ---
brandingRouter.get('/style-templates/:id', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);

    const template = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);
      return tx.styleTemplate.findFirst({
        where: { id: req.params.id, tenantId: ctx.tenantId },
      });
    });

    if (!template) throw new NotFoundError('StyleTemplate', req.params.id!);
    res.json(formatStyleTemplate(template));
  } catch (err) {
    next(err);
  }
});

// --- Update Style Template (admin only) ---
brandingRouter.patch('/style-templates/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);
    const input = updateStyleTemplateSchema.parse(req.body);

    const template = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      const existing = await tx.styleTemplate.findFirst({
        where: { id: req.params.id, tenantId: ctx.tenantId },
      });
      if (!existing) throw new NotFoundError('StyleTemplate', req.params.id!);

      return tx.styleTemplate.update({
        where: { id: existing.id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl }),
          ...(input.primaryFont !== undefined && { primaryFont: input.primaryFont }),
          ...(input.fontSize !== undefined && { fontSize: input.fontSize }),
          ...(input.headerFont !== undefined && { headerFont: input.headerFont }),
          ...(input.headerFontSize !== undefined && { headerFontSize: input.headerFontSize }),
          ...(input.primaryColor !== undefined && { primaryColor: input.primaryColor }),
          ...(input.secondaryColor !== undefined && { secondaryColor: input.secondaryColor }),
          ...(input.footerText !== undefined && { footerText: input.footerText }),
          ...(input.pageMargins !== undefined && { pageMargins: input.pageMargins }),
        },
      });
    });

    await auditService.log(ctx, {
      action: 'branding.style_template.update',
      objectType: 'style_template',
      objectId: template.id,
      details: { updatedFields: Object.keys(input) },
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });

    res.json(formatStyleTemplate(template));
  } catch (err) {
    next(err);
  }
});

// --- Delete Style Template (admin only) ---
brandingRouter.delete('/style-templates/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);

    await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      const existing = await tx.styleTemplate.findFirst({
        where: { id: req.params.id, tenantId: ctx.tenantId },
      });
      if (!existing) throw new NotFoundError('StyleTemplate', req.params.id!);

      // Prevent deletion if referenced by any export job
      const referencingJobs = await tx.exportJob.count({
        where: { tenantId: ctx.tenantId, styleTemplateId: existing.id },
      });
      if (referencingJobs > 0) {
        throw new ConflictError(
          `Cannot delete style template — it is referenced by ${referencingJobs} export job(s)`,
        );
      }

      await tx.styleTemplate.delete({ where: { id: existing.id } });
    });

    await auditService.log(ctx, {
      action: 'branding.style_template.delete',
      objectType: 'style_template',
      objectId: req.params.id!,
      details: {},
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// --- Helpers ---

function formatStyleTemplate(t: {
  id: string; tenantId: string; name: string;
  description: string | null; logoUrl: string | null;
  primaryFont: string; fontSize: number;
  headerFont: string | null; headerFontSize: number | null;
  primaryColor: string | null; secondaryColor: string | null;
  footerText: string | null; pageMargins: unknown;
  createdAt: Date; updatedAt: Date;
}) {
  return {
    id: t.id,
    tenantId: t.tenantId,
    name: t.name,
    description: t.description,
    logoUrl: t.logoUrl,
    primaryFont: t.primaryFont,
    fontSize: t.fontSize,
    headerFont: t.headerFont,
    headerFontSize: t.headerFontSize,
    primaryColor: t.primaryColor,
    secondaryColor: t.secondaryColor,
    footerText: t.footerText,
    pageMargins: t.pageMargins ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
