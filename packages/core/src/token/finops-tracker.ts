export interface ModelPricingRate {
  inputPer1MUsd: number;
  outputPer1MUsd: number;
  cachedInputPer1MUsd: number;
}

export interface ModelUsageLedger {
  model: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  thinkingTokens: number;
  cachedTokensSaved: number;
  estimatedCostUsd: number;
  estimatedSavingsUsd: number;
}

export interface FinOpsReport {
  totalCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalThinkingTokens: number;
  totalCachedTokensSaved: number;
  totalEstimatedCostUsd: number;
  totalEstimatedSavingsUsd: number;
  dailyTokenCeiling: number;
  dailyCostCeilingUsd: number;
  budgetUtilizationPct: number;
  frugalThrottleActive: boolean;
  byModel: ModelUsageLedger[];
}

export interface FinOpsTrackerOptions {
  dailyTokenCeiling?: number;   // Default: 2,000,000 tokens/day
  dailyCostCeilingUsd?: number; // Default: $5.00/day
  throttleThresholdPct?: number; // Default: 80% (activates frugal thinking cap)
}

const DEFAULT_PRICING_MATRIX: Record<string, ModelPricingRate> = {
  'gemini-4-pro': { inputPer1MUsd: 1.25, outputPer1MUsd: 5.0, cachedInputPer1MUsd: 0.18 },
  'gemini-4-argon': { inputPer1MUsd: 0.5, outputPer1MUsd: 2.0, cachedInputPer1MUsd: 0.08 },
  'gemini-3.8-flash': { inputPer1MUsd: 0.1, outputPer1MUsd: 0.4, cachedInputPer1MUsd: 0.025 },
  'gemini-3.5-flash-lite': { inputPer1MUsd: 0.075, outputPer1MUsd: 0.3, cachedInputPer1MUsd: 0.018 },
  'claude-3-7-sonnet': { inputPer1MUsd: 3.0, outputPer1MUsd: 15.0, cachedInputPer1MUsd: 0.3 },
  'deepseek-chat': { inputPer1MUsd: 0.14, outputPer1MUsd: 0.28, cachedInputPer1MUsd: 0.014 },
  'gpt-4o-mini': { inputPer1MUsd: 0.15, outputPer1MUsd: 0.6, cachedInputPer1MUsd: 0.075 },
  ollama: { inputPer1MUsd: 0, outputPer1MUsd: 0, cachedInputPer1MUsd: 0 },
  mock: { inputPer1MUsd: 0, outputPer1MUsd: 0, cachedInputPer1MUsd: 0 },
};

/**
 * Sovereign FinOps Cost Envelope & Token Telemetry Tracker
 * Tracks per-model token spend, KV-cache USD savings, and enforces daily budget envelopes.
 */
export class FinOpsBudgetTracker {
  private dailyTokenCeiling: number;
  private dailyCostCeilingUsd: number;
  private throttleThresholdPct: number;
  private ledgers: Map<string, ModelUsageLedger> = new Map();

  constructor(options: FinOpsTrackerOptions = {}) {
    this.dailyTokenCeiling = options.dailyTokenCeiling ?? 2_000_000;
    this.dailyCostCeilingUsd = options.dailyCostCeilingUsd ?? 5.0;
    this.throttleThresholdPct = options.throttleThresholdPct ?? 80;
  }

  public resolvePricing(modelName: string): ModelPricingRate {
    const normalized = (modelName || 'gemini-3.8-flash').toLowerCase();
    for (const [key, rate] of Object.entries(DEFAULT_PRICING_MATRIX)) {
      if (normalized.includes(key)) {
        return rate;
      }
    }
    return DEFAULT_PRICING_MATRIX['gemini-3.8-flash'];
  }

