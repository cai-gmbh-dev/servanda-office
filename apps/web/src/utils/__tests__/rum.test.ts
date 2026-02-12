/**
 * RUM (Real User Monitoring) Tests — Sprint 13 (Team 06: QA & Compliance)
 *
 * Tests for the lightweight RUM implementation:
 *   - Initialization
 *   - Metric capture
 *   - Batch sending
 *   - Buffer management
 *   - Route change tracking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initRUM,
  destroyRUM,
  captureRouteChange,
  getBuffer,
  isInitialized,
} from '../rum';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock PerformanceObserver (not available in jsdom)
const mockObserverInstances: Array<{
  callback: PerformanceObserverCallback;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}> = [];

class MockPerformanceObserver {
  callback: PerformanceObserverCallback;
  observe = vi.fn();
  disconnect = vi.fn();

  constructor(callback: PerformanceObserverCallback) {
    this.callback = callback;
    mockObserverInstances.push({
      callback,
      observe: this.observe,
      disconnect: this.disconnect,
    });
  }
}

// Mock navigator.sendBeacon
const mockSendBeacon = vi.fn().mockReturnValue(true);

// Mock fetch
const mockFetch = vi.fn().mockResolvedValue({ ok: true });

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Reset RUM state
  destroyRUM();
  mockObserverInstances.length = 0;

  // Install mocks
  vi.stubGlobal('PerformanceObserver', MockPerformanceObserver);
  vi.stubGlobal('fetch', mockFetch);

  Object.defineProperty(navigator, 'sendBeacon', {
    value: mockSendBeacon,
    writable: true,
    configurable: true,
  });

  // Mock performance.getEntriesByType for navigation timing
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);

  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  destroyRUM();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RUM — Initialization', () => {
  it('should initialize successfully and set initialized flag', () => {
    expect(isInitialized()).toBe(false);

    initRUM('/api/v1/metrics/rum');

    expect(isInitialized()).toBe(true);
  });

  it('should not re-initialize if already initialized', () => {
    initRUM('/api/v1/metrics/rum');
    const bufferBefore = getBuffer().length;

    // Try to init again — should be a no-op
    initRUM('/api/v1/metrics/rum');

    // PerformanceObservers should only be created once
    // 3 observers: LCP, FID, CLS
    const observerCount = mockObserverInstances.length;
    expect(observerCount).toBe(3);
  });

  it('should create PerformanceObservers for LCP, FID, and CLS', () => {
    initRUM('/api/v1/metrics/rum');

    // Should have created 3 observers (LCP, FID, CLS)
    expect(mockObserverInstances.length).toBe(3);

    // Each should have been observed with buffered: true
    for (const instance of mockObserverInstances) {
      expect(instance.observe).toHaveBeenCalledWith(
        expect.objectContaining({ buffered: true }),
      );
    }
  });
});

describe('RUM — Metric Capture', () => {
  it('should capture route change metrics', () => {
    initRUM('/api/v1/metrics/rum');

    captureRouteChange('/contracts', 150);
    captureRouteChange('/content/clauses', 80);

    const buffer = getBuffer();
    expect(buffer.length).toBe(2);

    expect(buffer[0]).toEqual(
      expect.objectContaining({
        name: 'route_change',
        value: 150,
        route: '/contracts',
      }),
    );

    expect(buffer[1]).toEqual(
      expect.objectContaining({
        name: 'route_change',
        value: 80,
        route: '/content/clauses',
      }),
    );
  });

  it('should not capture metrics before initialization', () => {
    // RUM not initialized
    captureRouteChange('/test', 100);

    const buffer = getBuffer();
    expect(buffer.length).toBe(0);
  });

  it('should capture LCP metrics when observer fires', () => {
    initRUM('/api/v1/metrics/rum');

    // Find the LCP observer (first one created)
    const lcpObserver = mockObserverInstances.find(
      (o) => o.observe.mock.calls[0]?.[0]?.type === 'largest-contentful-paint',
    );
    expect(lcpObserver).toBeDefined();

    // Simulate LCP entry
    lcpObserver!.callback(
      {
        getEntries: () => [{ startTime: 2500, element: { tagName: 'IMG' } }],
      } as unknown as PerformanceObserverEntryList,
      {} as PerformanceObserver,
    );

    const buffer = getBuffer();
    const lcpEntry = buffer.find((m) => m.name === 'LCP');
    expect(lcpEntry).toBeDefined();
    expect(lcpEntry!.value).toBe(2500);
  });

  it('should capture CLS metrics when observer fires', () => {
    initRUM('/api/v1/metrics/rum');

    // Find the CLS observer
    const clsObserver = mockObserverInstances.find(
      (o) => o.observe.mock.calls[0]?.[0]?.type === 'layout-shift',
    );
    expect(clsObserver).toBeDefined();

    // Simulate layout shifts
    clsObserver!.callback(
      {
        getEntries: () => [
          { hadRecentInput: false, value: 0.1 },
          { hadRecentInput: false, value: 0.05 },
          { hadRecentInput: true, value: 0.5 }, // should be ignored
        ],
      } as unknown as PerformanceObserverEntryList,
      {} as PerformanceObserver,
    );

    const buffer = getBuffer();
    const clsEntry = buffer.find((m) => m.name === 'CLS');
    expect(clsEntry).toBeDefined();
    // 0.1 + 0.05 = 0.15 (the input-triggered shift is excluded)
    expect(clsEntry!.value).toBeCloseTo(0.15, 5);
  });
});

describe('RUM — Batch Sending', () => {
  it('should flush buffer via sendBeacon on timer', () => {
    initRUM('/api/v1/metrics/rum', { batchIntervalMs: 5000 });

    // Add some metrics
    captureRouteChange('/test-1', 100);
    captureRouteChange('/test-2', 200);

    // Advance timer to trigger flush
    vi.advanceTimersByTime(5000);

    expect(mockSendBeacon).toHaveBeenCalledTimes(1);

    // Verify the sent payload
    const sentBlob = mockSendBeacon.mock.calls[0][1] as Blob;
    expect(sentBlob).toBeDefined();
    expect(sentBlob.type).toBe('application/json');

    // Buffer should be cleared after flush
    expect(getBuffer().length).toBe(0);
  });

  it('should not send if buffer is empty', () => {
    initRUM('/api/v1/metrics/rum', { batchIntervalMs: 5000 });

    // Advance timer without adding any metrics
    vi.advanceTimersByTime(5000);

    expect(mockSendBeacon).not.toHaveBeenCalled();
  });

  it('should fall back to fetch when sendBeacon fails', () => {
    mockSendBeacon.mockReturnValue(false);

    initRUM('/api/v1/metrics/rum', { batchIntervalMs: 5000 });

    captureRouteChange('/test', 100);

    vi.advanceTimersByTime(5000);

    // sendBeacon was called but returned false
    expect(mockSendBeacon).toHaveBeenCalledTimes(1);

    // fetch should be called as fallback
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/metrics/rum',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }),
    );
  });

  it('should flush on page visibility change to hidden', () => {
    initRUM('/api/v1/metrics/rum');

    captureRouteChange('/test', 100);

    // Simulate visibility change to hidden
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      writable: true,
      configurable: true,
    });

    document.dispatchEvent(new Event('visibilitychange'));

    // Should have flushed via sendBeacon
    expect(mockSendBeacon).toHaveBeenCalledTimes(1);
  });
});

describe('RUM — Buffer Management', () => {
  it('should enforce maxBufferSize by dropping oldest entries', () => {
    initRUM('/api/v1/metrics/rum', { maxBufferSize: 5 });

    // Add 8 metrics — buffer should only keep last 5
    for (let i = 0; i < 8; i++) {
      captureRouteChange(`/route-${i}`, i * 10);
    }

    const buffer = getBuffer();
    expect(buffer.length).toBe(5);

    // Should have the last 5 entries (routes 3-7)
    expect(buffer[0].route).toBe('/route-3');
    expect(buffer[4].route).toBe('/route-7');
  });
});

describe('RUM — Destroy', () => {
  it('should clean up timer and reset state on destroy', () => {
    initRUM('/api/v1/metrics/rum');
    captureRouteChange('/test', 100);

    expect(isInitialized()).toBe(true);
    expect(getBuffer().length).toBe(1);

    destroyRUM();

    expect(isInitialized()).toBe(false);
    expect(getBuffer().length).toBe(0);

    // Adding metrics after destroy should not work
    captureRouteChange('/post-destroy', 50);
    expect(getBuffer().length).toBe(0);
  });
});
