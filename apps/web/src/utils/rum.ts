/**
 * Real User Monitoring (RUM) — Sprint 13 (Team 06: QA & Compliance)
 *
 * Lightweight RUM implementation (< 2KB gzipped) that captures:
 *   - Core Web Vitals: LCP, FID, CLS via PerformanceObserver
 *   - Navigation timing: TTFB, DOM interactive, DOM complete
 *   - SPA route change timing
 *   - Batches and sends metrics to the API every 30 seconds
 *
 * Usage:
 *   import { initRUM, captureRouteChange } from '@/utils/rum';
 *   initRUM('/api/v1/metrics/rum');
 *   captureRouteChange('/contracts', 120);
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RUMMetric {
  name: string;
  value: number;
  timestamp: number;
  route?: string;
  metadata?: Record<string, string | number>;
}

export interface RUMConfig {
  endpoint: string;
  batchIntervalMs: number;
  maxBufferSize: number;
}

// ---------------------------------------------------------------------------
// Internal State
// ---------------------------------------------------------------------------

let config: RUMConfig | null = null;
let buffer: RUMMetric[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let initialized = false;

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Initialize RUM monitoring. Call once at app startup.
 *
 * @param endpoint - API endpoint to send metrics to (e.g., '/api/v1/metrics/rum')
 * @param options  - Optional overrides for batch interval and buffer size
 */
export function initRUM(
  endpoint: string,
  options?: { batchIntervalMs?: number; maxBufferSize?: number },
): void {
  if (initialized) return;

  config = {
    endpoint,
    batchIntervalMs: options?.batchIntervalMs ?? 30_000,
    maxBufferSize: options?.maxBufferSize ?? 200,
  };

  initialized = true;

  // Capture Core Web Vitals
  observeLCP();
  observeFID();
  observeCLS();

  // Capture navigation timing after page load
  if (typeof window !== 'undefined') {
    if (document.readyState === 'complete') {
      captureNavigationTiming();
    } else {
      window.addEventListener('load', captureNavigationTiming, { once: true });
    }
  }

  // Start batch flush timer
  flushTimer = setInterval(flushBuffer, config.batchIntervalMs);

  // Flush on page unload
  if (typeof window !== 'undefined') {
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushBuffer();
      }
    });
  }
}

/**
 * Record a SPA route change with its duration.
 *
 * @param routeName - The route name or path (e.g., '/contracts')
 * @param duration  - Duration in milliseconds
 */
export function captureRouteChange(routeName: string, duration: number): void {
  addMetric({
    name: 'route_change',
    value: duration,
    timestamp: Date.now(),
    route: routeName,
  });
}

/**
 * Tear down RUM monitoring. Flushes remaining metrics and stops the timer.
 * Primarily used for testing.
 */
export function destroyRUM(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  flushBuffer();
  buffer = [];
  config = null;
  initialized = false;
}

/**
 * Get the current buffer contents. Useful for testing.
 */
export function getBuffer(): RUMMetric[] {
  return [...buffer];
}

/**
 * Check if RUM has been initialized.
 */
export function isInitialized(): boolean {
  return initialized;
}

// ---------------------------------------------------------------------------
// Core Web Vitals Observers
// ---------------------------------------------------------------------------

function observeLCP(): void {
  if (typeof PerformanceObserver === 'undefined') return;

  try {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      // LCP reports multiple entries — use the last one (most accurate)
      const lastEntry = entries[entries.length - 1];
      if (lastEntry) {
        addMetric({
          name: 'LCP',
          value: lastEntry.startTime,
          timestamp: Date.now(),
          metadata: {
            element: (lastEntry as PerformanceEntry & { element?: Element }).element?.tagName ?? 'unknown',
          },
        });
      }
    });
    observer.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    // PerformanceObserver not supported for this entry type
  }
}

