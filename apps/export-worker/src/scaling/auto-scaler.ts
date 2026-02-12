/**
 * Auto-Scaler — Sprint 13 (Team 05)
 *
 * Dynamically adjusts worker concurrency based on queue depth.
 * Polls pgboss queue size at a configurable interval and scales
 * concurrency up or down within configured bounds.
 *
 * Scaling rules:
 * - Scale UP:   queueSize > SCALE_UP_THRESHOLD (10) and currentConcurrency < MAX_CONCURRENCY
 * - Scale DOWN: queueSize < SCALE_DOWN_THRESHOLD (3) and currentConcurrency > MIN_CONCURRENCY
 * - Cooldown:   60 seconds between consecutive scale operations
 *
 * Configuration (env vars):
 * - EXPORT_MIN_CONCURRENCY: minimum concurrency (default 1)
 * - EXPORT_MAX_CONCURRENCY: maximum concurrency (default 8)
 * - EXPORT_SCALER_POLL_INTERVAL_MS: polling interval (default 30000ms)
 * - EXPORT_SCALER_COOLDOWN_MS: cooldown between scale ops (default 60000ms)
 * - EXPORT_SCALER_SCALE_UP_THRESHOLD: queue depth to trigger scale-up (default 10)
 * - EXPORT_SCALER_SCALE_DOWN_THRESHOLD: queue depth to trigger scale-down (default 3)
 */

import { logger } from '../logger';

export interface AutoScalerConfig {
  minConcurrency: number;
  maxConcurrency: number;
  pollIntervalMs: number;
  cooldownMs: number;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
}

export interface ScalingStats {
  currentConcurrency: number;
  queueDepth: number;
  scaleUpCount: number;
  scaleDownCount: number;
  lastScaleAt: Date | null;
}

export type ScaleDirection = 'up' | 'down';

export interface ScaleEvent {
  direction: ScaleDirection;
  previousConcurrency: number;
  newConcurrency: number;
  queueDepth: number;
  timestamp: Date;
}

/**
 * Function to query the current queue size.
 * Abstracts pgboss API — can use boss.getQueueSize() or raw SQL.
 */
export type QueueSizeProvider = () => Promise<number>;

/**
 * Callback invoked when concurrency should change.
 * The handler is responsible for actually adjusting the pgboss worker options.
 */
export type ConcurrencyChangeHandler = (newConcurrency: number) => Promise<void>;

const DEFAULT_CONFIG: AutoScalerConfig = {
  minConcurrency: Number(process.env.EXPORT_MIN_CONCURRENCY) || 1,
  maxConcurrency: Number(process.env.EXPORT_MAX_CONCURRENCY) || 8,
  pollIntervalMs: Number(process.env.EXPORT_SCALER_POLL_INTERVAL_MS) || 30_000,
  cooldownMs: Number(process.env.EXPORT_SCALER_COOLDOWN_MS) || 60_000,
  scaleUpThreshold: Number(process.env.EXPORT_SCALER_SCALE_UP_THRESHOLD) || 10,
  scaleDownThreshold: Number(process.env.EXPORT_SCALER_SCALE_DOWN_THRESHOLD) || 3,
};

export class AutoScaler {
  private readonly config: AutoScalerConfig;
  private readonly getQueueSize: QueueSizeProvider;
  private readonly onConcurrencyChange: ConcurrencyChangeHandler;

  private currentConcurrency: number;
  private queueDepth = 0;
  private scaleUpCount = 0;
  private scaleDownCount = 0;
  private lastScaleAt: Date | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  /** Event listeners for scaling events (used for logging/metrics) */
  private readonly listeners: Array<(event: ScaleEvent) => void> = [];

  constructor(
    initialConcurrency: number,
    getQueueSize: QueueSizeProvider,
    onConcurrencyChange: ConcurrencyChangeHandler,
    config?: Partial<AutoScalerConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentConcurrency = Math.max(
      this.config.minConcurrency,
      Math.min(initialConcurrency, this.config.maxConcurrency),
    );
    this.getQueueSize = getQueueSize;
    this.onConcurrencyChange = onConcurrencyChange;
  }

