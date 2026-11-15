import { type DualBrainRouter } from '../router/dual-brain-router.js';

/**
 * Structured snapshot of OpenTalon runtime, KV-cache, FinOps, security,
 * and memory telemetry exported by {@link PrometheusExporter}.
 */
export interface OpenTalonMetricsSnapshot {
  up: number;
  uptimeSeconds: number;
  fastPathTurnsTotal: number;
  avgThinkingBudgetTokens: number;
  kvCacheHitsTotal: number;
  kvCacheMissesTotal: number;
  kvCacheHitRatePct: number;
  kvCacheTokensSavedTotal: number;
  finopsSpendUsdTotal: number;
  finopsSavedUsdTotal: number;
  finopsDailyUtilizationPct: number;
  finopsThrottleActive: number;
  securityScansTotal: number;
  securityBlockedTotal: number;
  securitySanitizedTotal: number;
  securitySecretsRedactedTotal: number;
  skillsRegisteredTotal: number;
  tracesRecentCount: number;
  memoryRssBytes: number;
  memoryHeapUsedBytes: number;
}

interface MetricDescriptor {
  key: keyof OpenTalonMetricsSnapshot;
  name: string;
  type: 'gauge' | 'counter';
  help: string;
}

const METRIC_DESCRIPTORS: readonly MetricDescriptor[] = [
  {
    key: 'up',
    name: 'opentalon_up',
    type: 'gauge',
    help: 'Whether the OpenTalon runtime is up and serving (1 = up).',
  },
  {
    key: 'uptimeSeconds',
    name: 'opentalon_uptime_seconds',
    type: 'gauge',
    help: 'Process uptime in seconds.',
  },
  {
    key: 'fastPathTurnsTotal',
    name: 'opentalon_fast_path_turns_total',
    type: 'counter',
    help: 'Total Fast Path turns processed by DualBrainRouter.',
  },
  {
    key: 'avgThinkingBudgetTokens',
    name: 'opentalon_avg_thinking_budget_tokens',
    type: 'gauge',
    help: 'Average System-2 thinking token budget allocated per Fast Path turn.',
  },
  {
    key: 'kvCacheHitsTotal',
    name: 'opentalon_kv_cache_hits_total',
    type: 'counter',
    help: 'Total KV-cache and canonical prefix pinning hits.',
  },
  {
    key: 'kvCacheMissesTotal',
    name: 'opentalon_kv_cache_misses_total',
    type: 'counter',
    help: 'Total explicit context cache misses.',
  },
  {
    key: 'kvCacheHitRatePct',
    name: 'opentalon_kv_cache_hit_rate_pct',
    type: 'gauge',
    help: 'KV-cache hit rate percentage across tracked lookups (0-100).',
  },
  {
    key: 'kvCacheTokensSavedTotal',
    name: 'opentalon_kv_cache_tokens_saved_total',
    type: 'counter',
    help: 'Estimated cumulative prompt tokens saved via KV-cache reuse.',
  },
  {
    key: 'finopsSpendUsdTotal',
    name: 'opentalon_finops_spend_usd_total',
    type: 'counter',
    help: 'Estimated cumulative LLM API spend in USD.',
  },
  {
    key: 'finopsSavedUsdTotal',
    name: 'opentalon_finops_saved_usd_total',
    type: 'counter',
    help: 'Estimated cumulative USD saved via KV-cache prefix pinning.',
  },
  {
    key: 'finopsDailyUtilizationPct',
    name: 'opentalon_finops_daily_utilization_pct',
    type: 'gauge',
    help: 'Current daily FinOps budget utilization percentage.',
  },
  {
    key: 'finopsThrottleActive',
    name: 'opentalon_finops_throttle_active',
    type: 'gauge',
    help: 'Whether Sovereign FinOps frugal thinking throttle is active (1 = active, 0 = inactive).',
  },
  {
    key: 'securityScansTotal',
    name: 'opentalon_security_scans_total',
    type: 'counter',
    help: 'Total inbound prompts scanned by PromptInjectionFirewall.',
  },
  {
    key: 'securityBlockedTotal',
    name: 'opentalon_security_blocked_total',
    type: 'counter',
    help: 'Total requests blocked by PromptInjectionFirewall.',
  },
  {
    key: 'securitySanitizedTotal',
    name: 'opentalon_security_sanitized_total',
    type: 'counter',
    help: 'Total requests sanitized by PromptInjectionFirewall.',
  },
  {
    key: 'securitySecretsRedactedTotal',
    name: 'opentalon_security_secrets_redacted_total',
    type: 'counter',
    help: 'Total leaked API keys or private keys redacted by PromptInjectionFirewall.',
  },
  {
    key: 'skillsRegisteredTotal',
    name: 'opentalon_skills_registered_total',
    type: 'gauge',
    help: 'Total number of procedural skills registered in memory.',
  },
  {
    key: 'tracesRecentCount',
    name: 'opentalon_traces_recent_count',
    type: 'gauge',
    help: 'Number of recent episodic traces retrieved (up to 100).',
  },
  {
    key: 'memoryRssBytes',
    name: 'opentalon_memory_rss_bytes',
    type: 'gauge',
    help: 'Resident Set Size (RSS) memory usage in bytes.',
  },
  {
    key: 'memoryHeapUsedBytes',
    name: 'opentalon_memory_heap_used_bytes',
    type: 'gauge',
    help: 'V8 heap memory used in bytes.',
  },
];

