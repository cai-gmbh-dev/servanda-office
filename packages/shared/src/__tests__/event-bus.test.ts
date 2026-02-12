/**
 * EventBus Tests — Sprint 13 (Team 01 - Product Architecture)
 *
 * Comprehensive tests for InProcessEventBus:
 * - Publish / Subscribe / Unsubscribe lifecycle
 * - Error isolation between handlers
 * - Stats tracking accuracy
 * - Concurrent publish safety
 * - Edge cases (no handlers, duplicate subscribe, etc.)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  InProcessEventBus,
  getEventBus,
  resetEventBus,
  type DomainEvent,
  type EventHandler,
  type EventBus,
} from '../event-bus';

// === Helpers ===

function createEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    type: 'TemplatePublished',
    tenantId: 'tenant-001',
    payload: { templateId: 'tpl-1', versionId: 'v-1' },
    timestamp: new Date('2026-01-15T10:00:00Z'),
    correlationId: 'corr-001',
    ...overrides,
  };
}

describe('InProcessEventBus', () => {
  let bus: InProcessEventBus;

  beforeEach(() => {
    bus = new InProcessEventBus();
  });

  // --- Test 1: Basic publish/subscribe ---
  it('should deliver events to subscribed handlers', async () => {
    const received: DomainEvent[] = [];
    const handler: EventHandler = async (event) => {
      received.push(event);
    };

    bus.subscribe('TemplatePublished', handler);
    const event = createEvent();
    await bus.publish(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(event);
  });

  // --- Test 2: Multiple handlers for same event type ---
  it('should deliver events to all handlers for the same event type', async () => {
    const results: string[] = [];

    const handler1: EventHandler = async () => { results.push('handler1'); };
    const handler2: EventHandler = async () => { results.push('handler2'); };
    const handler3: EventHandler = async () => { results.push('handler3'); };

    bus.subscribe('ContractCompleted', handler1);
    bus.subscribe('ContractCompleted', handler2);
    bus.subscribe('ContractCompleted', handler3);

    await bus.publish(createEvent({ type: 'ContractCompleted' }));

    expect(results).toHaveLength(3);
    expect(results).toContain('handler1');
    expect(results).toContain('handler2');
    expect(results).toContain('handler3');
  });

  // --- Test 3: Unsubscribe ---
  it('should not deliver events to unsubscribed handlers', async () => {
    const received: DomainEvent[] = [];
    const handler: EventHandler = async (event) => {
      received.push(event);
    };

    bus.subscribe('ExportCompleted', handler);
    bus.unsubscribe('ExportCompleted', handler);

    await bus.publish(createEvent({ type: 'ExportCompleted' }));

    expect(received).toHaveLength(0);
  });

  // --- Test 4: Error isolation ---
  it('should isolate errors: one failing handler does not block others', async () => {
    const results: string[] = [];

    const goodHandler1: EventHandler = async () => { results.push('good1'); };
    const badHandler: EventHandler = async () => { throw new Error('Handler exploded'); };
    const goodHandler2: EventHandler = async () => { results.push('good2'); };

    bus.subscribe('ClauseUpdated', goodHandler1);
    bus.subscribe('ClauseUpdated', badHandler);
    bus.subscribe('ClauseUpdated', goodHandler2);

    // Should not throw
    await bus.publish(createEvent({ type: 'ClauseUpdated' }));

    // Both good handlers should have been called
    expect(results).toContain('good1');
    expect(results).toContain('good2');
    expect(results).toHaveLength(2);
  });

  // --- Test 5: Stats tracking — publishedCount ---
  it('should track publishedCount accurately', async () => {
    expect(bus.getStats().publishedCount).toBe(0);

    await bus.publish(createEvent());
    expect(bus.getStats().publishedCount).toBe(1);

    await bus.publish(createEvent());
    await bus.publish(createEvent());
    expect(bus.getStats().publishedCount).toBe(3);
  });

  // --- Test 6: Stats tracking — handlerCount ---
  it('should track handlerCount through subscribe and unsubscribe', () => {
    const h1: EventHandler = async () => {};
    const h2: EventHandler = async () => {};

    expect(bus.getStats().handlerCount).toBe(0);

    bus.subscribe('TemplatePublished', h1);
    expect(bus.getStats().handlerCount).toBe(1);

    bus.subscribe('ContractCompleted', h2);
    expect(bus.getStats().handlerCount).toBe(2);

    bus.unsubscribe('TemplatePublished', h1);
    expect(bus.getStats().handlerCount).toBe(1);

    bus.unsubscribe('ContractCompleted', h2);
    expect(bus.getStats().handlerCount).toBe(0);
  });

  // --- Test 7: Stats tracking — errorCount ---
  it('should track errorCount when handlers fail', async () => {
    const failingHandler: EventHandler = async () => {
      throw new Error('Boom');
    };

    bus.subscribe('UserProvisioned', failingHandler);
    expect(bus.getStats().errorCount).toBe(0);

    await bus.publish(createEvent({ type: 'UserProvisioned' }));
    expect(bus.getStats().errorCount).toBe(1);

    await bus.publish(createEvent({ type: 'UserProvisioned' }));
    expect(bus.getStats().errorCount).toBe(2);
  });

  // --- Test 8: Stats tracking — lastEventAt ---
  it('should track lastEventAt timestamp', async () => {
    expect(bus.getStats().lastEventAt).toBeNull();

    const event1 = createEvent({ timestamp: new Date('2026-01-10T08:00:00Z') });
    await bus.publish(event1);
    expect(bus.getStats().lastEventAt).toEqual(new Date('2026-01-10T08:00:00Z'));

    const event2 = createEvent({ timestamp: new Date('2026-02-12T14:30:00Z') });
    await bus.publish(event2);
    expect(bus.getStats().lastEventAt).toEqual(new Date('2026-02-12T14:30:00Z'));
  });

  // --- Test 9: No handlers — publish is a no-op ---
  it('should handle publish with no registered handlers gracefully', async () => {
    // Should not throw
    await bus.publish(createEvent({ type: 'AuditRequired' }));

    expect(bus.getStats().publishedCount).toBe(1);
    expect(bus.getStats().errorCount).toBe(0);
  });

  // --- Test 10: Concurrent publishes ---
  it('should handle concurrent publishes correctly', async () => {
    const callCount = vi.fn();
    const handler: EventHandler = async () => {
      // Simulate async work
      await new Promise((resolve) => setTimeout(resolve, 5));
      callCount();
    };

    bus.subscribe('TemplatePublished', handler);

    // Fire 10 events concurrently
    const events = Array.from({ length: 10 }, (_, i) =>
      createEvent({ correlationId: `corr-${i}` }),
    );

    await Promise.all(events.map((e) => bus.publish(e)));

    expect(callCount).toHaveBeenCalledTimes(10);
    expect(bus.getStats().publishedCount).toBe(10);
    expect(bus.getStats().errorCount).toBe(0);
  });

  // --- Test 11: Duplicate subscribe is idempotent ---
  it('should not register the same handler twice for the same event type', async () => {
    const callCount = vi.fn();
    const handler: EventHandler = async () => { callCount(); };

    bus.subscribe('TemplatePublished', handler);
    bus.subscribe('TemplatePublished', handler); // duplicate

    await bus.publish(createEvent());

    // Handler should only be called once
    expect(callCount).toHaveBeenCalledTimes(1);
    expect(bus.getStats().handlerCount).toBe(1);
  });

  // --- Test 12: Unsubscribe non-existent handler is a no-op ---
  it('should not throw when unsubscribing a handler that was not registered', () => {
    const handler: EventHandler = async () => {};

    // Should not throw
    expect(() => bus.unsubscribe('TemplatePublished', handler)).not.toThrow();
    expect(bus.getStats().handlerCount).toBe(0);
  });

  // --- Test 13: Handler registered for one type does not receive other types ---
  it('should only deliver events matching the subscribed event type', async () => {
    const received: string[] = [];
    const handler: EventHandler = async (event) => {
      received.push(event.type);
    };

    bus.subscribe('TemplatePublished', handler);

    await bus.publish(createEvent({ type: 'TemplatePublished' }));
    await bus.publish(createEvent({ type: 'ContractCompleted' }));
    await bus.publish(createEvent({ type: 'ExportCompleted' }));

    expect(received).toEqual(['TemplatePublished']);
  });

  // --- Test 14: Synchronous handler works too ---
  it('should support synchronous handlers (non-async)', async () => {
    const received: DomainEvent[] = [];
    // Deliberately synchronous handler (no async keyword)
    const handler: EventHandler = (event) => {
      received.push(event);
    };

    bus.subscribe('ClauseUpdated', handler);
    await bus.publish(createEvent({ type: 'ClauseUpdated' }));

    expect(received).toHaveLength(1);
  });

  // --- Test 15: getStats returns a snapshot (not a reference) ---
  it('should return a snapshot from getStats, not a live reference', async () => {
    const stats1 = bus.getStats();
    await bus.publish(createEvent());
    const stats2 = bus.getStats();

    // stats1 should not have been mutated
    expect(stats1.publishedCount).toBe(0);
    expect(stats2.publishedCount).toBe(1);
  });
});

describe('getEventBus / resetEventBus singleton', () => {
  beforeEach(() => {
    resetEventBus();
  });

  // --- Test 16: Singleton returns same instance ---
  it('should return the same instance on repeated calls', () => {
    const bus1 = getEventBus();
    const bus2 = getEventBus();
    expect(bus1).toBe(bus2);
  });

  // --- Test 17: Reset creates a fresh instance ---
  it('should return a new instance after resetEventBus()', () => {
    const bus1 = getEventBus();
    resetEventBus();
    const bus2 = getEventBus();
    expect(bus1).not.toBe(bus2);
  });

  // --- Test 18: Reset clears all state ---
  it('should have clean stats after reset', async () => {
    const bus1 = getEventBus();
    bus1.subscribe('TemplatePublished', async () => {});
    await bus1.publish(createEvent());

    expect(bus1.getStats().publishedCount).toBe(1);
    expect(bus1.getStats().handlerCount).toBe(1);

    resetEventBus();
    const bus2 = getEventBus();

    expect(bus2.getStats().publishedCount).toBe(0);
    expect(bus2.getStats().handlerCount).toBe(0);
    expect(bus2.getStats().errorCount).toBe(0);
    expect(bus2.getStats().lastEventAt).toBeNull();
  });
});