  /**
   * Register a listener for scaling events.
   */
  onScale(listener: (event: ScaleEvent) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Start the auto-scaler polling loop.
   */
  start(): void {
    if (this.running) {
      logger.warn('AutoScaler already running');
      return;
    }

    this.running = true;

    logger.info(
      {
        minConcurrency: this.config.minConcurrency,
        maxConcurrency: this.config.maxConcurrency,
        pollIntervalMs: this.config.pollIntervalMs,
        cooldownMs: this.config.cooldownMs,
        scaleUpThreshold: this.config.scaleUpThreshold,
        scaleDownThreshold: this.config.scaleDownThreshold,
        initialConcurrency: this.currentConcurrency,
      },
      'AutoScaler started',
    );

    this.pollTimer = setInterval(() => {
      this.poll().catch((err) => {
        logger.error({ err }, 'AutoScaler poll error');
      });
    }, this.config.pollIntervalMs);
  }

  /**
   * Stop the auto-scaler polling loop.
   */
  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.running = false;
    logger.info('AutoScaler stopped');
  }

  /**
   * Single poll iteration: read queue depth and adjust concurrency if needed.
   * Exposed for testing — normally called by the internal interval timer.
   */
  async poll(): Promise<void> {
    try {
      this.queueDepth = await this.getQueueSize();
    } catch (err) {
      logger.warn({ err }, 'AutoScaler: failed to read queue size');
      return;
    }

    const now = new Date();

    // Check cooldown
    if (this.lastScaleAt) {
      const elapsed = now.getTime() - this.lastScaleAt.getTime();
      if (elapsed < this.config.cooldownMs) {
        logger.debug(
          { queueDepth: this.queueDepth, cooldownRemaining: this.config.cooldownMs - elapsed },
          'AutoScaler: in cooldown period',
        );
        return;
      }
    }

    // Scale up decision
    if (
      this.queueDepth > this.config.scaleUpThreshold &&
      this.currentConcurrency < this.config.maxConcurrency
    ) {
      const previousConcurrency = this.currentConcurrency;
      const newConcurrency = Math.min(this.currentConcurrency + 1, this.config.maxConcurrency);

      await this.applyScaling('up', previousConcurrency, newConcurrency, now);
      return;
    }

    // Scale down decision
    if (
      this.queueDepth < this.config.scaleDownThreshold &&
      this.currentConcurrency > this.config.minConcurrency
    ) {
      const previousConcurrency = this.currentConcurrency;
      const newConcurrency = Math.max(this.currentConcurrency - 1, this.config.minConcurrency);

      await this.applyScaling('down', previousConcurrency, newConcurrency, now);
      return;
    }

    logger.debug(
      { queueDepth: this.queueDepth, currentConcurrency: this.currentConcurrency },
      'AutoScaler: no scaling action needed',
    );
  }

  /**
   * Apply a scaling change and emit the event.
   */
  private async applyScaling(
    direction: ScaleDirection,
    previousConcurrency: number,
    newConcurrency: number,
    timestamp: Date,
  ): Promise<void> {
    try {
      await this.onConcurrencyChange(newConcurrency);

      this.currentConcurrency = newConcurrency;
      this.lastScaleAt = timestamp;

      if (direction === 'up') {
        this.scaleUpCount++;
      } else {
        this.scaleDownCount++;
      }

      const event: ScaleEvent = {
        direction,
        previousConcurrency,
        newConcurrency,
        queueDepth: this.queueDepth,
        timestamp,
      };

      logger.info(
        {
          direction,
          previousConcurrency,
          newConcurrency,
          queueDepth: this.queueDepth,
        },
        `AutoScaler: scaled ${direction}`,
      );

      // Notify listeners
      for (const listener of this.listeners) {
        try {
          listener(event);
        } catch (err) {
          logger.warn({ err }, 'AutoScaler: scale event listener error');
        }
      }
    } catch (err) {
      logger.error(
        { direction, previousConcurrency, newConcurrency, err },
        'AutoScaler: failed to apply scaling change',
      );
    }
  }

  /**
   * Return current scaling statistics.
   */
  getScalingStats(): ScalingStats {
    return {
      currentConcurrency: this.currentConcurrency,
      queueDepth: this.queueDepth,
      scaleUpCount: this.scaleUpCount,
      scaleDownCount: this.scaleDownCount,
      lastScaleAt: this.lastScaleAt,
    };
  }

  /**
   * Check if the auto-scaler is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }
}
