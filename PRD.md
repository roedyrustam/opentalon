# Product Requirements Document (PRD): OpenTalon

## 1. Project Overview & Vision
**OpenTalon** is a next-generation, high-performance, open-source AI Agent framework. It synergizes the self-evolving procedural memory and autonomous skill synthesis of **Hermes Agent** with the ultra-frugal token consumption and multi-gateway agility of **OpenClaw**, governed by a Zero-Trust capability-based sandbox.

### Core Value Proposition
- **Extreme Token Frugality**: Fast Path execution maintains `< 1,500` tokens per conversational turn using hybrid RRF skill retrieval and prompt budget pruning.
- **Continuous Autonomous Evolution**: Background Slow Path asynchronously evaluates execution traces, synthesizes new procedural skills (`SKILL.md`), and commits them to versioned storage with automatic rollback on test failure.
- **Enterprise-Grade Zero-Trust Security**: Isolated VM execution sandbox with strict capability controls (`net.allowedHosts`, `fs.readPaths`/`fs.writePaths` via `VirtualFs`, and `env` whitelists).
- **Hybrid Deployment Topology**: Runs in-process on Node.js 22+ local CLI daemons and stateless serverless edge workers (Cloudflare Workers, AWS Lambda) using Hexagonal Ports & Adapters.
- **Native Swarm & MCP Support**: Built-in Multi-Agent Swarm Topologies (Fan-Out/Fan-In, Pipeline Saga, Critic-Validator Loop) and native Model Context Protocol (MCP v1.x) JSON-RPC 2.0 Server and Client.

---

## 2. Target Persona & Use Cases
1. **AI Agent Developers**: Need an extensible, production-ready framework with modular ports and adapters without vendor lock-in.
2. **FinTech & Enterprise Engineers**: Require deterministic security guarantees, audit logs, and capability controls over agent-generated code.
3. **Edge & Serverless Architects**: Require scale-to-zero agents with sub-second startup times and minimal token overhead.
4. **Autonomous Workflow Builders**: Need agents that learn from past mistakes and autonomously generate reusable tools over time.

---

## 3. System Architecture & Modules

### `@opentalon/core` (Control Plane)
- **`DualBrainRouter`**: Coordinates Fast Path (<1,500 token budget), Canonical KV-Cache Prefix Pinning, Dynamic System-2 Thinking Budget, Grounded Research Memory Persistence, and Slow Path (async event-driven evolution).
- **`ThinkingBudgetCalculator`**: Deterministic `O(1)` task entropy evaluator mapping lexical complexity, code blocks, analytical/security keywords, tool count, multimodal attachments, and retry state to `0`–`65,536` `thinkingBudget`.
- **`FinOpsBudgetTracker`**: Sovereign FinOps cost ledger tracking per-model USD cost, KV-cache USD savings, and enforcing daily token/cost envelopes with automatic frugal throttle (`<= 2,048` thinking cap at $\ge 80\%$ utilization).
- **`ContextCacheManager`**: Auto-wired Gemini `cachedContent` and canonical prefix hit tracker with bounded LRU/FIFO eviction (`maxEntries: 200`).
- **`CronScheduler` & `CronParser`**: Autonomous in-process heartbeat scheduler evaluating 5-part UNIX cron expressions and natural intervals (`@hourly`, `every 30m`), single-flight execution mutex, timeout guards, and dual routing (Fast Path prompt vs. Zero-Token direct skill).
- **`TokenBudgeter`**: Context pruner maintaining strict per-turn token ceilings (~3.8 chars/token) with canonical alphabetical sorting for tools and semantic facts.
- **Hexagonal `LLMPort`**: Pluggable drivers including:
  - `GeminiDriver` (native `thinkingConfig.thinkingBudget`, multimodal `inlineData` attachments, prompt caching, Search Grounding, and automatic fallback)
  - `AnthropicDriver` (Claude 3.7 hybrid thinking tokens & tool calling)
  - `DeepSeekDriver` (ultra-frugal reasoning content extraction)
  - `OllamaDriver` (100% offline local inference & embeddings)
  - `OpenAIDriver` (standard chat completions & embeddings)
  - `CascadingLLMDriver` (dynamic priority failover, circuit breakers, and `findDriver` inspection)
  - `MockLLMDriver` (deterministic offline testing double)
- **`EvolutionEngine` & `HeuristicsExtractor`**: Autonomous reflection on failed/missing-skill traces with dry-run sandbox verification and **Speculative Multi-Draft Synthesis** (`evolveOpportunitySpeculative`, benchmarking $N$ parallel candidates across varied temperatures).
- **`McpServer` & `McpClientAdapter`**: Full MCP v1.x JSON-RPC 2.0 protocol implementation over Stdio.
- **`SwarmDirector`**: 3 multi-agent topologies (Fan-Out/Fan-In, Pipeline Saga, Critic-Validator Loop).

