/**
 * EventBus — Sprint 13 (Team 01 - Product Architecture)
 *
 * Domain Event System foundation for Servanda Office.
 * Provides a typed event bus with:
 * - DomainEvent interface for all cross-module events
 * - EventBus interface (publish/subscribe/unsubscribe)
 * - InProcessEventBus implementation with error isolation
 * - Singleton factory via getEventBus()
 * - Stats tracking for observability
 *
 * Future: Can be replaced with a distributed bus (Redis Streams, NATS)
 * by implementing the same EventBus interface.
 */

// === Domain Event Types ===

/**
 * All domain event type identifiers.
 * Each event type maps to a specific domain action.
 */
export type DomainEventType =
  | 'TemplatePublished'
  | 'ContractCompleted'
  | 'ExportCompleted'
  | 'ClauseUpdated'
  | 'UserProvisioned'
  | 'AuditRequired';

/**
 * Base domain event structure.
 * Every event published through the EventBus conforms to this shape.
 */
export interface DomainEvent {
  /** The event type identifier */
  type: DomainEventType;
  /** The tenant context for multi-tenant isolation */
  tenantId: string;
  /** Arbitrary event payload */
  payload: Record<string, unknown>;
  /** When the event was created */
  timestamp: Date;
  /** Correlation ID for tracing across services */
  correlationId: string;
}

/**
 * Handler function signature for domain events.
 */
export type EventHandler = (event: DomainEvent) => Promise<void> | void;

/**
 * Stats snapshot from the EventBus for observability.
 */
export interface EventBusStats {
  /** Total number of events published since startup */
  publishedCount: number;
  /** Total number of registered handlers across all event types */
  handlerCount: number;
  /** Total number of handler errors caught since startup */
  errorCount: number;
  /** Timestamp of the last published event, or null if none */
  lastEventAt: Date | null;
}

// === EventBus Interface ===

/**
 * EventBus contract — all implementations (in-process, distributed) must satisfy this.
 */
export interface EventBus {
  /**
   * Publishes a domain event to all registered handlers.
   * Handlers are invoked asynchronously (fire-and-forget).
   * An error in one handler does not affect others.
   */
  publish(event: DomainEvent): Promise<void>;

  /**
   * Registers a handler for a specific event type.
   * The same handler can be registered for multiple event types.
   */
  subscribe(eventType: string, handler: EventHandler): void;

  /**
   * Removes a previously registered handler for a specific event type.
   * If the handler was not registered, this is a no-op.
   */
  unsubscribe(eventType: string, handler: EventHandler): void;

  /**
   * Returns current stats snapshot for observability/metrics.
   */
  getStats(): EventBusStats;
}

// === InProcessEventBus Implementation ===

/**
 * In-process EventBus implementation.
 *
 * - Stores handlers in a Map keyed by event type.
 * - publish() invokes all handlers for the event type asynchronously.
 * - Errors in individual handlers are caught and counted (error isolation).
 * - Thread-safe for single-process Node.js (no mutex needed).
 */
export class InProcessEventBus implements EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private stats: EventBusStats = {
    publishedCount: 0,
    handlerCount: 0,
    errorCount: 0,
    lastEventAt: null,
  };

  /**
   * Publishes a domain event to all registered handlers for its type.
   *
   * Each handler is invoked independently. If one handler throws,
   * the error is caught and counted, but other handlers still execute.
   * All handlers run concurrently via Promise.allSettled.
   */
  async publish(event: DomainEvent): Promise<void> {
    this.stats.publishedCount++;
    this.stats.lastEventAt = event.timestamp;

    const eventHandlers = this.handlers.get(event.type);
    if (!eventHandlers || eventHandlers.size === 0) {
      return;
    }

    // Fire all handlers concurrently with error isolation
    const results = await Promise.allSettled(
      Array.from(eventHandlers).map((handler) =>
        Promise.resolve().then(() => handler(event)),
      ),
    );

    // Count errors
    for (const result of results) {
      if (result.status === 'rejected') {
        this.stats.errorCount++;
      }
    }
  }

  /**
   * Registers a handler for the given event type.
   */
  subscribe(eventType: string, handler: EventHandler): void {
    let handlerSet = this.handlers.get(eventType);
    if (!handlerSet) {
      handlerSet = new Set();
      this.handlers.set(eventType, handlerSet);
    }

    if (!handlerSet.has(handler)) {
      handlerSet.add(handler);
      this.stats.handlerCount++;
    }
  }

  /**
   * Removes a handler for the given event type.
   * No-op if the handler was not registered.
   */
  unsubscribe(eventType: string, handler: EventHandler): void {
    const handlerSet = this.handlers.get(eventType);
    if (handlerSet && handlerSet.has(handler)) {
      handlerSet.delete(handler);
      this.stats.handlerCount--;

      // Clean up empty sets
      if (handlerSet.size === 0) {
        this.handlers.delete(eventType);
      }
    }
  }

  /**
   * Returns a snapshot of the current EventBus stats.
   */
  getStats(): EventBusStats {
    return { ...this.stats };
  }
}

// === Singleton Factory ===

let instance: EventBus | null = null;

/**
 * Returns the singleton EventBus instance.
 * Creates a new InProcessEventBus on first call.
 *
 * In tests, use resetEventBus() to get a fresh instance.
 */
export function getEventBus(): EventBus {
  if (!instance) {
    instance = new InProcessEventBus();
  }
  return instance;
}

/**
 * Resets the singleton EventBus instance.
 * Intended for use in tests only.
 */
export function resetEventBus(): void {
  instance = null;
}
