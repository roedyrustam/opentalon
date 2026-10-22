# SPEC-01: OpenTalon Core Architecture Specification

## 1. Scope & Objectives
This specification defines the foundational architecture of **OpenTalon** (`@opentalon/core` monorepo).
OpenTalon is a high-performance, modular AI agent framework that unifies:
1. **Hermes Agent** paradigm: Self-evolving procedural memory, dynamic skill extraction, and continuous reflection.
2. **OpenClaw** paradigm: Extreme token frugality (< 1,500 tokens/turn fast path), low-latency in-process gateway routing.
3. **Zero-Trust Capability Sandboxing**: Deterministic, permission-gated execution of synthesized skills to eradicate untrusted shell/plugin execution vulnerabilities.

---

## 2. Hexagonal Architectural Boundary

OpenTalon strictly adheres to Ports and Adapters (Hexagonal Architecture):

```
                   ┌──────────────────────────────────────────────┐
                   │             Inbound Gateway Adapters          │
                   │  - Local CLI Daemon (Stdio / WebSocket)      │
                   │  - Serverless Edge HTTP (Cloudflare/Lambda)  │
                   └──────────────────────┬───────────────────────┘
                                          │
                                   Inbound Ports
                                          │
                                          ▼
                   ┌──────────────────────────────────────────────┐
                   │             OpenTalon Control Plane          │
                   │               (@opentalon/core)              │
                   │  - Dual-Brain Router (Fast vs Slow Path)     │
                   │  - Token Budget Manager (<1,500 tokens)      │
                   │  - Context Compressor & KV Cache Pinning     │
                   └───────┬──────────────────────────────┬───────┘
                           │                              │
                    Outbound Ports                 Outbound Ports
                           │                              │
                           ▼                              ▼
     ┌───────────────────────────────────┐  ┌───────────────────────────────────┐
     │        Memory & Storage Port      │  │             LLM Port              │
     │        (@opentalon/memory)        │  │  - Gemini Driver (Thinking/Cache) │
     │  - libSQL Client (Local & HTTP)   │  │  - OpenAI / Ollama Driver         │
     │  - FTS5 BM25 Engine               │  │  - Anthropic Driver               │
     │  - Vector Embedding Index         │  └───────────────────────────────────┘
     │  - Reciprocal Rank Fusion (RRF)   │
     └───────────────────────────────────┘
                           │
                           ▼
     ┌───────────────────────────────────┐
     │        Skill Runtime Port         │
     │      (@opentalon/skill-engine)    │
     │  - QuickJS WASM Sandbox           │
     │  - Capability Matrix (net/fs/env) │
     │  - Versioned Skill Store          │
     │  - Autonomous Synthesizer         │
     └───────────────────────────────────┘
```

---

## 3. Package Invariants & Contracts

### 3.1 `@opentalon/core`
- **Zero-Latency In-Process Execution**: Packages communicate via direct in-process TypeScript interfaces. No IPC or HTTP serialization overhead when running in local/embedded mode.
- **Pure Core Isolation**: `@opentalon/core` defines ports (`LLMPort`, `MemoryPort`, `SkillEnginePort`, `GatewayPort`) and does NOT depend on heavy runtime frameworks.
- **Universal ESM**: Strict ES Module compliance, compatible with Node.js 22+ and V8 Edge isolates (Cloudflare Workers, Deno, Bun).

### 3.2 `@opentalon/memory`
- **Storage Dual-Mode**:
  - `file:opentalon.db`: Local SQLite embedded file via `@libsql/client`.
  - `libsql://<host>` / `https://<host>`: Remote Turso/Cloudflare D1 HTTP endpoint.
- **Hybrid Retrieval Algorithm**: Reciprocal Rank Fusion (RRF) combining normalized FTS5 BM25 ranks with vector cosine distance ranks:
  $$\text{RRF\_Score}(d) = \frac{1}{k + \text{rank}_{\text{fts}}(d)} + \frac{1}{k + \text{rank}_{\text{vec}}(d)}$$
  where default $k = 60$.

### 3.3 `@opentalon/skill-engine`
- **Deterministic Sandboxing**: Executes code in an isolated QuickJS WebAssembly runtime with CPU cycle limits and memory caps (default 16MB per execution).
- **Capability Grants**: Skills receive an explicit, immutable permissions object `{ net: string[]; fs: string[]; env: string[] }`. Attempts to access unauthorized resources throw an explicit `CapabilityViolationError`.
- **Procedural Versioning**: Every synthesized skill is versioned with SHA-256 content hashes. Rollback is triggered automatically if validation checks or regression assertions fail.

---

## 4. Concurrency & Fallback Rules
- If vector embeddings fail or provider is unavailable, memory retrieval falls back gracefully to pure FTS5 keyword BM25 ranking.
- If high-tier LLMs encounter quota/rate limits, the LLM Port seamlessly cascades from Gemini 4 Pro to Gemini 3.8 Flash without breaking the conversation state.
