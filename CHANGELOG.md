# Changelog

All notable changes to the **OpenTalon** project are documented in this file.

## [1.0.0] - 2026-11-15 — Production GA Release: Prometheus Observability, Edge Rate Limiting, System Doctor & Benchmark Suite

### Added
- **Prometheus OpenMetrics Exporter (`PrometheusExporter` in `@opentalon/core`)**: Added `getMetricsSnapshot()` and `exportMetrics()` exposing `opentalon_*` counters and gauges (`opentalon_up`, `opentalon_uptime_seconds`, `opentalon_fast_path_turns_total`, `opentalon_avg_thinking_budget_tokens`, `opentalon_kv_cache_hits_total`, `opentalon_kv_cache_misses_total`, `opentalon_kv_cache_tokens_saved_total`, `opentalon_finops_spend_usd_total`, `opentalon_finops_saved_usd_total`, `opentalon_security_scans_total`, `opentalon_security_blocked_total`, `opentalon_skills_registered_total`, `opentalon_traces_recent_count`, plus runtime heap/RSS and FinOps/firewall gauges).
- **System Doctor & Benchmark Engine (`SystemDoctor` in `@opentalon/core`)**: Added `runDiagnostics()` (8 live production & zero-trust self-checks) and `runBenchmark()` deterministic micro-benchmark runner.
- **Sliding-Window Rate Limiter (`SlidingWindowRateLimiter` in `@opentalon/gateway`)**: Configurable `RateLimitConfig` (`windowMs`, `maxRequests`, `maxTrackedKeys`), standard rate-limit response headers, and HTTP `429 Too Many Requests` enforcement across both `ServerlessEdgeAdapter` and `LocalDaemonAdapter`.
- **Full Serverless Edge Feature Parity (`ServerlessEdgeAdapter`)**: Added public GET routes (`/health`, `/health/ready`, `/healthz`, `/privacy`, `/privacy-policy`, `/terms`, `/terms-and-conditions`, `/delete-account`, `/data-deletion`), authenticated endpoints (`POST /api/privacy/delete-data`, `GET /api/security/report`, `POST /api/security/audit`, `GET /api/finops/report`, `GET /api/booster/stats`), and multimodal/grounding/thinking Fast Path payload parity.
- **Local Daemon Observability & Readiness (`LocalDaemonAdapter`)**: Added `GET /metrics` (`text/plain; version=0.0.4; charset=utf-8`), `GET /health/ready`, `GET /healthz`, optional `rateLimit`, and bumped Agent Card version to `1.0.0`.
- **CLI Diagnostics & Benchmarks (`packages/cli`)**: Bumped `talon` CLI to `1.0.0`, added `talon doctor` (`--db`, `--json`) running 8 live production-readiness and zero-trust checks, and added `talon benchmark` (`-n, --iterations`, `--json`) measuring ops/sec and avg latency across `ThinkingBudgetCalculator`, `TokenBudgeter` KV-Cache hashing, `PromptInjectionFirewall`, `SecurityGate`, `SandboxedVmRunner`, and `LibSqlMemoryAdapter` FTS5 + Hybrid RRF retrieval.
- **Docker & Package Version Synchronization**: Synchronized `"version": "1.0.0"` across root and all workspace packages (`@opentalon/core`, `@opentalon/memory`, `@opentalon/skill-engine`, `@opentalon/gateway`, `talon`, `opentalon-cloudflare-worker`), aligned `deployments/docker/Dockerfile` to `pnpm@9.15.9`, and added Docker `HEALTHCHECK` targeting `/health/ready`.

## [0.7.0] - 2026-11-15 — Zero-Trust Security Gate, Prompt-Injection Firewall & Anti-SSRF Sandbox Shield

### Added
- **Static Skill Security Gate (`SecurityGate` in `@opentalon/skill-engine`)**: 12 deterministic rules (`SEC-001` through `SEC-012`) scanning code & capability declarations for prototype pollution (`SEC-001`), dynamic code evaluation `eval`/`Function` (`SEC-002`), host process/native escapes (`SEC-003`), cloud metadata SSRF (`SEC-004`), wildcard hosts (`SEC-005`), FS path traversal (`SEC-006`), unbounded infinite loops `while(true)`/`for(;;)` (`SEC-007`), master secret env grants (`SEC-008`), unsafe raw `Buffer` allocation (`SEC-009`), wildcard/deep skill chaining (`SEC-010`), hardcoded secrets (`SEC-011`), and ReDoS regex literals (`SEC-012`).
- **Pre-Execution & Synthesis Security Enforcement**: `SandboxedVmRunner.execute()` pre-blocks critical violations (`SEC-001`..`SEC-004`) before VM launch, while `SkillSynthesizer.synthesize()` rejects any `!audit.passed` candidate (including high-severity `SEC-007`).
- **Anti-SSRF Metadata & Wildcard Host Shield (`CapabilityValidator`)**: Added `isCloudMetadataOrForbiddenHost()` and blocked wildcard `'*'` network grants plus cloud instance metadata targets (`169.254.169.254`, `metadata.google.internal`, `metadata.goog`, `100.100.100.200`, `fd00:ec2::254`, `0.0.0.0`).
- **Runtime Prompt-Injection Firewall (`PromptInjectionFirewall` in `@opentalon/core`)**: Pre-scans inbound Fast Path prompts against rules `PI-001`..`PI-005` (`system_override`, `jailbreak_persona`, `delimiter_spoofing`, `indirect_injection`, `secret_exfiltration`), automatically redacts `sk-...`, `AIza...`, and PEM private keys (`[REDACTED_*]`), supports `sanitize` (default), `block`, and `audit` modes, and records bounded 200-event security telemetry (`DualBrainRouter.getFirewall()`, `getBoosterStats().security`, `FastPathResult.securityScan`).
- **Mandatory Legal, Privacy & Right-to-Erasure Trio (`@opentalon/memory` + `@opentalon/gateway`)**: Added `IMemoryPort.deleteSessionData(sessionId)` (with `'*'` global wipe & FTS5 cleanup) in `LibSqlMemoryAdapter`, bilingual EN/ID HTML pages (`/privacy`, `/terms`, `/delete-account`), `POST /api/privacy/delete-data` (`UU-PDP-No-27-2022`, `GDPR-Art-17`), `GET /api/security/report`, `POST /api/security/audit`, and the **Security Shield** Web Cockpit tab (`#security`).
- **CLI Security Suite (`packages/cli`)**: Added `talon security status`, `talon security scan <prompt>` (alias `scan-prompt`), and `talon security audit-skill <nameOrPath>`.

