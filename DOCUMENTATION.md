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
11. [Verification & Testing](#verification--testing)

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

#### 2. `talon run <prompt>`
Executes a single conversational agent turn on the **Fast Path** with token budget enforcement ($< 1,500$ tokens).

```bash
talon run "convert 100 USD to EUR"
```

Output details include:
- Assistant response output.
- Exact millisecond execution latency and elapsed time.
- Token breakdown (prompt, completion, total).
- Dynamically retrieved procedural skills matching the prompt.
- Sandboxed tool executions.

#### 3. `talon serve`
Spawns the local HTTP gateway daemon for local background execution or IDE integrations. Use `--auto-evolve` to enable autonomous Slow Path skill synthesis directly from background traces.

```bash
talon serve --port 3100 --host 127.0.0.1 --auto-evolve
```

Available daemon endpoints:
- `GET /health`: Healthcheck and uptime verification.
- `POST /v1/chat`: JSON endpoint for agent turns.
- `POST /v1/stream`: Real-time Server-Sent Events (SSE) token streaming.

#### 4. `talon evolve`
Executes an autonomous Hermes-style Slow Path evolution cycle. Scans episodic traces, extracts missing or failing capability opportunities, prompts System-2 LLM reflection, tests candidates in the sandbox, and commits verified skills to procedural memory.

```bash
# Run evolution cycle across the last 100 traces
talon evolve --limit 100

# Dry-run validation (verifies in sandbox without writing to DB)
talon evolve --limit 50 --dry-run

# Output machine-readable JSON for CI/CD telemetry
talon evolve --json
```

#### 5. `talon skills list`
Lists all procedural skills registered in the SQLite memory database, along with their semantic versions, capability boundaries, and content hashes.

```bash
talon skills list
```

#### 6. `talon skills add <filePath>`
Parses a `SKILL.md` file, verifies its capabilities, executes its test cases in the Zero-Trust Sandbox, and commits it into procedural memory.

```bash
talon skills add examples/skills/currency-converter.md
```

#### 7. `talon skills run <skillName> [argsJson]`
Executes a registered procedural skill directly in the Zero-Trust Sandbox without LLM overhead, showing execution time, logs, and return data.

```bash
talon skills run doku_payment_checkout '{"action":"generate_checkout","amount":150000}'
```

#### 8. `talon skills info <skillName>`
Inspects full metadata, capabilities whitelist, code implementation, test cases, and SHA-256 hash of a procedural skill.

```bash
talon skills info doku_payment_checkout
```

#### 9. `talon skills remove <skillName>`
Deletes a skill from both the procedural memory repository and the full-text search (FTS5) index.

```bash
talon skills remove doku_payment_checkout
```

#### 10. `talon mcp serve`
Starts the OpenTalon Model Context Protocol server over Stdio, compliant with specification 2024-11-05 for instant plug-and-play connection with Claude Desktop, Cursor, and Antigravity.

```bash
talon mcp serve
```

#### 11. `talon mcp list`
Lists all procedural tools and resources currently exposed by the OpenTalon MCP server.

```bash
talon mcp list
```

#### 12. `talon mcp call <toolName> [argsJson]`
Directly invokes an MCP tool through OpenTalon's JSON-RPC 2.0 handler.

```bash
talon mcp call doku_payment_checkout '{"action":"generate_checkout","amount":250000}'
```

#### 13. `talon mcp import <endpointUrl>`
Discovers tools from an external HTTP MCP server and automatically compiles sandboxed procedural skills into local memory via `McpToolBridge`.

```bash
talon mcp import http://127.0.0.1:8000/rpc --prefix ext
```

#### 14. `talon swarm fanout <task>`
Runs a parallel multi-agent swarm delegation (System Architect, Security Sentinel, Fullstack Craftsman) with unified consensus synthesis.

```bash
talon swarm fanout "Design high-concurrency payment webhook processor"
```

#### 15. `talon swarm saga <task>`
Runs a sequential pipeline saga with dependent stages (Discovery &rarr; Contracts &rarr; Implementation).

```bash
talon swarm saga "Build automated refund reconciliation module"
```

#### 16. `talon swarm critic <task>`
Runs an adversarial Critic-Validator Loop with zero-tolerance quality gates and automated self-healing critique retries.

```bash
talon swarm critic "Implement cryptographic token signer" -r 3
```

#### 17. `talon memory list`
Lists all long-term semantic facts, user preferences, and domain knowledge entities stored in the SQLite database.

```bash
talon memory list --category user_preference
```

#### 18. `talon memory add <key> <value>`
Commits a new persistent semantic fact or user preference into libSQL memory.

```bash
talon memory add preferred_currency IDR --category user_preference
```

#### 19. `talon memory search <query>`
Searches stored facts and knowledge using FTS5 full-text keyword indexing.

```bash
talon memory search "currency"
```

#### 20. `talon memory remove <factId>`
Deletes a semantic fact from long-term memory.

```bash
talon memory remove fact_1719283921_a83f9
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
}
```

### Security Invariants
1. **Host Globals Stripped**: `process.exit`, `process.env`, `require('child_process')`, and un-sandboxed `fs` are completely inaccessible.
2. **Virtual Interceptors**: Virtualized `fetch` and filesystem abstractions validate target paths and domains against `SkillCapabilities` before executing.
3. **Execution Guardrails**:
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

`@opentalon/core` implements modular drivers adhering to the `ILLMDriver` interface:

| Driver | Configuration / Features |
| :--- | :--- |
| **`GeminiDriver`** | Dynamic Thinking Budget (`thinkingBudget`), KV-Cache Prefix Pinning, automatic fallback from primary (`gemini-2.5-pro`) to fast tier (`gemini-2.5-flash`). |
| **`OpenAIDriver`** | Supports GPT-4o, GPT-4o-mini, and compatible OpenAI-compliant endpoints (Ollama, vLLM). |
| **`MockLLMDriver`** | Zero-latency, deterministic driver for offline CI/CD, unit testing, and sandbox verification. |

### Environment Variables
```bash
# For Gemini Driver
export GEMINI_API_KEY="your-google-api-key"
export TALON_MODEL="gemini-2.5-pro"

# For OpenAI Driver
export OPENAI_API_KEY="your-openai-api-key"
export TALON_MODEL="gpt-4o-mini"
```

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

### 3. Gateway REST & JSON-RPC Endpoints

When running `talon serve` or `LocalDaemonAdapter`, the following endpoints are available:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Healthcheck and active daemon mode (`{"status":"ok","daemon":"local"}`) |
| `GET` | `/dashboard` | Interactive Dual-Brain Web Cockpit UI with live 3D telemetry core |
| `POST` | `/v1/chat` | Standard single-turn agent execution endpoint |
| `POST` | `/v1/stream` | Server-Sent Events (SSE) streaming chat endpoint |
| `GET` | `/api/stats` | Telemetry counters: skillsCount, tracesCount, factsCount, avgLatencyMs |
| `GET` | `/api/skills` | List all registered procedural skills |
| `POST` | `/api/skills/test` | Execute a skill directly in the Zero-Trust Sandbox (`{ name, args }`) |
| `GET` | `/api/traces` | Retrieve the last 50 episodic execution traces |
| `GET` | `/api/facts` | List semantic facts, optional filter `?category=<cat>` |
| `POST` | `/api/facts` | Store a new semantic fact (`{ category, key, value, confidence }`) |
| `DELETE` | `/api/facts?id=<id>` | Delete a semantic fact from memory |
| `GET` | `/api/facts/search?q=<query>` | Full-text FTS5 keyword search across semantic memory |
| `GET` | `/api/mcp/tools` | List MCP tools exposed by the gateway |
| `POST` | `/api/mcp/rpc` | Model Context Protocol JSON-RPC 2.0 dispatch endpoint |
| `POST` | `/api/mcp/import` | Auto-discover & synthesize skills from external HTTP MCP server |
| `POST` | `/api/swarm/execute` | Dispatch Swarm topologies (`fan_out_fan_in`, `pipeline_saga`, `critic_validator_loop`) |

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

---

## Verification & Testing

OpenTalon includes a comprehensive test suite across all monorepo modules using **Vitest**:

```bash
pnpm test
```

### Test Coverage Highlights (64 Tests Across 11 Suites)
- **`@opentalon/memory`**: Verified FTS5 full-text indexing, vector cosine distance, RRF score ordering, trace persistence, and semantic facts knowledge store (save, list, search, delete).
- **`@opentalon/core`**: Verified Fast Path token budget truncation (<1,500 tokens), semantic facts auto-retrieval and system prefix injection, adaptive tool error self-correction, LLM tool-calling loops, mock driver fallback, Circuit Breaker self-healing, FinOps hourly throttle, and Swarm multi-agent orchestration (Fan-Out/Fan-In, Pipeline Saga, Critic-Validator Loop).
- **`@opentalon/skill-engine`**: Verified `SKILL.md` parsing, zero-trust sandbox execution, capability violation rejection, timeout interception, semantic versioning, and full verification across **10 production skills** in the gallery.
- **`@opentalon/gateway`**: Verified local daemon HTTP routing (`/health`, `/v1/chat`, `/v1/stream`), error handling, serverless edge payloads, Web Cockpit Dashboard, Swarm dispatcher, facts API, and MCP JSON-RPC 2.0 endpoints.
- **MCP Protocol & Bridge**: Verified Model Context Protocol handshake, tools/list, tools/call sandboxing, resources/list traces, and `McpToolBridge` automatic remote tool import.