### `@opentalon/memory` (Storage & Hybrid Search)
- **`LibSqlMemoryAdapter`**: Local `.db` and remote Turso `libsql://` unified client.
- **`scheduled_jobs` & `job_execution_logs`**: Persistent job schedule registry and audit trail with next-run indexes and automatic retry counts.
- **`semantic_facts` & FTS5**: Long-term declarative knowledge and developer preferences.
- **FTS5 BM25 Engine**: Sub-millisecond keyword retrieval with fallback LIKE query support.
- **Vector Cosine Similarity**: Float32Array embedding storage and cosine distance computation.
- **Reciprocal Rank Fusion (RRF)**: $RRF(d) = \sum \frac{1}{k + r(d)}$ for balancing semantic and lexical ranks.
- **Episodic Traces & Procedural Skills**: Relational schemas with indexed lookups and SHA-256 versioning.

### `@opentalon/skill-engine` (Sandbox & Synthesizer)
- **`SandboxedVmRunner`**: Node.js `vm.createContext` execution with global neutralization (`process`, `require`, `eval` stripped).
- **`VirtualFs`**: Scoped in-memory filesystem with directory traversal protection (`..` prevention).
- **`CapabilityValidator`**: Strict authorization gating for `net` (allowlisted hosts), `fs` (read/write paths), and `env` (declared keys).
- **`SkillMarkdownParser`**: Bi-directional YAML frontmatter + JavaScript code block serializer and parser.
- **`SkillVersionManager`**: SHA-256 content hashing, version history commit, and rollback mechanism.
- **`SkillSynthesizer`**: Autonomous generator validating test fixtures inside the sandbox before persisting.

### `@opentalon/gateway` (Hexagonal Ingress)
- **`LocalDaemonAdapter`**: Local HTTP server with REST endpoints, healthchecks, proactive heartbeat scheduler, and embedded Web Dashboard.
- **Inbound Webhook Ingress**: `POST /api/webhooks/:name` with optional HMAC SHA-256 signature verification (`X-Talon-Signature`).
- **`ServerlessEdgeAdapter`**: Web Standards Fetch API handler for Cloudflare Workers and Edge runtimes.
- **`SseStreamAdapter`**: Server-Sent Events (SSE) token-by-token streaming response generator & real-time event router bus.
- **Embedded Web Dashboard (8 Tabs)**: Zero-dependency dark-mode Cockpit with Overview Telemetry, 3D Holographic Core, Traces Inspector, Skills Explorer with Sandbox Runner, Swarm Topologies, MCP Hub, Semantic Memory, Live Streaming Chat Playground, and Automations & Cron Manager.

### `talon` CLI
- Binary commands: `init`, `run`, `chat`, `serve`, `dashboard`, `cron` (or `schedule`), `booster`, `finops`, `cache`, `analyze`, `mcp`, `swarm`, `evolve`, `skills list`, `skills add`, `providers`, `memory`.

---

## 4. Non-Functional Requirements (NFR)
- **Zero-Latency In-Process**: Monorepo packages call each other in-process with 0ms network hop.
- **Token Budget Ceiling**: Fast Path prompt payload $\le 1,500$ tokens per turn with 100% byte-identical canonical prefix sorting.
- **Test Coverage**: 100% passing unit tests (123 tests across 18 test suites) in ~2.5 seconds.
- **Anti-Slop Compliance**: Zero placeholder implementations (`// TODO`), production-grade TypeScript strictness (`noUnusedLocals: true`, strict ESM).
- **Type Safety**: Full TypeScript 5.8+ type definitions (`.d.ts`) emitted via `tsup`.

---

## 5. Deliverables & Verification Metrics (v0.1.0 Release)
- **Core Framework**: 5 modular packages in pnpm workspace.
- **Production Skills Gallery**: 6 verified skills (`currency-converter`, `http-json-fetcher`, `security-sanitizer`, `csv-data-pipeline`, `crypto-signer`, `math-stats-calculator`).
- **Deployment Templates**: Ready-to-deploy Cloudflare Worker (`deployments/cloudflare-worker/`) and Docker Compose (`deployments/docker/`).
- **Documentation**: Comprehensive bilingual `README.md`, `DOCUMENTATION.md`, `ERD.md`, and `PRD.md`.
- **Open-Source License**: MIT License (c) 2026 Roedy Rustam.
- **Repository**: Live on GitHub at `https://github.com/roedyrustam/opentalon`.
