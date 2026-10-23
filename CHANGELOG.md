# Changelog

All notable changes to the **OpenTalon** project are documented in this file.

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
