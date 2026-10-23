# Blueprint: Gemini Agent Booster — Dynamic Thinking Budget & Auto KV-Cache Engine
**OpenTalon Platform Evolution — v0.3.0 Architecture**

---

## 1. Executive Summary & Goals
OpenTalon v0.3.0 upgrades the control plane (`@opentalon/core`) and ingress gateway (`@opentalon/gateway`) with the **Gemini Agent Booster Protocol**:
1. **Zero-Latency Dynamic Thinking Budget Orchestrator (`ThinkingBudgetCalculator`)**: Automatically scores task entropy (`O(1)`, `<0.1ms`) and allocates `thinkingConfig.thinkingBudget` (`0` to `65,536` tokens) across Fast Path, Sandbox Self-Correction Retry, and Swarm execution.
2. **Deterministic KV-Cache Prefix Pinning (`TokenBudgeter`)**: Canonically sorts `ToolDefinition[]` and `SemanticFact[]` so static prefixes remain 100% byte-identical across turns, maximizing implicit and explicit KV-cache hits.
3. **Auto-Wired `ContextCacheManager`**: Seamlessly wires native Gemini Context Caching (`cachedContent`) and deterministic prefix hit tracking into `DualBrainRouter` and `SwarmDirector`, with LRU/FIFO eviction (`maxEntries: 200`) and automatic availability fallback (`gemini-4-argon` / `gemini-4-pro` $\rightarrow$ `gemini-3.8-flash`).
4. **Booster & FinOps Telemetry**: Exposes real-time cache hit rates, prefix match counts, tokens saved, and thinking budget allocations via `/api/stats` and `/api/booster/stats`.

---

## 2. Architectural Pillars & Skill Delegation Matrix

| Domain Module | Orchestrated Skills | Key Responsibilities |
| :--- | :--- | :--- |
| **Thinking Budget Engine** | `gemini-agent-booster`, `thinking-budget-orchestrator`, `test-time-compute-optimizer` | Deterministic `O(1)` task entropy scoring (0–100) mapping to `fast` (`0`–`2048`), `balanced` (`4096`–`8192`), `deep` (`16384`–`32768`), and `extreme` (`65536`) budgets. |
| **Canonical Prefix Pinning** | `kv-cache-prefix-optimizer`, `context-window-engineer` | Canonical sorting of tools, JSON schema keys, and semantic facts; SHA-256 prefix fingerprinting. |
| **Auto KV-Cache Manager** | `gemini-agent-booster`, `llm-finops-router` | Automatic `cachedContent` lifecycle, LRU registry bounding (`maxEntries`), prefix hit telemetry, and fallback model degradation. |
| **Router & Swarm Wiring** | `ai-llm-integration-expert`, `adaptive-model-cascade` | Auto-wiring `ThinkingBudgetCalculator` and `ContextCacheManager` into `DualBrainRouter.executeFastPath()` and `SwarmDirector`. |
| **Gateway Telemetry** | `data-telemetry-expert`, `senior-frontend` | Enriched `/api/stats` and `/api/booster/stats` endpoints with cache savings and thinking budget metrics. |
| **Verification & Quality** | `autonomous-tdd-debugger`, `anti-slop` | 100% passing unit test suites covering entropy tiers, canonical prefix hashes, cache eviction, and router integration. |

---

## 3. Architectural Decision Records (MADR)

| # | Decision Title | Status | Context & Problem | Chosen Solution & Rationale | Consequences & Trade-offs | Orchestrated Skill |
|---|----------------|--------|-------------------|-----------------------------|---------------------------|-------------------|
| 1 | Zero-Latency Heuristic Entropy Scoring | Accepted | Pre-flight LLM classifier calls add 250–600ms TTFT and double API request overhead. | Use an in-memory deterministic heuristic (`ThinkingBudgetCalculator`) scoring lexical complexity, code blocks, analytical keywords, tool count, and retry state. | 0ms latency overhead, 100% deterministic unit testing, and immediate escalation on sandbox retry. | `thinking-budget-orchestrator` |
| 2 | Canonical Prefix Sorting for KV-Cache | Accepted | Hybrid search returns skills and facts ordered by dynamic similarity scores, breaking byte-identical prompt prefixes across turns. | Sort retrieved `ToolDefinition[]` by `name` and `SemanticFact[]` by `category:key` before assembling the prompt prefix. | Preserves 100% semantic equivalence while guaranteeing byte-identical static prefixes for 75–90% KV-cache discounts. | `kv-cache-prefix-optimizer` |
| 3 | Dual-Threshold Cache & Prefix Tracking | Accepted | Gemini explicit `cachedContents` requires $\ge 32,768$ tokens, whereas many Fast Path prompts are $< 1,500$ tokens. | Track deterministic `prefixHash` across all turns (measuring implicit KV-cache reuse) while invoking `createCache()` automatically when context $\ge minTokenThreshold`. | Provides full FinOps visibility for both compact Fast Path prompts and massive monolithic contexts. | `gemini-agent-booster` |
| 4 | Bounded Cache Registry Eviction | Accepted | Long-running local daemons (`talon serve`) could accumulate unbounded entries in `ContextCacheManager.cacheRegistry`. | Enforce `maxEntries` (default 200) with expired-first and oldest-entry eviction. | Prevents memory leaks during multi-week daemon uptime. | `error-resilience-expert` |

---

## 4. Subagent Contract Map Slice (`CONTEXT_MAP.md`)

```typescript
export type ThinkingTier = 'fast' | 'balanced' | 'deep' | 'extreme';

export interface ThinkingEvaluationInput {
  input: string;
  toolCount?: number;
  isRetry?: boolean;
  isArchitectureOrEvolution?: boolean;
  overrideBudget?: number;
  overrideMode?: 'fast' | 'balanced' | 'deep';
}

export interface ThinkingEvaluationResult {
  entropyScore: number; // 0 to 100
  tier: ThinkingTier;
  thinkingBudget: number; // 0, 1024, 2048, 4096, 8192, 16384, 32768, 65536
  mode: 'fast' | 'balanced' | 'deep';
  reasons: string[];
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
```
