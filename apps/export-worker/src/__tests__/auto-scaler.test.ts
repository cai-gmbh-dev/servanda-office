/**
 * AutoScaler Tests — Sprint 13 (Team 05)
 *
 * Unit tests for the dynamic worker concurrency auto-scaler.
 *
 * Tests cover:
 * 1. Scale up when queue depth exceeds threshold
 * 2. Scale down when queue depth falls below threshold
 * 3. Cooldown period enforcement between scale operations
 * 4. Min concurrency bound respected
 * 5. Max concurrency bound respected
 * 6. No scaling when queue depth is in neutral zone
 * 7. Scale event emission
 * 8. Scaling stats tracking
 * 9. Queue size provider error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AutoScaler, type AutoScalerConfig, type ScaleEvent } from '../scaling/auto-scaler';

// Mock logger to suppress output in tests
vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('AutoScaler', () => {
  let mockGetQueueSize: ReturnType<typeof vi.fn>;
  let mockOnConcurrencyChange: ReturnType<typeof vi.fn>;
  let scaler: AutoScaler;

  const config: AutoScalerConfig = {
    minConcurrency: 1,
    maxConcurrency: 8,
    pollIntervalMs: 30_000,
    cooldownMs: 60_000,
    scaleUpThreshold: 10,
    scaleDownThreshold: 3,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    mockGetQueueSize = vi.fn().mockResolvedValue(5);
    mockOnConcurrencyChange = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (scaler?.isRunning()) {
      scaler.stop();
    }
    vi.useRealTimers();
  });

  // ── Scale Up ──────────────────────────────────────────────────────

  describe('Scale Up', () => {
    it('should scale up when queue depth exceeds threshold', async () => {
      scaler = new AutoScaler(2, mockGetQueueSize, mockOnConcurrencyChange, config);

      // Queue depth > scaleUpThreshold (10)
      mockGetQueueSize.mockResolvedValue(15);

      await scaler.poll();

      expect(mockOnConcurrencyChange).toHaveBeenCalledWith(3); // 2 + 1
      expect(scaler.getScalingStats().currentConcurrency).toBe(3);
      expect(scaler.getScalingStats().scaleUpCount).toBe(1);
    });

    it('should not scale up beyond max concurrency', async () => {
      // Start at max concurrency
      scaler = new AutoScaler(8, mockGetQueueSize, mockOnConcurrencyChange, config);

      mockGetQueueSize.mockResolvedValue(20);

      await scaler.poll();

      // Should NOT have called onConcurrencyChange because already at max
      expect(mockOnConcurrencyChange).not.toHaveBeenCalled();
      expect(scaler.getScalingStats().currentConcurrency).toBe(8);
      expect(scaler.getScalingStats().scaleUpCount).toBe(0);
    });

    it('should increment concurrency by 1 each scale-up', async () => {
      scaler = new AutoScaler(2, mockGetQueueSize, mockOnConcurrencyChange, {
        ...config,
        cooldownMs: 0, // Disable cooldown for sequential scale tests
      });

      mockGetQueueSize.mockResolvedValue(15);

      await scaler.poll();
      expect(scaler.getScalingStats().currentConcurrency).toBe(3);

      await scaler.poll();
      expect(scaler.getScalingStats().currentConcurrency).toBe(4);

      await scaler.poll();
      expect(scaler.getScalingStats().currentConcurrency).toBe(5);
    });
  });

  // ── Scale Down ────────────────────────────────────────────────────

  describe('Scale Down', () => {
    it('should scale down when queue depth falls below threshold', async () => {
      scaler = new AutoScaler(4, mockGetQueueSize, mockOnConcurrencyChange, config);

      // Queue depth < scaleDownThreshold (3)
      mockGetQueueSize.mockResolvedValue(1);

      await scaler.poll();

      expect(mockOnConcurrencyChange).toHaveBeenCalledWith(3); // 4 - 1
      expect(scaler.getScalingStats().currentConcurrency).toBe(3);
      expect(scaler.getScalingStats().scaleDownCount).toBe(1);
    });

    it('should not scale down below min concurrency', async () => {
      // Start at min concurrency
      scaler = new AutoScaler(1, mockGetQueueSize, mockOnConcurrencyChange, config);

      mockGetQueueSize.mockResolvedValue(0);

      await scaler.poll();

      // Should NOT have called onConcurrencyChange because already at min
      expect(mockOnConcurrencyChange).not.toHaveBeenCalled();
      expect(scaler.getScalingStats().currentConcurrency).toBe(1);
      expect(scaler.getScalingStats().scaleDownCount).toBe(0);
    });
  });

  // ── Cooldown ──────────────────────────────────────────────────────

  describe('Cooldown Period', () => {
    it('should not scale during cooldown period', async () => {
      scaler = new AutoScaler(2, mockGetQueueSize, mockOnConcurrencyChange, {
        ...config,
        cooldownMs: 60_000,
      });

      // First poll: triggers scale up
      mockGetQueueSize.mockResolvedValue(15);
      await scaler.poll();
      expect(scaler.getScalingStats().currentConcurrency).toBe(3);

      // Second poll immediately: should be blocked by cooldown
      mockGetQueueSize.mockResolvedValue(20);
      await scaler.poll();
      expect(scaler.getScalingStats().currentConcurrency).toBe(3); // unchanged

      // Advance past cooldown
      vi.advanceTimersByTime(61_000);

      // Third poll: cooldown expired, should scale up
      mockGetQueueSize.mockResolvedValue(20);
      await scaler.poll();
      expect(scaler.getScalingStats().currentConcurrency).toBe(4);
    });

    it('should allow scaling after cooldown expires', async () => {
      scaler = new AutoScaler(4, mockGetQueueSize, mockOnConcurrencyChange, {
        ...config,
        cooldownMs: 10_000,
      });

      // Scale down
      mockGetQueueSize.mockResolvedValue(1);
      await scaler.poll();
      expect(scaler.getScalingStats().currentConcurrency).toBe(3);

      // Wait for cooldown
      vi.advanceTimersByTime(11_000);

      // Scale down again
      mockGetQueueSize.mockResolvedValue(0);
      await scaler.poll();
      expect(scaler.getScalingStats().currentConcurrency).toBe(2);
    });
  });

  // ── Neutral Zone (no scaling) ─────────────────────────────────────

  describe('Neutral Zone', () => {
    it('should not scale when queue depth is between thresholds', async () => {
      scaler = new AutoScaler(4, mockGetQueueSize, mockOnConcurrencyChange, config);

      // Queue depth in neutral zone (3 <= depth <= 10)
      mockGetQueueSize.mockResolvedValue(5);

      await scaler.poll();

      expect(mockOnConcurrencyChange).not.toHaveBeenCalled();
      expect(scaler.getScalingStats().currentConcurrency).toBe(4);
      expect(scaler.getScalingStats().scaleUpCount).toBe(0);
      expect(scaler.getScalingStats().scaleDownCount).toBe(0);
    });

    it('should not scale when queue depth equals scaleUpThreshold exactly', async () => {
      scaler = new AutoScaler(4, mockGetQueueSize, mockOnConcurrencyChange, config);

      // Exactly at threshold (not above)
      mockGetQueueSize.mockResolvedValue(10);

      await scaler.poll();

      expect(mockOnConcurrencyChange).not.toHaveBeenCalled();
    });

    it('should not scale when queue depth equals scaleDownThreshold exactly', async () => {
      scaler = new AutoScaler(4, mockGetQueueSize, mockOnConcurrencyChange, config);

      // Exactly at threshold (not below)
      mockGetQueueSize.mockResolvedValue(3);

      await scaler.poll();

      expect(mockOnConcurrencyChange).not.toHaveBeenCalled();
    });
  });

  // ── Event Emission ────────────────────────────────────────────────

  describe('Scale Events', () => {
    it('should emit scale event on scale up', async () => {
      scaler = new AutoScaler(2, mockGetQueueSize, mockOnConcurrencyChange, config);

      const events: ScaleEvent[] = [];
      scaler.onScale((event) => events.push(event));

      mockGetQueueSize.mockResolvedValue(15);
      await scaler.poll();

      expect(events).toHaveLength(1);
      expect(events[0].direction).toBe('up');
      expect(events[0].previousConcurrency).toBe(2);
      expect(events[0].newConcurrency).toBe(3);
      expect(events[0].queueDepth).toBe(15);
      expect(events[0].timestamp).toBeInstanceOf(Date);
    });

    it('should emit scale event on scale down', async () => {
      scaler = new AutoScaler(5, mockGetQueueSize, mockOnConcurrencyChange, config);

      const events: ScaleEvent[] = [];
      scaler.onScale((event) => events.push(event));

      mockGetQueueSize.mockResolvedValue(1);
      await scaler.poll();

      expect(events).toHaveLength(1);
      expect(events[0].direction).toBe('down');
      expect(events[0].previousConcurrency).toBe(5);
      expect(events[0].newConcurrency).toBe(4);
    });
  });

  // ── Stats ─────────────────────────────────────────────────────────

  describe('Scaling Stats', () => {
    it('should track cumulative scaling stats', async () => {
      scaler = new AutoScaler(3, mockGetQueueSize, mockOnConcurrencyChange, {
        ...config,
        cooldownMs: 0,
      });

      // Scale up twice
      mockGetQueueSize.mockResolvedValue(15);
      await scaler.poll();
      await scaler.poll();

      // Scale down once
      mockGetQueueSize.mockResolvedValue(0);
      await scaler.poll();

      const stats = scaler.getScalingStats();
      expect(stats.currentConcurrency).toBe(4); // 3 → 4 → 5 → 4
      expect(stats.scaleUpCount).toBe(2);
      expect(stats.scaleDownCount).toBe(1);
      expect(stats.lastScaleAt).toBeInstanceOf(Date);
      expect(stats.queueDepth).toBe(0);
    });

    it('should report initial stats before any polling', () => {
      scaler = new AutoScaler(2, mockGetQueueSize, mockOnConcurrencyChange, config);

      const stats = scaler.getScalingStats();
      expect(stats.currentConcurrency).toBe(2);
      expect(stats.queueDepth).toBe(0);
      expect(stats.scaleUpCount).toBe(0);
      expect(stats.scaleDownCount).toBe(0);
      expect(stats.lastScaleAt).toBeNull();
    });
  });

  // ── Error Handling ────────────────────────────────────────────────

  describe('Error Handling', () => {
    it('should handle queue size provider errors gracefully', async () => {
      scaler = new AutoScaler(2, mockGetQueueSize, mockOnConcurrencyChange, config);

      mockGetQueueSize.mockRejectedValue(new Error('DB connection lost'));

      // Should not throw
      await expect(scaler.poll()).resolves.toBeUndefined();

      // Concurrency should remain unchanged
      expect(scaler.getScalingStats().currentConcurrency).toBe(2);
      expect(mockOnConcurrencyChange).not.toHaveBeenCalled();
    });

    it('should handle concurrency change handler errors gracefully', async () => {
      scaler = new AutoScaler(2, mockGetQueueSize, mockOnConcurrencyChange, config);

      mockGetQueueSize.mockResolvedValue(15);
      mockOnConcurrencyChange.mockRejectedValue(new Error('Failed to adjust concurrency'));

      // Should not throw
      await expect(scaler.poll()).resolves.toBeUndefined();

      // Concurrency should NOT have been updated since handler failed
      expect(scaler.getScalingStats().currentConcurrency).toBe(2);
    });
  });

  // ── Lifecycle ─────────────────────────────────────────────────────

  describe('Lifecycle', () => {
    it('should clamp initial concurrency to configured bounds', () => {
      // Initial concurrency below min
      const scalerLow = new AutoScaler(0, mockGetQueueSize, mockOnConcurrencyChange, config);
      expect(scalerLow.getScalingStats().currentConcurrency).toBe(1);

      // Initial concurrency above max
      const scalerHigh = new AutoScaler(100, mockGetQueueSize, mockOnConcurrencyChange, config);
      expect(scalerHigh.getScalingStats().currentConcurrency).toBe(8);
    });

    it('should report running state correctly', () => {
      scaler = new AutoScaler(2, mockGetQueueSize, mockOnConcurrencyChange, config);

      expect(scaler.isRunning()).toBe(false);

      scaler.start();
      expect(scaler.isRunning()).toBe(true);

      scaler.stop();
      expect(scaler.isRunning()).toBe(false);
    });
  });
});
