/**
 * Audit Consumer — Sprint 13 (Team 01 - Product Architecture)
 *
 * Event-driven audit logging consumer.
 * Subscribes to ALL domain event types on the EventBus and transforms
 * them into audit log entries using the existing auditService.
 *
 * This is the bridge between the new event system and the existing
 * audit infrastructure. It enables:
 * - Decoupled audit logging (producers don't need to know about audit)
 * - Consistent audit trail for all domain events
 * - Backward compatibility: direct auditService.log() calls still work
 *
 * Usage:
 *   import { registerAuditConsumer } from './events/audit-consumer';
 *   registerAuditConsumer();  // Call once at app startup
 */

import type { DomainEvent, DomainEventType } from '@servanda/shared';
import type { AuditAction } from '@servanda/shared';
import { getEventBus } from '@servanda/shared';
import { auditService } from '../services/audit.service';
import { logger } from '../shared/logger';

// === Event-to-Audit Mapping ===

/**
 * Maps DomainEventType to AuditAction and objectType.
 * Each domain event type has a default audit action and object type.
 * The payload can override objectType and objectId.
 */
interface AuditMapping {
  action: AuditAction;
  objectType: string;
}

const EVENT_AUDIT_MAP: Record<DomainEventType, AuditMapping> = {
  TemplatePublished: {
    action: 'template.publish',
    objectType: 'template',
  },
  ContractCompleted: {
    action: 'contract.complete',
    objectType: 'contract',
  },
  ExportCompleted: {
    action: 'export.complete',
    objectType: 'export_job',
  },
  ClauseUpdated: {
    action: 'clause.create',
    objectType: 'clause',
  },
  UserProvisioned: {
    action: 'user.invite',
    objectType: 'user',
  },
  AuditRequired: {
    action: 'tenant.settings_change',
    objectType: 'tenant',
  },
};

/**
 * Transforms a DomainEvent into an audit log entry and persists it.
 *
 * The handler extracts:
 * - action: from the EVENT_AUDIT_MAP based on event type
 * - objectType: from mapping, overridable via payload.objectType
 * - objectId: from payload.objectId, or payload.id, or 'unknown'
 * - details: the full event payload plus correlationId
 * - tenantId/userId: from the event's tenantId and payload.userId
 */
async function handleDomainEvent(event: DomainEvent): Promise<void> {
  const mapping = EVENT_AUDIT_MAP[event.type];
  if (!mapping) {
    logger.warn({ eventType: event.type }, 'Audit consumer: no mapping for event type');
    return;
  }

  // Extract audit action — allow payload to override with a more specific action
  const action = (typeof event.payload.auditAction === 'string'
    ? event.payload.auditAction
    : mapping.action) as AuditAction;

  // Extract object identifiers
  const objectType = (typeof event.payload.objectType === 'string'
    ? event.payload.objectType
    : mapping.objectType);
  const objectId = (typeof event.payload.objectId === 'string'
    ? event.payload.objectId
    : typeof event.payload.id === 'string'
      ? event.payload.id
      : 'unknown');

  // Extract user context
  const userId = typeof event.payload.userId === 'string'
    ? event.payload.userId
    : 'system';
  const userRole = typeof event.payload.userRole === 'string'
    ? event.payload.userRole as 'admin' | 'editor' | 'user'
    : 'admin';

  // Build tenant context for the audit service
  const ctx = {
    tenantId: event.tenantId,
    userId,
    role: userRole,
  };

  // Build details with correlation tracking
  const details: Record<string, unknown> = {
    ...event.payload,
    correlationId: event.correlationId,
    eventType: event.type,
    eventTimestamp: event.timestamp.toISOString(),
  };

  // Extract optional HTTP metadata from payload
  const meta: { ip?: string; userAgent?: string } = {};
  if (typeof event.payload.ip === 'string') {
    meta.ip = event.payload.ip;
  }
  if (typeof event.payload.userAgent === 'string') {
    meta.userAgent = event.payload.userAgent;
  }

  try {
    await auditService.log(ctx, {
      action,
      objectType,
      objectId,
      details,
    }, meta);

    logger.debug(
      { eventType: event.type, action, objectType, objectId, correlationId: event.correlationId },
      'Audit consumer: event logged successfully',
    );
  } catch (err) {
    // AuditService already handles its own errors (fallback queue),
    // but we log here for visibility at the event-system level.
    logger.error(
      { err, eventType: event.type, correlationId: event.correlationId },
      'Audit consumer: failed to log event',
    );
    throw err; // Re-throw so EventBus counts it as an error
  }
}

// === Registration ===

/** All event types that the audit consumer subscribes to */
const ALL_EVENT_TYPES: DomainEventType[] = [
  'TemplatePublished',
  'ContractCompleted',
  'ExportCompleted',
  'ClauseUpdated',
  'UserProvisioned',
  'AuditRequired',
];

let registered = false;

/**
 * Registers the audit consumer on the global EventBus.
 * Safe to call multiple times — only registers once.
 *
 * Call this at application startup (e.g., in main.ts).
 */
export function registerAuditConsumer(): void {
  if (registered) {
    logger.warn('Audit consumer already registered — skipping');
    return;
  }

  const bus = getEventBus();

  for (const eventType of ALL_EVENT_TYPES) {
    bus.subscribe(eventType, handleDomainEvent);
  }

  registered = true;
  logger.info(
    { eventTypes: ALL_EVENT_TYPES },
    'Audit consumer registered for all domain event types',
  );
}

/**
 * Unregisters the audit consumer from the global EventBus.
 * Intended for use in tests or graceful shutdown.
 */
export function unregisterAuditConsumer(): void {
  if (!registered) return;

  const bus = getEventBus();

  for (const eventType of ALL_EVENT_TYPES) {
    bus.unsubscribe(eventType, handleDomainEvent);
  }

  registered = false;
  logger.info('Audit consumer unregistered');
}
