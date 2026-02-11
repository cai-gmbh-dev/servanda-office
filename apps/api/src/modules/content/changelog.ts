/**
 * Changelog API Routes — Sprint 7 (Team 03)
 *
 * Changelog entries for ClauseVersions track changes between versions:
 * - changeType: 'content' | 'legal' | 'editorial' | 'structure'
 * - legalImpact: 'breaking' | 'minor' | 'none'
 * - migrationNotes: guidance for contracts using previous versions
 *
 * Endpoints:
 * - POST   /clauses/:id/versions/:vid/changelog  — Add changelog entry
 * - GET    /clauses/:id/versions/:vid/changelog   — Get changelog entries
 * - GET    /clauses/:id/changelog                 — Get full changelog across versions
 */

import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma, setTenantContext } from '../../shared/db';
import { getTenantContext } from '../../middleware/tenant-context';
import { requireRole } from '../../middleware/auth';
import { NotFoundError } from '../../middleware/error-handler';

export const changelogRouter = Router();

const createChangelogSchema = z.object({
  changeType: z.enum(['content', 'legal', 'editorial', 'structure']),
  legalImpact: z.enum(['breaking', 'minor', 'none']),
  summary: z.string().min(1).max(2000),
  migrationNotes: z.string().max(5000).optional(),
  affectedSections: z.array(z.string()).optional(),
});

// POST /clauses/:id/versions/:vid/changelog
changelogRouter.post(
  '/clauses/:id/versions/:vid/changelog',
  requireRole('admin', 'editor'),
  async (req, res, next) => {
    try {
      const ctx = getTenantContext(req);
      const input = createChangelogSchema.parse(req.body);

      const result = await prisma.$transaction(async (tx) => {
        await setTenantContext(tx, ctx.tenantId);

        // Verify clause version exists
        const version = await tx.clauseVersion.findFirst({
          where: { id: req.params.vid, clauseId: req.params.id },
        });
        if (!version) throw new NotFoundError('ClauseVersion', req.params.vid!);

        // Store changelog in version metadata
        const existingMeta = (version.metadata as Record<string, unknown>) ?? {};
        const existingChangelog = (existingMeta.changelog as ChangelogEntry[]) ?? [];

        const entry: ChangelogEntry = {
          id: crypto.randomUUID(),
          versionNumber: version.versionNumber,
          changeType: input.changeType,
          legalImpact: input.legalImpact,
          summary: input.summary,
          migrationNotes: input.migrationNotes ?? null,
          affectedSections: input.affectedSections ?? [],
          authorId: ctx.userId,
          createdAt: new Date().toISOString(),
        };

        const updatedChangelog = [...existingChangelog, entry];

        await tx.clauseVersion.update({
          where: { id: req.params.vid },
          data: {
            metadata: { ...existingMeta, changelog: updatedChangelog } as unknown as Prisma.InputJsonValue,
          },
        });

        return entry;
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /clauses/:id/versions/:vid/changelog
changelogRouter.get('/clauses/:id/versions/:vid/changelog', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);

    const version = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);
      return tx.clauseVersion.findFirst({
        where: { id: req.params.vid, clauseId: req.params.id },
      });
    });

    if (!version) throw new NotFoundError('ClauseVersion', req.params.vid!);

    const meta = (version.metadata as Record<string, unknown>) ?? {};
    const changelog = (meta.changelog as ChangelogEntry[]) ?? [];

    res.json({
      versionId: version.id,
      versionNumber: version.versionNumber,
      entries: changelog,
    });
  } catch (err) {
    next(err);
  }
});

// GET /clauses/:id/changelog — Full changelog across all versions
changelogRouter.get('/clauses/:id/changelog', async (req, res, next) => {
  try {
    const ctx = getTenantContext(req);

    const versions = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);

      const clause = await tx.clause.findFirst({
        where: { id: req.params.id, tenantId: ctx.tenantId },
      });
      if (!clause) throw new NotFoundError('Clause', req.params.id!);

      return tx.clauseVersion.findMany({
        where: { clauseId: req.params.id },
        orderBy: { versionNumber: 'desc' },
      });
    });

    const changelog = versions.flatMap((v) => {
      const meta = (v.metadata as Record<string, unknown>) ?? {};
      const entries = (meta.changelog as ChangelogEntry[]) ?? [];
      return entries.map((e) => ({ ...e, versionId: v.id }));
    });

    res.json({
      clauseId: req.params.id,
      entries: changelog,
    });
  } catch (err) {
    next(err);
  }
});

interface ChangelogEntry {
  id: string;
  versionNumber: number;
  changeType: string;
  legalImpact: string;
  summary: string;
  migrationNotes: string | null;
  affectedSections: string[];
  authorId: string;
  createdAt: string;
}
