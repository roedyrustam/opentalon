# OpenTalon Documentation & Developer Guide

OpenTalon is a high-performance, open-source AI Agent framework engineered with a **Hexagonal Ports & Adapters** architecture. It combines the self-evolving procedural memory and autonomous skill synthesis of **Hermes Agent** with the ultra-frugal token budget (<1,500 tokens/turn) and low-latency gateway routing of **OpenClaw**, governed by a Zero-Trust capability-bounded sandbox.

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Monorepo Package Structure](#monorepo-package-structure)
3. [Prerequisites & Installation](#prerequisites--installation)
4. [CLI Developer Tooling (`talon`)](#cli-developer-tooling-talon)
5. [Dual-Brain Protocol (Fast Path vs Slow Path)](#dual-brain-protocol-fast-path-vs-slow-path)
6. [Zero-Trust Skill Sandbox](#zero-trust-skill-sandbox)
7. [Memory Engine & Hybrid RRF Retrieval](#memory-engine--hybrid-rrf-retrieval)
8. [LLM Driver Providers](#llm-driver-providers)
9. [Ingress Gateway Adapters](#ingress-gateway-adapters)
10. [Authoring Procedural Skills (`SKILL.md`)](#authoring-procedural-skills-skillmd)
11. [Agent-to-Agent (A2A) Protocol & P2P Mesh Federation](#a2a-protocol--p2p-mesh-federation)
12. [Verification & Testing](#verification--testing)

---

## Architecture Overview

OpenTalon strictly segregates pure agent logic from external infrastructures via Ports and Adapters:

```
                   ┌──────────────────────────────────────────────┐
                   │             Inbound Gateway Adapters          │
                   │  - Local CLI Daemon (HTTP / WebSocket)       │
                   │  - Serverless Edge HTTP (Cloudflare/Lambda)  │
                   └──────────────────────┬───────────────────────┘
                                          │ Inbound Ports
                                          ▼
                   ┌──────────────────────────────────────────────┐
                   │             OpenTalon Control Plane          │
                   │               (@opentalon/core)              │
                   │  - Dual-Brain Router (Fast vs Slow Path)     │
                   │  - Token Budget Manager (<1,500 tokens)      │
                   │  - Context Compressor & KV Cache Pinning     │
                   └───────┬──────────────────────────────┬───────┘
                           │ Outbound                     │ Outbound
                           ▼ Ports                        ▼ Ports
      ┌───────────────────────────────────┐  ┌───────────────────────────────────┐
      │        Memory & Storage Port      │  │             LLM Port              │
      │        (@opentalon/memory)        │  │  - Gemini Driver (Thinking/Cache) │
      │  - libSQL Client (Local & Remote) │  │  - OpenAI Driver                  │
      │  - FTS5 BM25 Engine               │  │  - Mock Driver (Offline/Tests)    │
      │  - Reciprocal Rank Fusion (RRF)   │  └───────────────────────────────────┘
      └───────────────────────────────────┘
                           │
                           ▼
      ┌───────────────────────────────────┐
      │        Skill Runtime Port         │
      │      (@opentalon/skill-engine)    │
      │  - Isolated VM/WASM Sandbox       │
      │  - Capability Matrix (net/fs/env) │
      │  - Versioned Skill Store          │
      │  - Autonomous Skill Synthesizer   │
      └───────────────────────────────────┘
```

---

## Monorepo Package Structure

The repository is managed using `pnpm` workspaces:

```
talon/
├── packages/
│   ├── core/           # Control Plane, Dual-Brain Router, LLM Drivers, Token Budget
│   ├── memory/         # libSQL SQLite Adapter, FTS5 BM25, Vector RRF
│   ├── skill-engine/   # Zero-Trust Sandbox, SKILL.md Parser, Autonomous Synthesizer
│   ├── gateway/        # LocalDaemon HTTP and ServerlessEdge Webhook Adapters
│   └── cli/            # Developer CLI binary (`talon`)
├── specs/              # Formal architecture and protocol specifications
├── examples/           # Pre-packaged procedural skills and fixtures
├── PRD.md              # Product Requirements Document
├── ERD.md              # Database Entity Relationship Diagram & DDL
└── DOCUMENTATION.md    # Full Developer Documentation
```

---

## Prerequisites & Installation

### Requirements
- **Node.js**: `>= 22.0.0`
- **pnpm**: `>= 9.0.0`

### Setup Steps
```bash
# Clone the repository
git clone https://github.com/opentalon/talon.git
cd talon

# Install dependencies across all workspace packages
pnpm install

# Build all packages in topological order
pnpm run build

# Run Vitest test suite across all packages
pnpm test
```

---

## CLI Developer Tooling (`talon`)

OpenTalon includes a unified CLI binary distributed via `@opentalon/cli`.

### Global CLI Linking (Optional)
```bash
cd packages/cli
pnpm link --global
```

### Command Reference

#### 1. `talon init`
Initializes a new OpenTalon workspace, creating `opentalon.config.json` and provisioning the local SQLite database schema (`opentalon.db`).

```bash
talon init
# Output:
# 🚀 Initializing OpenTalon workspace...
#   Created opentalon.config.json
#   Initialized local SQLite database: opentalon.db
# ✅ OpenTalon workspace is ready.
```

#### 2. `talon run [prompt]`
Executes a single conversational agent turn on the **Fast Path** with token budget enforcement ($< 1,500$ tokens). If called without a prompt, it automatically launches the interactive REPL chat session.

```bash
# Direct execution with metrics
talon run "convert 100 USD to EUR"

# Stream response tokens with typing pacing
talon run "explain quantum computing in 2 sentences" --stream

# Output clean machine-readable JSON (with sanitized embedding vectors)
talon run "what is 2+2" --json
```

Output details include:
- Assistant response output.
- Exact millisecond execution latency and elapsed time.
- Token breakdown (prompt, completion, total).
- Dynamically retrieved procedural skills matching the prompt.
- Sandboxed tool executions.

#### 3. `talon chat` (Interactive Multi-Turn REPL)
Launches an interactive multi-turn REPL chat session maintaining contextual conversation history across turns:

```bash
talon chat
```

Built-in slash commands during interactive chat:
- `/help`: Display available REPL slash commands.
- `/skills`: List all registered procedural skills.
- `/facts`: View persistent long-term semantic facts.
- `/stats`: Display live session token usage and latency.
- `/evolve`: Trigger an autonomous Slow Path evolution cycle.
- `/history`: Print conversation turn history for the active session.
- `/reset`: Clear current session conversation history.
- `/clear`: Clear terminal screen.
- `/quit` or `/exit`: Exit REPL session.

#### 4. `talon serve`
Spawns the local HTTP gateway daemon for local background execution or IDE integrations. Use `--auto-evolve` to enable autonomous Slow Path skill synthesis directly from background traces.

```bash
talon serve --port 3100 --host 127.0.0.1 --auto-evolve
```

Available daemon endpoints:
- `GET /health`: Healthcheck and uptime verification.
- `POST /v1/chat`: JSON endpoint for agent turns.
- `POST /v1/stream`: Real-time Server-Sent Events (SSE) token streaming.

#### 5. `talon evolve`
Executes an autonomous Hermes-style Slow Path evolution cycle. Scans episodic traces, extracts missing or failing capability opportunities, prompts System-2 LLM reflection, tests candidates in the sandbox, and commits verified skills to procedural memory.

```bash
# Run evolution cycle across the last 100 traces
talon evolve --limit 100

# Dry-run validation (verifies in sandbox without writing to DB)
talon evolve --limit 50 --dry-run

# Output machine-readable JSON for CI/CD telemetry
talon evolve --json
```

#### 6. `talon skills list`
Lists all procedural skills registered in the SQLite memory database, along with their semantic versions, capability boundaries, and content hashes.

```bash
talon skills list
```

#### 7. `talon skills add <filePath>`
Parses a `SKILL.md` file, verifies its capabilities, executes its test cases in the Zero-Trust Sandbox, and commits it into procedural memory.

```bash
talon skills add examples/skills/currency-converter.md
```

#### 8. `talon skills run <skillName> [argsJson]`
Executes a registered procedural skill directly in the Zero-Trust Sandbox without LLM overhead, showing execution time, logs, and return data. Supports single and double quotes or variadic argument strings.

```bash
talon skills run doku_payment_checkout '{"action":"generate_checkout","amount":150000}'
```

#### 9. `talon skills info <skillName>`
Inspects full metadata, capabilities whitelist, code implementation, test cases, and SHA-256 hash of a procedural skill.

```bash
talon skills info doku_payment_checkout
```

#### 10. `talon skills remove <skillName>`
Deletes a skill from both the procedural memory repository and the full-text search (FTS5) index.

```bash
talon skills remove doku_payment_checkout
```

#### 11. `talon skills history <skillName>`
Displays the immutable chronological revision history and audit log for a procedural skill, including versions, hashes, capabilities, and update timestamps.

```bash
talon skills history web_content_extractor
```

#### 12. `talon skills rollback <skillName> <target>`
Rolls back a procedural skill to a previous stable state using its version string, SHA-256 hash prefix, or revision ID.

```bash
talon skills rollback web_content_extractor 1.0.0
```

#### 13. `talon mcp serve`
Starts the OpenTalon Model Context Protocol server over Stdio, compliant with specification 2024-11-05 for instant plug-and-play connection with Claude Desktop, Cursor, and Antigravity.

```bash
talon mcp serve
```

#### 14. `talon mcp list`
Lists all procedural tools and resources currently exposed by the OpenTalon MCP server.

```bash
talon mcp list
```

#### 15. `talon mcp call <toolName> [argsJson]`
Directly invokes an MCP tool through OpenTalon's JSON-RPC 2.0 handler.

```bash
talon mcp call doku_payment_checkout '{"action":"generate_checkout","amount":250000}'
```

#### 16. `talon mcp import <endpointUrl>`
Discovers tools from an external HTTP MCP server and automatically compiles sandboxed procedural skills into local memory via `McpToolBridge`.

```bash
talon mcp import http://127.0.0.1:8000/rpc --prefix ext
```

#### 17. `talon swarm fanout <task>`
Runs a parallel multi-agent swarm delegation (System Architect, Security Sentinel, Fullstack Craftsman) with unified consensus synthesis.

```bash
talon swarm fanout "Design high-concurrency payment webhook processor"
```

#### 18. `talon swarm saga <task>`
Runs a sequential pipeline saga with dependent stages (Discovery &rarr; Contracts &rarr; Implementation).

```bash
talon swarm saga "Build automated refund reconciliation module"
```

#### 19. `talon swarm critic <task>`
Runs an adversarial Critic-Validator Loop with zero-tolerance quality gates and automated self-healing critique retries.

```bash
talon swarm critic "Implement cryptographic token signer" -r 3
```

#### 20. `talon memory list`
Lists all long-term semantic facts, user preferences, and domain knowledge entities stored in the SQLite database.

```bash
talon memory list --category user_preference
```

#### 21. `talon memory add <key> <value>`
Commits a new persistent semantic fact or user preference into libSQL memory.

```bash
talon memory add preferred_currency IDR --category user_preference
```

#### 22. `talon memory search <query>`
Searches stored facts and knowledge using FTS5 full-text keyword indexing.

```bash
talon memory search "currency"
```

#### 23. `talon memory remove <factId>`
Deletes a semantic fact from long-term memory.

```bash
talon memory remove fact_1719283921_a83f9
```

#### 24. `talon memory export [filePath]`
Exports the entire knowledge repository (procedural skills, semantic facts, and optional episodic traces) to a portable JSON snapshot.

```bash
talon memory export backup-snapshot.json --include-traces
```

#### 25. `talon memory import <filePath>`
Restores memory state, skills, and facts from a JSON snapshot into the active database.

```bash
talon memory import backup-snapshot.json --overwrite
```

#### 26. `talon cron list` (alias `talon schedule list`)
Lists all registered background automations, cron expressions, next execution time, and last run status.

```bash
talon cron list
```

#### 27. `talon cron add`
Registers a new autonomous background automation. Supports Fast Path prompt AI actions and Zero-Token direct skill actions.

```bash
# Register an hourly health check skill action (0 tokens)
talon cron add --name hourly-health --cron "@hourly" --skill http_json_fetcher --args '{"url":"https://api.github.com/zen"}'

# Register a daily operational digest prompt action
talon cron add --name daily-digest --cron "@daily" --prompt "Analyze traces and summarize daily health"

# Register an interval watcher every 30 minutes
talon cron add --name cache-watcher --cron "every 30m" --skill math_stats_calculator --args '{"numbers":[1,2,3,4]}'
```

#### 28. `talon cron trigger <idOrName>`
Triggers an automation immediately on-demand and prints real-time execution results, duration, and token telemetry.

```bash
talon cron trigger daily-digest
```

#### 29. `talon cron pause <idOrName>` & `talon cron resume <idOrName>`
Toggles an automation between paused and active states without deleting its configuration.

```bash
talon cron pause daily-digest
talon cron resume daily-digest
```

#### 30. `talon cron remove <idOrName>` (alias `delete`)
Permanently deletes a scheduled automation from the database.

```bash
talon cron remove hourly-health
```

#### 31. `talon cron logs [idOrName]`
Inspects historical execution logs, statuses, latency, token consumption, and outputs.

```bash
talon cron logs daily-digest --limit 20
```

---

## Dual-Brain Protocol (Fast Path vs Slow Path)

OpenTalon separates immediate response latency from background cognitive evolution:

### 1. Fast Path (Reactive Loop)
- **Token Ceiling**: Enforces $\le 1,500$ tokens per turn total context.
- **Top-K Skill Retrieval**: Retrieves maximum $K=3$ skills via hybrid search to prevent prompt bloat.
- **Prefix KV-Cache Locking**: System instructions and skill schemas are pinned deterministically at the head of the prompt payload.
- **Non-Blocking Telemetry**: Emits complete execution traces (`input`, `output`, `tokens`, `toolCalls`, `latencyMs`) to an async background channel and returns results to the user instantly.

### 2. Slow Path (Evolutionary Loop & Closed-Loop Heuristics)
- **Debounced Evolution Queue**: Buffers incoming traces in-memory (5,000ms debounce window or max 5 batch size) to avoid thundering herd and token cost spikes.
- **Trace Ingestion**: Evaluates outcome traces from the Fast Path (detecting errors, repetitive tool sequences, or queries lacking dedicated skills).
- **Circuit Breaker**: Automatically trips and skips opportunities exceeding 2 consecutive sandbox failures, preventing infinite recursion loops.
- **FinOps Throttle**: Enforces rate limiting (maximum 5 skill syntheses per hour) to preserve API cost ceilings.
- **Self-Healing Retry**: If initial sandbox verification encounters an error, the synthesizer automatically feeds the stack trace back into a corrective LLM prompt before failing.
- **Atomic Commit**: Validated skills are committed into procedural memory, incrementing semver and updating the FTS5/vector indices for instant Fast Path access.

---

## Zero-Trust Skill Sandbox

All dynamic and synthesized code runs in an isolated guest environment managed by `@opentalon/skill-engine`.

### Capability Matrix
A skill declares its external resource requirements in static frontmatter:

```typescript
export interface SkillCapabilities {
  net?: {
    allowedHosts: string[]; // Whitelisted domains (e.g., ["api.github.com"])
    allowHttp?: boolean;   // Enforces HTTPS by default
  };
  fs?: {
    readPaths: string[];   // Sandboxed directory read permissions
    writePaths: string[];  // Sandboxed directory write permissions
  };
  env?: string[];          // Allowed environment variable keys only
  skills?: {
    allowedSkills: string[]; // Whitelisted procedural skills (e.g. ["convert_currency"] or ["*"])
    maxChainDepth?: number;  // Max recursion depth (default: 3)
  };
}
```

### Skill Chaining & Procedural Mesh
Skills can call other procedural skills in memory via `callSkill()` or `skills.call()`:
```javascript
export default async function run(args) {
  // Directly invoke another sandboxed skill under Zero-Trust rules
  const rates = await callSkill('convert_currency', { amount: args.total });
  return { ...args, converted: rates.converted };
}
```

### Security Invariants
1. **Host Globals Stripped**: `process.exit`, `process.env`, `require('child_process')`, and un-sandboxed `fs` are completely inaccessible.
2. **Virtual Interceptors**: Virtualized `fetch` and filesystem abstractions validate target paths and domains against `SkillCapabilities` before executing.
3. **Chaining Isolation & Recursion Guard**: Skills can only call skills declared in `capabilities.skills.allowedSkills`. A hard `maxChainDepth` (default 3) prevents infinite recursive loops or circular call traps.
4. **Execution Guardrails**:
   - Default timeout: 5,000ms (prevents infinite loops or blocking code).
   - Memory limit: 16MB per execution isolate.
   - Deterministic JSON-serializable argument and return data boundaries.

---

## Memory Engine & Hybrid RRF Retrieval

OpenTalon utilizes `@opentalon/memory` backed by **libSQL**:
- **Local Embedded Mode**: `file:opentalon.db`.
- **Remote Cloud Mode**: Turso or Cloudflare D1 via HTTP (`libsql://...`).

### Reciprocal Rank Fusion (RRF)
Hybrid search balances keyword precision with semantic embeddings:

$$\text{RRF\_Score}(d) = \frac{1}{k + \text{rank}_{\text{fts}}(d)} + \frac{1}{k + \text{rank}_{\text{vec}}(d)}$$

Where default constant $k = 60$. If vector embeddings are unavailable or offline, the engine falls back to pure FTS5 BM25 keyword matching with zero disruption.

---

## LLM Driver Providers

`@opentalon/core` implements modular drivers adhering to the `ILLMPort` interface:

| Driver | Configuration / Features |
| :--- | :--- |
| **`CascadingLLMDriver`** | **Adaptive Model Cascading & Circuit Breaker**. Hierarchically falls back across multiple providers (Gemini -> Claude -> DeepSeek -> OpenAI -> Ollama -> Mock) if rate limits (HTTP 429), timeouts, or API outages occur. |
| **`GeminiDriver`** | **Gemini Agent Booster 2026 Edition**. Native Context Caching (`ContextCacheManager`, `cachedContent` with 75–90% cost savings), Google Search Grounding with dynamic source attribution (`groundingMetadata`), Dynamic System-2 Thinking Budget (`thinkingConfig.thinkingBudget` up to 64k), and automatic fallback from primary (`gemini-4-pro` / `gemini-3.5-flash-lite`) to ultra-fast tier (`gemini-3.8-flash`). |
| **`AnthropicDriver`** | Native support for Claude 3.7 Sonnet / Claude 3.5 Sonnet Messages API with hybrid thinking tokens and native tool use blocks. |
| **`DeepSeekDriver`** | High-performance inferencing for DeepSeek-V3 (`deepseek-chat`) and DeepSeek-R1 (`deepseek-reasoner` with `reasoning_content` extraction). |
| **`OllamaDriver`** | 100% offline local SLM execution (Qwen 2.5, Llama 3, Mistral) with local vector embeddings (`nomic-embed-text`) via HTTP. |
| **`OpenAIDriver`** | Supports GPT-4o, GPT-4o-mini, and compatible OpenAI-compliant endpoints. |
| **`MockLLMDriver`** | Zero-latency, deterministic driver for offline CI/CD, unit testing, and sandbox verification. |

### Environment Variables & Priority Tiers
```bash
# 1. Primary: Google Gemini
export GEMINI_API_KEY="your-gemini-key"
export GEMINI_MODEL="gemini-3.5-flash-lite"
export GEMINI_PRIORITY=0

# 2. Fallback Tier 1: Anthropic Claude
export ANTHROPIC_API_KEY="your-anthropic-key"
export ANTHROPIC_MODEL="claude-3-7-sonnet-20250219"
export ANTHROPIC_PRIORITY=1

# 3. Fallback Tier 2: DeepSeek
export DEEPSEEK_API_KEY="your-deepseek-key"
export DEEPSEEK_MODEL="deepseek-chat"
export DEEPSEEK_PRIORITY=2

# 4. Fallback Tier 3: OpenAI
export OPENAI_API_KEY="your-openai-key"
export OPENAI_MODEL="gpt-4o-mini"
export OPENAI_PRIORITY=3

# 5. Fallback Tier 4: Local Ollama (Offline)
export OLLAMA_ENABLED="true"
export OLLAMA_BASE_URL="http://127.0.0.1:11434"
export OLLAMA_MODEL="qwen2.5:7b"
export OLLAMA_PRIORITY=4
```

### Inspecting Provider Health
Check real-time health and circuit breaker cooldowns with:
```bash
talon providers
```

---

## Gemini Agent Booster Superpowers (2026 Edition)

OpenTalon natively integrates the `/gemini-agent-booster` optimization protocol for Google's frontier models:

### 1. Autonomous Context Caching (`ContextCacheManager`)
- **Threshold**: Prompts, repositories, or documentation larger than 32,768 tokens automatically create a `cachedContent` snapshot on Google AI.
- **Cost Reduction**: Reusable prefixes reduce input token pricing by 75–90% and accelerate TTFT by up to 10x.
- **Fingerprinting**: Deterministic SHA-256 content hashing guarantees instantaneous cache reuse across turns without stale state.

### 2. Native Google Search Grounding with Dynamic Citations
- **Zero Scraping Overhead**: Connects Gemini 4 directly to live web knowledge without needing external third-party scraper tools.
- **Verified Attribution**: Ingests `groundingMetadata` containing `webSearchQueries`, `sources` (with exact URLs and titles), and `groundingSupports` mapping statements to source indices.

### 3. Massively Parallel Tool Execution (Agentic MoE)
- **Concurrent Dispatch**: When Gemini emits multiple function calls in a single turn, `DualBrainRouter` runs all sandboxed skills concurrently via `Promise.allSettled`.
- **Latency Optimization**: Reduces execution time from $N \times T$ to $\max(T)$ before running a unified follow-up synthesis turn.

### 4. Adaptive Dynamic Thinking Budget (2k–64k)
- **Task-Entropy Escalation**: Adjusts System-2 test-time reasoning tokens dynamically:
  - Routine queries: `2,048` tokens
  - Standard development: `8,192` tokens
  - Autonomous evolution & skill reflection: `16,384` tokens
  - Self-healing retry after sandbox failure: `32,768` to `65,536` tokens

### 5. Asymmetric Tiered Swarm Architecture
- **Pareto-Optimal Allocation**: `SwarmDirector` pairs a flagship Director (`Gemini 4 Pro` with extended reasoning) with high-throughput subagent workers (`Gemini 3.8 Flash` with sub-80ms TTFT) to achieve high reasoning fidelity at low cost.


---

## Ingress Gateway Adapters

`@opentalon/gateway` exposes dual-mode ingress:

### 1. `LocalDaemonAdapter`
Starts an in-process Node.js HTTP server for local development, CLI interactions, and client UI integrations.

```typescript
import { LocalDaemonAdapter } from '@opentalon/gateway';

const daemon = new LocalDaemonAdapter(router, { port: 3100, host: '127.0.0.1' });
await daemon.start();
```

### 2. `ServerlessEdgeAdapter`
Stateless HTTP handler designed for Cloudflare Workers, Vercel Edge, and AWS Lambda with scale-to-zero economics and sub-50ms cold starts.

```typescript
import { ServerlessEdgeAdapter } from '@opentalon/gateway';

const edge = new ServerlessEdgeAdapter(router);
export default {
  fetch: (request) => edge.handleRequest(request),
};
```

### 3. Gateway REST & Streaming Endpoints

When running `talon serve` or `LocalDaemonAdapter`, the following endpoints are available:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Healthcheck and active daemon mode (`{"status":"ok","daemon":"local"}`) |
| `GET` | `/` or `/dashboard` | Interactive Dual-Brain Web Cockpit UI with live telemetry, traces, and sandbox tester |
| `POST` | `/v1/chat` | Standard single-turn agent execution endpoint |
| `POST` | `/v1/stream` | Server-Sent Events (SSE) streaming chat endpoint |
| `GET` | `/api/stats` | Telemetry counters: `skillsCount`, `tracesCount`, `avgLatencyMs` |
| `GET` | `/api/traces` | Retrieve recent episodic execution traces with latency and token telemetry |
| `GET` | `/api/skills` | List all registered procedural skills with metadata and capabilities |
| `POST` | `/api/skills/test` | Execute a skill directly in the Zero-Trust Sandbox (`{ name: string, args: Record<string, unknown> }`) |
| `POST` | `/api/webhooks/:name` | Inbound Webhook Ingress with optional HMAC SHA-256 signature validation (`X-Talon-Signature`) |
| `GET` | `/api/cron/jobs` | List all registered background automations, schedules, and statuses |
| `POST` | `/api/cron/jobs` | Register a new autonomous automation (`{ name, cron, actionType, actionPayload }`) |
| `POST` | `/api/cron/jobs/:id/trigger` | Manually fire an automation immediately |
| `POST` | `/api/cron/jobs/:id/toggle` | Pause or resume an automation (`{ active: boolean }`) |
| `DELETE` | `/api/cron/jobs/:id` | Permanently remove a background automation |
| `GET` | `/api/cron/logs` | Fetch audit logs of scheduled job executions (`?jobId=...&limit=50`) |
| `GET` | `/api/events` | Real-time SSE event bus streaming `trace`, `skill_registered`, `evolution_completed`, and `cron_notification` |

---

## Authoring Procedural Skills (`SKILL.md`)

Procedural skills are self-contained markdown documents containing metadata, semantic descriptions, capability boundaries, and executable logic.

### File Format Specification
```markdown
---
name: convert_currency
version: 1.0.0
description: "Converts USD amount to EUR and IDR using real-time fixed peg"
capabilities: {"net":{"allowedHosts":[],"allowHttp":false}}
---

# convert_currency
Converts currency amounts between USD, EUR, and IDR.

## Implementation

```javascript
export default async function run(args) {
  const amount = Number(args.amount) || 1;
  const rates = {
    EUR: 0.92,
    IDR: 15800,
  };
  return {
    source: "USD",
    amount,
    converted: {
      EUR: amount * rates.EUR,
      IDR: amount * rates.IDR,
    }
  };
}
```
```

### Production Skill Gallery (`examples/skills/`)

OpenTalon includes 6 verified production skills demonstrating different capability boundaries:

| Skill | Capabilities | Purpose |
| :--- | :--- | :--- |
| [`currency-converter.md`](file:///c:/talon/examples/skills/currency-converter.md) | None (Pure math) | Fixed peg currency conversion between USD, EUR, and IDR |
| [`http-json-fetcher.md`](file:///c:/talon/examples/skills/http-json-fetcher.md) | `net.allowedHosts`: allowlisted APIs | Safe external REST API querying with strict domain isolation |
| [`security-sanitizer.md`](file:///c:/talon/examples/skills/security-sanitizer.md) | None (String processing) | Real-time defense against XSS, SQLi, and path traversal |
| [`csv-data-pipeline.md`](file:///c:/talon/examples/skills/csv-data-pipeline.md) | `fs.readPaths`: `/data/cache` | VirtualFs-isolated CSV parsing and statistical column aggregation |
| [`crypto-signer.md`](file:///c:/talon/examples/skills/crypto-signer.md) | None (Crypto algorithm) | Deterministic FNV-1a and DJB2 hash checksums for webhook integrity |
| [`math-stats-calculator.md`](file:///c:/talon/examples/skills/math-stats-calculator.md) | None (Statistics) | Distribution analysis: mean, median, standard deviation, and p95 |

---

## Multi-Agent Swarm Topologies (`SwarmDirector`)

OpenTalon includes native support for 3 coordinated multi-agent execution topologies:

```
1. FAN-OUT / FAN-IN (Parallel Research & Assembly)
   Director ──┬──► Subagent A (Domain 1)   ──┐
              ├──► Subagent B (Domain 2)   ──┼──► Master Synthesis Turn
              └──► Subagent C (Domain 3)   ──┘

2. PIPELINE SAGA (Sequential Dependent Execution)
   Discovery (S1) ──► Architecture (S2) ──► Implementation (S3) ──► QA Validation (S4)

3. CRITIC-VALIDATOR LOOP (Zero-Tolerance Self-Healing)
   Implementer Agent ──► Artifact / Code ──► Auditor Critic ──► [Self-Heal / Approve]
```

Run swarms via CLI:
```bash
# Fan-Out / Fan-In
pnpm talon swarm fanout "Audit security, benchmark performance, and synthesize migration plan"

# Pipeline Saga
pnpm talon swarm saga "Fetch market data -> Compute risk metrics -> Sign cryptographic payload"

# Critic-Validator Loop
pnpm talon swarm critic "Generate an ultra-fast in-memory cache algorithm with zero memory leaks"
```

---

## Model Context Protocol (MCP v1.x)

OpenTalon natively implements both sides of the Model Context Protocol:
- **MCP Server**: Exposes all registered procedural skills as standard MCP tools over `stdio` using JSON-RPC 2.0.
  ```bash
  pnpm talon mcp
  ```
  Compatible out-of-the-box with **Claude Desktop**, **Cursor IDE**, and any MCP v1.x client.
- **MCP Client Adapter**: In-process or HTTP adapter allowing OpenTalon to consume external MCP servers as capability-bounded tools.

---

## Agent-to-Agent (A2A) Protocol & P2P Mesh Federation

Starting in **v0.6.0**, OpenTalon includes a decentralized, serverless-friendly **Agent-to-Agent (A2A) Peer-to-Peer Mesh Federation** protocol. Multiple OpenTalon daemons running across different physical machines, edge containers, or developer laptops can securely discover capabilities, negotiate task execution, and dispatch subagent workflows with zero centralization.

### 1. Asymmetric Ed25519 Cryptographic Identity
Every node generates a persistent RFC 8032 Ed25519 asymmetric keypair on its first boot and saves it in the local SQLite `agent_identity` table:
- **`urn`**: Globally unique Uniform Resource Name formatted as `urn:talon:agent:<uuid4>`.
- **`publicKey`**: Standard PEM and DER single-line Base64 format for HTTP headers.
- **`privateKey`**: Secure PKCS#8 PEM stored exclusively on the host device.

### 2. Standard Agent Card (`/.well-known/agent.json`)
Conforming to modern multi-agent discovery patterns, every daemon automatically exposes its Agent Card:
```json
{
  "urn": "urn:talon:agent:3463fe8f-618c-49cd-a9b3-20f20fc43490",
  "name": "OpenTalon Node",
  "version": "0.6.0",
  "publicKey": "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAODUzKu25KxIvx/2Lfh7SkmCJRQmIQ8XElpV+O/icPYo=\n-----END PUBLIC KEY-----\n",
  "endpoints": {
    "base": "http://127.0.0.1:3100",
    "agentCard": "http://127.0.0.1:3100/.well-known/agent.json",
    "negotiate": "http://127.0.0.1:3100/api/a2a/negotiate",
    "dispatch": "http://127.0.0.1:3100/api/a2a/dispatch"
  },
  "skills": [...],
  "activeModel": "CascadingLLMDriver",
  "status": "online",
  "uptimeSeconds": 3600
}
```

### 3. Cryptographic Signed Handshake & Replay Shield
All inter-daemon requests require five tamper-evident HTTP headers signed via `AgentIdentityManager`:
```http
X-Talon-Agent-Id: urn:talon:agent:caller-uuid
X-Talon-Public-Key: MCowBQYDK2VwAyEAODUzKu25KxIvx/2Lfh7SkmCJRQmIQ8XElpV+O/icPYo=
X-Talon-Signature: <base64-encoded-signature>
X-Talon-Timestamp: 1792779708000
X-Talon-Nonce: <random-uuid4>
```
- **Payload Canonicalization**: Canonical recursive key-sorted JSON serialization (`canonicalJsonStringify`).
- **Clock Skew Tolerance**: Strictly rejects messages with timestamps deviating by more than $\pm60$ seconds.
- **Replay Protection**: High-speed in-memory LRU Nonce deduplication cache rejects duplicated nonces.

### 4. Zero-Token Capability Negotiation (`POST /api/a2a/negotiate`)
Before burning LLM tokens or transferring sensitive execution contexts, the caller initiates a 0-token negotiation handshake:
```json
{
  "callerUrn": "urn:talon:agent:node-a",
  "taskDescription": "Extract financial tables and convert currency",
  "requiredCapabilities": ["convert_currency"],
  "maxTokensBudget": 1500
}
```
The receiver matches capabilities against its registered `SKILL.md` library and immediately returns `canExecute: true | false`, estimated latency, and token cost without invoking any frontier LLM.

### 5. Remote Subagent Dispatch & Deadlock Prevention (`POST /api/a2a/dispatch`)
When a node delegates a subagent task via `SwarmDirector` with `targetPeerUrl`:
- The request passes `delegationDepth: number`.
- Every hop increments `delegationDepth`. If `delegationDepth > 3`, the receiving node rejects the request with HTTP 400 to prevent infinite ping-pong loops or circular deadlock between peer daemons.
- The task runs in the remote node's capability-gated sandbox with the specified `skillsFilter`.
- Full cryptographic audit trails are persisted in SQLite `a2a_audit_logs`.

### 6. CLI Command Reference
```bash
# Display local node identity, URN, and active capability manifest
pnpm talon a2a identity

# List all federated peers in the local SQLite mesh registry
pnpm talon a2a peers

# Register and auto-discover a remote peer via its Agent Card
pnpm talon a2a register http://192.168.1.50:3100

# Ping a peer to measure round-trip latency and verify online status
pnpm talon a2a ping peer-test-1

# Securely dispatch a remote task with cryptographic signature
pnpm talon a2a dispatch peer-test-1 "Parse invoices and compute aggregates"
```

---

## Verification & Testing

OpenTalon maintains 100% test passing across all workspace packages using **Vitest**:

```bash
pnpm test
```

### Test Coverage Highlights (139 Tests Across 21 Suites)
- **`@opentalon/memory`**: Verified FTS5 full-text indexing, vector cosine distance, RRF score ordering, episodic traces, semantic facts, and **A2A SQLite storage (`agent_identity`, `federated_peers`, `a2a_audit_logs`)** (13 tests).
- **`@opentalon/core`**: Verified Fast Path token budget truncation (<1,500 tokens), hybrid retrieval, LLM tool-calling loops, mock driver fallback, Hermes Evolution reflection, speculative multi-draft tournament benchmarking, MCP JSON-RPC 2.0 protocols, Cron scheduler, Gemini Agent Booster dynamic thinking entropy scorer, canonical KV-cache prefix locking, Swarm multi-agent orchestration, and **A2A Ed25519 cryptographic signing, nonce deduplication, and SwarmDirector remote federation** (80 tests across 11 files).
- **`@opentalon/skill-engine`**: Verified `SKILL.md` parsing, zero-trust sandbox execution, capability violation rejection, VirtualFs directory traversal protection, SHA-256 versioning and rollback, remote skill installer, skill chaining, and full verification across **11 production skills** in the gallery (40 tests across 6 files).
- **`@opentalon/gateway`**: Verified local daemon HTTP routing (`/health`, `/v1/chat`, `/v1/stream`, `/api/stats`, `/api/traces`, `/api/skills`, `/api/skills/test`), serverless edge adapter, SSE token streaming, 9-Tab Web Cockpit Dashboard, and **A2A protocol gateway endpoints (`/.well-known/agent.json`, `/api/a2a/negotiate`, `/api/a2a/dispatch`, `/api/a2a/peers`, `/api/a2a/ping`, `/api/a2a/logs`)** (25 tests across 3 files).
