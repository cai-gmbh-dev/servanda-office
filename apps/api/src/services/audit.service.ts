/**
 * AuditService — Sprint 5 (Team 02)
 *
 * Implements append-only audit logging with:
 * - Prisma-based persistence within RLS transaction
 * - In-memory fallback queue (max 1000 events, 5 min buffer)
 * - Error isolation: audit failures never block main operations
 */

import type {
  AuditService,
  AuditEventInput,
  AuditEventDto,
  AuditQueryFilter,
  TenantContext,
  PaginatedResult,
} from '@servanda/shared';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@servanda/shared';
import { Prisma } from '@prisma/client';
import { prisma, setTenantContext } from '../shared/db';
import { logger } from '../shared/logger';

interface QueuedEvent {
  tenantId: string;
  actorId: string;
  input: AuditEventInput;
  ip?: string;
  userAgent?: string;
  timestamp: Date;
}

const FALLBACK_QUEUE_MAX = 1000;
const FLUSH_INTERVAL_MS = 30_000; // 30 seconds

class AuditServiceImpl implements AuditService {
  private fallbackQueue: QueuedEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startFlushTimer();
  }

  /**
   * Logs an audit event. Never throws — failures are logged and queued.
   */
  async log(
    ctx: TenantContext,
    input: AuditEventInput,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<void> {
    try {
      await prisma.$transaction(async (tx) => {
        await setTenantContext(tx, ctx.tenantId);
        await tx.auditEvent.create({
          data: {
            tenantId: ctx.tenantId,
            actorId: ctx.userId,
            action: input.action,
            objectType: input.objectType,
            objectId: input.objectId,
            details: input.details as unknown as Prisma.InputJsonValue | undefined,
            ipAddress: meta?.ip ?? null,
            userAgent: meta?.userAgent ?? null,
          },
        });
      });
    } catch (err) {
      logger.warn({ err, action: input.action }, 'Audit write failed — queuing event');
      this.enqueue({
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        input,
        ip: meta?.ip,
        userAgent: meta?.userAgent,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Queries audit events for a tenant with optional filters.
   */
  async query(
    ctx: TenantContext,
    filter: AuditQueryFilter,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  ): Promise<PaginatedResult<AuditEventDto>> {
    const take = Math.min(pageSize, MAX_PAGE_SIZE);
    const skip = (page - 1) * take;

    const where: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (filter.action) where.action = { startsWith: filter.action };
    if (filter.objectType) where.objectType = filter.objectType;
    if (filter.objectId) where.objectId = filter.objectId;
    if (filter.from || filter.to) {
      where.timestamp = {
        ...(filter.from ? { gte: new Date(filter.from) } : {}),
        ...(filter.to ? { lte: new Date(filter.to) } : {}),
      };
    }

    const [data, total] = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, ctx.tenantId);
      return Promise.all([
        tx.auditEvent.findMany({
          where,
          orderBy: { timestamp: 'desc' },
          skip,
          take,
        }),
        tx.auditEvent.count({ where }),
      ]);
    });

    return {
      data: data.map(toDto),
      total,
      page,
      pageSize: take,
      hasMore: skip + take < total,
    };
  }

  private enqueue(event: QueuedEvent): void {
    if (this.fallbackQueue.length >= FALLBACK_QUEUE_MAX) {
      logger.error('Audit fallback queue full — dropping oldest event');
      this.fallbackQueue.shift();
    }
    this.fallbackQueue.push(event);
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      void this.flushQueue();
    }, FLUSH_INTERVAL_MS);
    // Allow process to exit even if timer is running
    if (this.flushTimer.unref) this.flushTimer.unref();
  }

  private async flushQueue(): Promise<void> {
    if (this.fallbackQueue.length === 0) return;

    const batch = this.fallbackQueue.splice(0, 50);
    logger.info({ count: batch.length }, 'Flushing audit fallback queue');

    for (const event of batch) {
      try {
        await prisma.$transaction(async (tx) => {
          await setTenantContext(tx, event.tenantId);
          await tx.auditEvent.create({
            data: {
              tenantId: event.tenantId,
              actorId: event.actorId,
              action: event.input.action,
              objectType: event.input.objectType,
              objectId: event.input.objectId,
              details: event.input.details as unknown as Prisma.InputJsonValue | undefined,
              ipAddress: event.ip ?? null,
              userAgent: event.userAgent ?? null,
              timestamp: event.timestamp,
            },
          });
        });
      } catch (err) {
        logger.error({ err }, 'Audit flush failed — re-queuing');
        this.fallbackQueue.unshift(event);
        break; // Stop flushing on failure
      }
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    await this.flushQueue();
  }
}

function toDto(event: {
  id: string;
  tenantId: string;
  actorId: string | null;
  action: string;
  objectType: string;
  objectId: string;
  details: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: Date;
}): AuditEventDto {
  return {
    id: event.id,
    tenantId: event.tenantId,
    actorId: event.actorId,
    action: event.action,
    objectType: event.objectType,
    objectId: event.objectId,
    details: (event.details as Record<string, unknown>) ?? null,
    ipAddress: event.ipAddress,
    userAgent: event.userAgent,
    timestamp: event.timestamp.toISOString(),
  };
}

export const auditService = new AuditServiceImpl();