## [0.5.0] - 2026-10-23 — Sovereign FinOps & Gemini Agent Booster Complete Suite

### Added
- **Sovereign FinOps Cost Envelope (`FinOpsBudgetTracker`)**: Per-model token and USD expenditure tracking (`gemini-4-pro`, `gemini-4-argon`, `gemini-3.8-flash`, `claude-3-7-sonnet`, `deepseek-chat`, `gpt-4o-mini`, `ollama`), KV-cache USD savings ledger, and automatic **Frugal Throttle Guard** ($\ge 80\%$ daily utilization caps `thinkingBudget` at $\le 2,048$ tokens).
- **FinOps Gateway & CLI**: Added `GET /api/finops/report` endpoint and `talon finops` CLI command.
- **Community & Open-Source Governance**: Added `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `llms.txt`, GitHub Actions CI workflow (`.github/workflows/ci.yml`), and structured GitHub Issue/PR templates.

## [0.4.0] - 2026-10-23 — Multimodal Grounding, Research Memory & Speculative Evolution

### Added
- **Native Multimodal Vision, PDF & Audio Ingestion (`MultimodalAttachment`)**: Support for base64 `inlineData` attachments in `ChatMessage`, `GeminiDriver`, Gateway APIs, and the Web Cockpit Live Playground (`📎 Attach` bar).
- **Autonomous Grounded Research Memory (`autoSaveGroundedFacts`)**: Automatically persists verified Google Search Grounding citations (`GroundingMetadata.sources`) into `semantic_facts` (`category: 'grounded_research'`) for zero-cost future recall.
- **Speculative Multi-Draft Skill Evolution (`evolveOpportunitySpeculative`)**: Parallel synthesis of $N$ candidate `SKILL.md` files across varied temperatures (`0.1`–`0.9`), automated sandbox benchmarking, and selection of the fastest passing implementation (`talon evolve --speculative 3`).

## [0.3.0] - 2026-10-23 — Dynamic System-2 Thinking Budget & Auto KV-Cache Engine

### Added
- **`ThinkingBudgetCalculator`**: Deterministic `O(1)` task entropy evaluator mapping prompt complexity, code blocks, analytical/security keywords, tool count, and retry state to `0`–`65,536` `thinkingBudget`.
- **Canonical KV-Cache Prefix Pinning (`TokenBudgeter`)**: Alphabetical sorting of `ToolDefinition[]`, JSON Schema keys, and `SemanticFact[]` (`category:key`) with SHA-256 `prefixHash` fingerprinting.
- **Auto-Wired `ContextCacheManager`**: Automatic prefix hit tracking, explicit Gemini `cachedContents` provisioning, bounded LRU registry eviction (`maxEntries: 200`), and graceful fallback to `gemini-3.8-flash`.
- **CLI & Gateway Telemetry**: Added `talon booster evaluate`, `talon booster status`, and `GET /api/booster/stats`.

## [0.2.0] - 2026-10-23 — Proactive Background Daemon, Cron Scheduler & Webhook Ingress

### Added
- **`CronScheduler` & `CronParser`**: In-process 1-second heartbeat scheduler supporting 5-part UNIX cron, shorthand aliases (`@hourly`, `@daily`), and natural intervals (`every 30s`, `every 15m`) with single-flight mutex protection and anti-thundering herd catch-up coalescing.
- **Dual Execution Routing**: Scheduled jobs support cognitive Fast Path prompts (`<1,500` tokens) or **0-Token Direct Skill Execution** in the Zero-Trust Sandbox.
- **Inbound Webhook Ingress**: `POST /api/webhooks/:name` with optional HMAC SHA-256 signature verification (`X-Talon-Signature`).
- **Web Cockpit Tab 8 & CLI Suite**: Added Automations & Cron Manager tab and `talon cron` (`list`, `add`, `trigger`, `pause`, `resume`, `remove`, `logs`).

## [0.1.0] - 2026-10-22 — Initial Public Release

### Added
- Core Hexagonal Monorepo (`@opentalon/core`, `@opentalon/memory`, `@opentalon/skill-engine`, `@opentalon/gateway`, `talon` CLI).
- Hybrid libSQL storage engine combining FTS5 BM25 keyword search and Float32 vector cosine similarity via Reciprocal Rank Fusion (RRF).
- Zero-Trust `SandboxedVmRunner` with `VirtualFs` and `CapabilityValidator`.
- Multi-Agent Swarm Director (Fan-Out/Fan-In, Pipeline Saga, Critic-Validator Loop) and Native MCP v1.x JSON-RPC Server & Client.
