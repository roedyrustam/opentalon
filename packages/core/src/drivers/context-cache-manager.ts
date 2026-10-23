import crypto from 'node:crypto';
import { GeminiDriver } from './gemini-driver.js';

export interface CacheEntry {
  name: string;
  contentHash: string;
  model: string;
  expiresAt: number;
  createdAt: number;
  approxTokens?: number;
}

export interface CacheResolutionResult {
  cachedContentId?: string;
  prefixHash: string;
  cacheHit: boolean;
  prefixHit: boolean;
  tokensSaved: number;
}

export interface ContextCacheStats {
  activeCaches: number;
  trackedPrefixes: number;
  cacheHits: number;
  cacheMisses: number;
  prefixHits: number;
  estimatedTokensSaved: number;
}

export interface ContextCacheManagerOptions {
  driver?: GeminiDriver;
  minTokenThreshold?: number; // Default: 32768 tokens (approx 120k chars)
  defaultTtlSeconds?: number; // Default: 3600 seconds (1 hour)
  maxEntries?: number;        // Default: 200 entries (bounded LRU/FIFO memory protection)
}

export class ContextCacheManager {
  private driver?: GeminiDriver;
  private minTokenThreshold: number;
  private defaultTtlSeconds: number;
  private maxEntries: number;
  private cacheRegistry: Map<string, CacheEntry> = new Map();
  private prefixRegistry: Map<string, { approxTokens: number; hits: number; lastSeenAt: number }> =
    new Map();

  // FinOps & KV-Cache Telemetry Counters
  private cacheHits = 0;
  private cacheMisses = 0;
  private prefixHits = 0;
  private estimatedTokensSaved = 0;

  constructor(options: ContextCacheManagerOptions = {}) {
    this.driver = options.driver;
    this.minTokenThreshold = options.minTokenThreshold ?? 32768;
    this.defaultTtlSeconds = options.defaultTtlSeconds ?? 3600;
    this.maxEntries = options.maxEntries ?? 200;
  }

  /**
   * Computes SHA-256 fingerprint for content string.
   */
  public computeHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Tracks deterministic prefix hashes across turns (implicit KV-cache reuse)
   * and resolves explicit Gemini cachedContent when content >= minTokenThreshold.
   */
  public async trackPrefixAndResolveCache(
    prefixContent: string,
    options?: {
      prefixHash?: string;
      model?: string;
      systemInstruction?: string;
      ttlSeconds?: number;
      displayName?: string;
    }
  ): Promise<CacheResolutionResult> {
    const hash = options?.prefixHash || this.computeHash(prefixContent);
    const approxTokens = Math.ceil(prefixContent.length / 3.8);
    const now = Date.now();

    // 1. Track deterministic prefix reuse (Implicit KV-Cache Hit Tracking)
    let prefixHit = false;
    let tokensSaved = 0;
    const existingPrefix = this.prefixRegistry.get(hash);

    if (existingPrefix) {
      prefixHit = true;
      existingPrefix.hits += 1;
      existingPrefix.lastSeenAt = now;
      this.prefixHits += 1;
      // Refresh LRU position
      this.prefixRegistry.delete(hash);
      this.prefixRegistry.set(hash, existingPrefix);
      // Estimate 75% KV-cache discount on repeated canonical prefix tokens
      tokensSaved = Math.floor(approxTokens * 0.75);
      this.estimatedTokensSaved += tokensSaved;
    } else {
      this.enforceMapLimit(this.prefixRegistry);
      this.prefixRegistry.set(hash, {
        approxTokens,
        hits: 1,
        lastSeenAt: now,
      });
    }

    // 2. Check explicit Gemini Context Cache if driver is present and threshold met
    if (approxTokens < this.minTokenThreshold || !this.driver) {
      return {
        cachedContentId: undefined,
        prefixHash: hash,
        cacheHit: false,
        prefixHit,
        tokensSaved,
      };
    }

    const existingCache = this.cacheRegistry.get(hash);
    if (existingCache && existingCache.expiresAt > now + 60000) {
      this.cacheHits += 1;
      const explicitSaved = Math.floor(approxTokens * 0.8);
      if (!prefixHit) {
        tokensSaved = explicitSaved;
        this.estimatedTokensSaved += explicitSaved;
      }
      return {
        cachedContentId: existingCache.name,
        prefixHash: hash,
        cacheHit: true,
        prefixHit: true,
        tokensSaved,
      };
    }

    const cachedContentId = await this.getOrCreateCache(prefixContent, {
      model: options?.model,
      systemInstruction: options?.systemInstruction,
      ttlSeconds: options?.ttlSeconds,
      displayName: options?.displayName,
    });

    return {
      cachedContentId,
      prefixHash: hash,
      cacheHit: false,
      prefixHit,
      tokensSaved,
    };
  }