  /**
   * Records a completed LLM turn into the FinOps ledger.
   */
  public recordTurn(params: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    thinkingBudgetUsed?: number;
    tokensSaved?: number;
  }): ModelUsageLedger {
    const modelKey = params.model || 'gemini-3.8-flash';
    const rate = this.resolvePricing(modelKey);

    const existing = this.ledgers.get(modelKey) ?? {
      model: modelKey,
      calls: 0,
      promptTokens: 0,
      completionTokens: 0,
      thinkingTokens: 0,
      cachedTokensSaved: 0,
      estimatedCostUsd: 0,
      estimatedSavingsUsd: 0,
    };

    const promptTok = Math.max(0, params.promptTokens || 0);
    const compTok = Math.max(0, params.completionTokens || 0);
    const thinkTok = Math.max(0, params.thinkingBudgetUsed || 0);
    const savedTok = Math.max(0, params.tokensSaved || 0);

    const turnCostUsd =
      (promptTok / 1_000_000) * rate.inputPer1MUsd +
      (compTok / 1_000_000) * rate.outputPer1MUsd;

    const turnSavingsUsd =
      (savedTok / 1_000_000) * Math.max(0, rate.inputPer1MUsd - rate.cachedInputPer1MUsd);

    existing.calls += 1;
    existing.promptTokens += promptTok;
    existing.completionTokens += compTok;
    existing.thinkingTokens += thinkTok;
    existing.cachedTokensSaved += savedTok;
    existing.estimatedCostUsd = Number((existing.estimatedCostUsd + turnCostUsd).toFixed(6));
    existing.estimatedSavingsUsd = Number(
      (existing.estimatedSavingsUsd + turnSavingsUsd).toFixed(6)
    );

    this.ledgers.set(modelKey, existing);
    return existing;
  }

  /**
   * Returns true if token or USD spend has reached the frugal throttle threshold (default 80%).
   */
  public isFrugalThrottleActive(): boolean {
    const report = this.getReport();
    return report.frugalThrottleActive;
  }

  /**
   * Generates a consolidated FinOps report across all active models.
   */
  public getReport(): FinOpsReport {
    let totalCalls = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalThinkingTokens = 0;
    let totalCachedTokensSaved = 0;
    let totalEstimatedCostUsd = 0;
    let totalEstimatedSavingsUsd = 0;

    const byModel: ModelUsageLedger[] = [];

    for (const ledger of this.ledgers.values()) {
      totalCalls += ledger.calls;
      totalPromptTokens += ledger.promptTokens;
      totalCompletionTokens += ledger.completionTokens;
      totalThinkingTokens += ledger.thinkingTokens;
      totalCachedTokensSaved += ledger.cachedTokensSaved;
      totalEstimatedCostUsd += ledger.estimatedCostUsd;
      totalEstimatedSavingsUsd += ledger.estimatedSavingsUsd;
      byModel.push({ ...ledger });
    }

    const totalTokens = totalPromptTokens + totalCompletionTokens;
    const tokenPct =
      this.dailyTokenCeiling > 0 ? (totalTokens / this.dailyTokenCeiling) * 100 : 0;
    const costPct =
      this.dailyCostCeilingUsd > 0
        ? (totalEstimatedCostUsd / this.dailyCostCeilingUsd) * 100
        : 0;
    const budgetUtilizationPct = Number(Math.max(tokenPct, costPct).toFixed(2));

    return {
      totalCalls,
      totalPromptTokens,
      totalCompletionTokens,
      totalThinkingTokens,
      totalCachedTokensSaved,
      totalEstimatedCostUsd: Number(totalEstimatedCostUsd.toFixed(6)),
      totalEstimatedSavingsUsd: Number(totalEstimatedSavingsUsd.toFixed(6)),
      dailyTokenCeiling: this.dailyTokenCeiling,
      dailyCostCeilingUsd: this.dailyCostCeilingUsd,
      budgetUtilizationPct,
      frugalThrottleActive: budgetUtilizationPct >= this.throttleThresholdPct,
      byModel,
    };
  }

  public reset(): void {
    this.ledgers.clear();
  }
}