function observeFID(): void {
  if (typeof PerformanceObserver === 'undefined') return;

  try {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      for (const entry of entries) {
        const fidEntry = entry as PerformanceEventTiming;
        addMetric({
          name: 'FID',
          value: fidEntry.processingStart - fidEntry.startTime,
          timestamp: Date.now(),
          metadata: {
            eventType: fidEntry.name,
          },
        });
      }
    });
    observer.observe({ type: 'first-input', buffered: true });
  } catch {
    // PerformanceObserver not supported for this entry type
  }
}

function observeCLS(): void {
  if (typeof PerformanceObserver === 'undefined') return;

  let clsValue = 0;
  let clsEntries: PerformanceEntry[] = [];

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const layoutShift = entry as PerformanceEntry & {
          hadRecentInput?: boolean;
          value?: number;
        };
        // Only count layout shifts without recent user input
        if (!layoutShift.hadRecentInput && layoutShift.value !== undefined) {
          clsValue += layoutShift.value;
          clsEntries.push(entry);
        }
      }

      // Report current CLS value
      addMetric({
        name: 'CLS',
        value: clsValue,
        timestamp: Date.now(),
        metadata: {
          shiftCount: clsEntries.length,
        },
      });
    });
    observer.observe({ type: 'layout-shift', buffered: true });
  } catch {
    // PerformanceObserver not supported for this entry type
  }
}

// ---------------------------------------------------------------------------
// Navigation Timing
// ---------------------------------------------------------------------------

function captureNavigationTiming(): void {
  if (typeof performance === 'undefined' || !performance.getEntriesByType) return;

  const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  if (navEntries.length === 0) return;

  const nav = navEntries[0];

  // TTFB (Time to First Byte)
  addMetric({
    name: 'TTFB',
    value: nav.responseStart - nav.requestStart,
    timestamp: Date.now(),
  });

  // DOM Interactive
  if (nav.domInteractive > 0) {
    addMetric({
      name: 'DOM_interactive',
      value: nav.domInteractive,
      timestamp: Date.now(),
    });
  }

  // DOM Complete
  if (nav.domComplete > 0) {
    addMetric({
      name: 'DOM_complete',
      value: nav.domComplete,
      timestamp: Date.now(),
    });
  }

  // Load event
  if (nav.loadEventEnd > 0) {
    addMetric({
      name: 'load_event',
      value: nav.loadEventEnd - nav.loadEventStart,
      timestamp: Date.now(),
    });
  }
}

// ---------------------------------------------------------------------------
// Buffer Management
// ---------------------------------------------------------------------------

function addMetric(metric: RUMMetric): void {
  if (!config) return;

  buffer.push(metric);

  // Prevent unbounded growth
  if (buffer.length > config.maxBufferSize) {
    buffer = buffer.slice(-config.maxBufferSize);
  }
}

function flushBuffer(): void {
  if (!config || buffer.length === 0) return;

  const payload = [...buffer];
  buffer = [];

  // Use sendBeacon for reliability (works during page unload)
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    try {
      const blob = new Blob([JSON.stringify({ metrics: payload })], {
        type: 'application/json',
      });
      const sent = navigator.sendBeacon(config.endpoint, blob);
      if (!sent) {
        // Fallback to fetch if sendBeacon fails
        sendViaFetch(config.endpoint, payload);
      }
      return;
    } catch {
      // Fall through to fetch
    }
  }

  sendViaFetch(config.endpoint, payload);
}

function sendViaFetch(endpoint: string, payload: RUMMetric[]): void {
  try {
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metrics: payload }),
      keepalive: true,
    }).catch(() => {
      // Silently drop — RUM should never break the app
    });
  } catch {
    // Silently drop
  }
}

// ---------------------------------------------------------------------------
// PerformanceEventTiming type (not in all TS libs)
// ---------------------------------------------------------------------------

interface PerformanceEventTiming extends PerformanceEntry {
  processingStart: number;
  processingEnd: number;
  cancelable: boolean;
}