  /**
   * Returns an active cache identifier if available, or creates a new one
   * if the content meets the threshold requirements.
   */
  public async getOrCreateCache(
    content: string,
    options?: {
      model?: string;
      systemInstruction?: string;
      ttlSeconds?: number;
      displayName?: string;
    }
  ): Promise<string | undefined> {
    const approxTokens = Math.ceil(content.length / 3.8);
    if (approxTokens < this.minTokenThreshold || !this.driver) {
      return undefined;
    }

    const hash = this.computeHash(content);
    const now = Date.now();
    const existing = this.cacheRegistry.get(hash);

    // Return active cache if valid and not expiring in next 60 seconds
    if (existing && existing.expiresAt > now + 60000) {
      this.cacheHits += 1;
      const saved = Math.floor((existing.approxTokens ?? approxTokens) * 0.8);
      this.estimatedTokensSaved += saved;
      // Refresh LRU order
      this.cacheRegistry.delete(hash);
      this.cacheRegistry.set(hash, existing);
      return existing.name;
    }

    this.cacheMisses += 1;

    // Create new cache snapshot in Gemini API
    const ttlSeconds = options?.ttlSeconds ?? this.defaultTtlSeconds;
    const model = options?.model ?? this.driver.getPrimaryModel();

    try {
      const result = await this.driver.createCache({
        model,
        systemInstruction: options?.systemInstruction,
        contents: [
          {
            role: 'user',
            parts: [{ text: content }],
          },
        ],
        ttlSeconds,
        displayName: options?.displayName ?? `opentalon_${hash.slice(0, 10)}`,
      });

      const expiresAt = now + ttlSeconds * 1000;
      const entry: CacheEntry = {
        name: result.name,
        contentHash: hash,
        model,
        expiresAt,
        createdAt: now,
        approxTokens,
      };

      this.evictIfNeeded(now);
      this.cacheRegistry.set(hash, entry);
      return result.name;
    } catch {
      // Invariant: Seamlessly degrade to fallback model (e.g. Gemini 3.8 Flash)
      const fallbackModel = this.driver.getFallbackModel();
      if (fallbackModel && fallbackModel !== model) {
        try {
          const fallbackResult = await this.driver.createCache({
            model: fallbackModel,
            systemInstruction: options?.systemInstruction,
            contents: [
              {
                role: 'user',
                parts: [{ text: content }],
              },
            ],
            ttlSeconds,
            displayName: options?.displayName ?? `opentalon_${hash.slice(0, 10)}`,
          });

          const expiresAt = now + ttlSeconds * 1000;
          const entry: CacheEntry = {
            name: fallbackResult.name,
            contentHash: hash,
            model: fallbackModel,
            expiresAt,
            createdAt: now,
            approxTokens,
          };

          this.evictIfNeeded(now);
          this.cacheRegistry.set(hash, entry);
          return fallbackResult.name;
        } catch {
          return undefined;
        }
      }
      return undefined;
    }
  }

  /**
   * Evicts expired entries first, then oldest entry if registry reaches maxEntries.
   */
  private evictIfNeeded(now: number): void {
    for (const [key, entry] of this.cacheRegistry.entries()) {
      if (entry.expiresAt <= now) {
        this.cacheRegistry.delete(key);
      }
    }
    this.enforceMapLimit(this.cacheRegistry);
  }

  private enforceMapLimit<K, V>(map: Map<K, V>): void {
    while (map.size >= this.maxEntries) {
      const oldestKey = map.keys().next().value;
      if (oldestKey !== undefined) {
        map.delete(oldestKey);
      } else {
        break;
      }
    }
  }

  /**
   * Invalidates a specific cache or flushes all expired caches.
   */
  public async invalidate(hash?: string): Promise<void> {
    if (hash) {
      const entry = this.cacheRegistry.get(hash);
      if (entry) {
        if (this.driver) {
          try {
            await this.driver.deleteCache(entry.name);
          } catch {
            // Ignore deletion error
          }
        }
        this.cacheRegistry.delete(hash);
      }
      return;
    }

    const now = Date.now();
    for (const [key, entry] of this.cacheRegistry.entries()) {
      if (entry.expiresAt <= now) {
        if (this.driver) {
          try {
            await this.driver.deleteCache(entry.name);
          } catch {
            // Ignore deletion error
          }
        }
        this.cacheRegistry.delete(key);
      }
    }
  }

  public getRegistrySize(): number {
    return this.cacheRegistry.size;
  }

  public getEntry(hash: string): CacheEntry | undefined {
    return this.cacheRegistry.get(hash);
  }

  public getStats(): ContextCacheStats {
    return {
      activeCaches: this.cacheRegistry.size,
      trackedPrefixes: this.prefixRegistry.size,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      prefixHits: this.prefixHits,
      estimatedTokensSaved: this.estimatedTokensSaved,
    };
  }
}