/**
 * Exports OpenTalon Dual-Brain Router, FinOps, KV-Cache, Firewall, and process
 * telemetry as structured snapshots or Prometheus OpenMetrics exposition text.
 */
export class PrometheusExporter {
  /**
   * Collects a point-in-time metrics snapshot from the router and runtime process.
   */
  public static async getMetricsSnapshot(
    router: DualBrainRouter
  ): Promise<OpenTalonMetricsSnapshot> {
    const booster = router.getBoosterStats();
    const memory = router.getMemory();
    const [skills, traces] = await Promise.all([
      memory.listSkills(),
      memory.getRecentTraces(100),
    ]);

    const uptimeSeconds =
      typeof process !== 'undefined' && typeof process.uptime === 'function'
        ? Math.round(process.uptime())
        : 0;
    const memUsage =
      typeof process !== 'undefined' && typeof process.memoryUsage === 'function'
        ? process.memoryUsage()
        : { rss: 0, heapUsed: 0 };

    const kvCacheHitsTotal = (booster.cacheHits ?? 0) + (booster.prefixHits ?? 0);
    const kvCacheMissesTotal = booster.cacheMisses ?? 0;
    const totalCacheLookups = kvCacheHitsTotal + kvCacheMissesTotal;
    const kvCacheHitRatePct =
      totalCacheLookups > 0
        ? Number(((kvCacheHitsTotal / totalCacheLookups) * 100).toFixed(2))
        : 0;

    return {
      up: 1,
      uptimeSeconds,
      fastPathTurnsTotal: booster.fastPathTurnsCount ?? 0,
      avgThinkingBudgetTokens: booster.avgThinkingBudget ?? 0,
      kvCacheHitsTotal,
      kvCacheMissesTotal,
      kvCacheHitRatePct,
      kvCacheTokensSavedTotal: booster.estimatedTokensSaved ?? 0,
      finopsSpendUsdTotal: booster.finops.totalEstimatedCostUsd ?? 0,
      finopsSavedUsdTotal: booster.finops.totalEstimatedSavingsUsd ?? 0,
      finopsDailyUtilizationPct: booster.finops.budgetUtilizationPct ?? 0,
      finopsThrottleActive: booster.finops.frugalThrottleActive ? 1 : 0,
      securityScansTotal: booster.security.totalScanned ?? 0,
      securityBlockedTotal: booster.security.blockedCount ?? 0,
      securitySanitizedTotal: booster.security.sanitizedCount ?? 0,
      securitySecretsRedactedTotal: booster.security.secretsRedactedCount ?? 0,
      skillsRegisteredTotal: skills.length,
      tracesRecentCount: traces.length,
      memoryRssBytes: memUsage.rss ?? 0,
      memoryHeapUsedBytes: memUsage.heapUsed ?? 0,
    };
  }

  /**
   * Formats all runtime metrics into Prometheus text exposition format (0.0.4).
   */
  public static async exportMetrics(router: DualBrainRouter): Promise<string> {
    const snapshot = await this.getMetricsSnapshot(router);
    const lines: string[] = [];

    for (const descriptor of METRIC_DESCRIPTORS) {
      const rawValue = snapshot[descriptor.key];
      const safeValue = Number.isFinite(rawValue) ? rawValue : 0;
      lines.push(`# HELP ${descriptor.name} ${descriptor.help}`);
      lines.push(`# TYPE ${descriptor.name} ${descriptor.type}`);
      lines.push(`${descriptor.name} ${safeValue}`);
    }

    return `${lines.join('\n')}\n`;
  }
}
