import { type ILLMPort, type LLMRequest, type LLMResponse } from '../types.js';

export interface CascadeProvider {
  name: string;
  driver: ILLMPort;
  priority?: number; // Lower number = higher priority (0, 1, 2...)
  cooldownMs?: number; // Duration to pause provider after failure (default 60_000ms)
}

export interface ProviderHealth {
  name: string;
  priority: number;
  healthy: boolean;
  failureCount: number;
  successCount: number;
  cooldownUntil: number;
  lastError?: string;
  lastUsed?: number;
}

export interface CascadingDriverOptions {
  providers: CascadeProvider[];
  embeddingDriver?: ILLMPort;
  onFailover?: (from: string, to: string, error: Error) => void;
}

export class CascadingLLMDriver implements ILLMPort {
  private providers: CascadeProvider[];
  private embeddingDriver?: ILLMPort;
  private onFailover?: (from: string, to: string, error: Error) => void;
  private healthMap: Map<string, ProviderHealth> = new Map();

  constructor(options: CascadingDriverOptions) {
    if (!options.providers || options.providers.length === 0) {
      throw new Error('CascadingLLMDriver requires at least one provider in the cascade.');
    }

    this.providers = [...options.providers].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    this.embeddingDriver = options.embeddingDriver;
    this.onFailover = options.onFailover;

    // Initialize health tracking
    for (const p of this.providers) {
      this.healthMap.set(p.name, {
        name: p.name,
        priority: p.priority ?? 0,
        healthy: true,
        failureCount: 0,
        successCount: 0,
        cooldownUntil: 0,
      });
    }
  }

  public async generateContent(request: LLMRequest): Promise<LLMResponse> {
    const now = Date.now();
    const sorted = [...this.providers].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    // Split candidates into currently available vs currently in cooldown
    const available: CascadeProvider[] = [];
    const inCooldown: CascadeProvider[] = [];

    for (const p of sorted) {
      const h = this.healthMap.get(p.name)!;
      if (h.cooldownUntil <= now) {
        available.push(p);
      } else {
        inCooldown.push(p);
      }
    }

    // If all are in cooldown, sort inCooldown by soonest expiration and use them
    const candidateQueue = available.length > 0 ? available : inCooldown.sort((a, b) => {
      const ha = this.healthMap.get(a.name)!;
      const hb = this.healthMap.get(b.name)!;
      return ha.cooldownUntil - hb.cooldownUntil;
    });

    const errors: Array<{ provider: string; error: Error }> = [];

    for (let i = 0; i < candidateQueue.length; i++) {
      const provider = candidateQueue[i];
      const health = this.healthMap.get(provider.name)!;

      try {
        const response = await provider.driver.generateContent(request);

        // Mark as healthy and update metrics
        health.healthy = true;
        health.cooldownUntil = 0;
        health.successCount += 1;
        health.lastUsed = Date.now();

        return {
          ...response,
          // Append provider attribution if not already present
          model: response.model.includes(provider.name)
            ? response.model
            : `${provider.name}:${response.model}`,
        };
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        errors.push({ provider: provider.name, error });

        // Update health status and trigger cooldown
        const cooldown = provider.cooldownMs ?? 60_000;
        health.healthy = false;
        health.failureCount += 1;
        health.cooldownUntil = Date.now() + cooldown;
        health.lastError = error.message;

        const nextProvider = candidateQueue[i + 1];
        if (nextProvider && this.onFailover) {
          try {
            this.onFailover(provider.name, nextProvider.name, error);
          } catch {
            // Ignore callback errors
          }
        }
      }
    }

    // If we reach here, all providers in the cascade failed
    const errorDetails = errors.map((e) => `[${e.provider}]: ${e.error.message}`).join('; ');
    throw new Error(`All providers in CascadingLLMDriver failed: ${errorDetails}`);
  }

  public async createEmbedding(text: string): Promise<number[]> {
    // 1. If explicit embedding driver configured, use it first
    if (this.embeddingDriver) {
      return this.embeddingDriver.createEmbedding(text);
    }

    // 2. Cascade across providers that support embeddings
    const sorted = [...this.providers].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    const errors: string[] = [];

    for (const p of sorted) {
      try {
        return await p.driver.createEmbedding(text);
      } catch (err: unknown) {
        errors.push(`${p.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    throw new Error(`CascadingLLMDriver embedding failed across all providers: ${errors.join(', ')}`);
  }

  public getProvidersStatus(): ProviderHealth[] {
    const now = Date.now();
    return Array.from(this.healthMap.values()).map((h) => ({
      ...h,
      healthy: h.cooldownUntil <= now,
    }));
  }

  public findDriver<T extends ILLMPort>(predicate: (driver: ILLMPort) => driver is T): T | undefined {
    for (const p of this.providers) {
      if (predicate(p.driver)) {
        return p.driver;
      }
    }
    return undefined;
  }

  public resetCircuitBreaker(providerName?: string): void {
    if (providerName) {
      const h = this.healthMap.get(providerName);
      if (h) {
        h.cooldownUntil = 0;
        h.healthy = true;
      }
    } else {
      for (const h of this.healthMap.values()) {
        h.cooldownUntil = 0;
        h.healthy = true;
      }
    }
  }
}
