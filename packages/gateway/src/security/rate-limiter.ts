export interface RateLimitConfig {
  /** Sliding window duration in milliseconds (default: 60000). */
  windowMs?: number;
  /** Maximum requests allowed per client key inside the sliding window (default: 60). */
  maxRequests?: number;
  /** Maximum distinct client keys tracked concurrently to bound memory usage (default: 10000). */
  maxTrackedKeys?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
  retryAfterSeconds: number;
}

/**
 * Memory-bounded sliding-window rate limiter suitable for both
 * Cloudflare Workers / Edge runtimes and local Node.js daemons.
 */
export class SlidingWindowRateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly maxTrackedKeys: number;
  private readonly windows: Map<string, number[]> = new Map();

  constructor(config: RateLimitConfig = {}) {
    this.windowMs = Math.max(1, config.windowMs ?? 60_000);
    this.maxRequests = Math.max(0, config.maxRequests ?? 60);
    this.maxTrackedKeys = Math.max(1, config.maxTrackedKeys ?? 10_000);
  }

  /**
   * Evaluates and records a request for the given client key under the sliding window.
   */
  public check(clientKey: string): RateLimitResult {
    const now = Date.now();
    const key = clientKey || 'anonymous';
    const windowStart = now - this.windowMs;

    const existing = this.windows.get(key) ?? [];
    const timestamps = existing.filter((ts) => ts > windowStart);

    if (this.windows.has(key)) {
      this.windows.delete(key);
    } else if (this.windows.size >= this.maxTrackedKeys) {
      this.evictForCapacity(windowStart);
    }

    if (timestamps.length >= this.maxRequests) {
      if (timestamps.length > 0) {
        this.windows.set(key, timestamps);
      }
      const oldestTs = timestamps[0] ?? now;
      const resetMs = Math.max(0, oldestTs + this.windowMs - now);
      const retryAfterSeconds = Math.max(1, Math.ceil(resetMs / 1000));
      return {
        allowed: false,
        limit: this.maxRequests,
        remaining: 0,
        resetMs,
        retryAfterSeconds,
      };
    }

    timestamps.push(now);
    this.windows.set(key, timestamps);

    const oldestTs = timestamps[0] ?? now;
    const resetMs = Math.max(0, oldestTs + this.windowMs - now);

    return {
      allowed: true,
      limit: this.maxRequests,
      remaining: Math.max(0, this.maxRequests - timestamps.length),
      resetMs,
      retryAfterSeconds: 0,
    };
  }

  /**
   * Converts a rate-limit evaluation result into standard HTTP response headers.
   */
  public toHeaders(result: RateLimitResult): Record<string, string> {
    const headers: Record<string, string> = {
      'X-RateLimit-Limit': String(result.limit),
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': String(Math.ceil(result.resetMs / 1000)),
    };
    if (!result.allowed && result.retryAfterSeconds > 0) {
      headers['Retry-After'] = String(result.retryAfterSeconds);
    }
    return headers;
  }

  /**
   * Clears all tracked client windows.
   */
  public reset(): void {
    this.windows.clear();
  }

  /**
   * Returns the number of currently tracked client keys.
   */
  public getTrackedKeysCount(): number {
    return this.windows.size;
  }

  private evictForCapacity(windowStart: number): void {
    for (const [existingKey, existingTs] of this.windows.entries()) {
      const active = existingTs.filter((ts) => ts > windowStart);
      if (active.length === 0) {
        this.windows.delete(existingKey);
      } else {
        this.windows.set(existingKey, active);
      }
    }

    while (this.windows.size >= this.maxTrackedKeys) {
      const oldestKey = this.windows.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      this.windows.delete(oldestKey);
    }
  }
}
