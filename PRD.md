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
- **`DualBrainRouter`**: Coordinates Fast Path (<1,500 token budget) and Slow Path (async event-driven evolution).
- **`TokenBudgeter`**: Context pruner maintaining strict per-turn token ceilings (~3.8 chars/token).
- **Hexagonal `LLMPort`**: Pluggable drivers including:
  - `GeminiDriver` (native `thinkingConfig.thinkingBudget`, prompt caching, and automatic fallback)
  - `OpenAIDriver` (standard chat completions & embeddings)
  - `MockLLMDriver` (deterministic offline testing double)
- **`EvolutionEngine` & `HeuristicsExtractor`**: Autonomous reflection on failed/missing-skill traces with dry-run sandbox verification.
- **`McpServer` & `McpClientAdapter`**: Full MCP v1.x JSON-RPC 2.0 protocol implementation over Stdio.
- **`SwarmDirector`**: 3 multi-agent topologies (Fan-Out/Fan-In, Pipeline Saga, Critic-Validator Loop).

### `@opentalon/memory` (Storage & Hybrid Search)
- **`LibSqlMemoryAdapter`**: Local `.db` and remote Turso `libsql://` unified client.
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
- **`LocalDaemonAdapter`**: Local HTTP server with REST endpoints, healthchecks, and embedded Web Dashboard.
- **`ServerlessEdgeAdapter`**: Web Standards Fetch API handler for Cloudflare Workers and Edge runtimes.
- **`SseStreamAdapter`**: Server-Sent Events (SSE) token-by-token streaming response generator.
- **Embedded Web Dashboard**: Zero-dependency dark-mode Cockpit with Overview Telemetry, Traces Inspector, Skills Explorer with Sandbox Runner, and Live Streaming Chat Playground.

### `talon` CLI
- Binary commands: `init`, `run`, `chat`, `serve`, `dashboard`, `mcp`, `swarm`, `evolve`, `skills list`, `skills add`.

---

## 4. Non-Functional Requirements (NFR)
- **Zero-Latency In-Process**: Monorepo packages call each other in-process with 0ms network hop.
- **Token Budget Ceiling**: Fast Path prompt payload $\le 1,500$ tokens per turn.
- **Test Coverage**: 100% passing unit tests (69 tests across 11 test suites) in under 2 seconds.
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
