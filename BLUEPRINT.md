# Blueprint: OpenTalon v0.6.0 — A2A Protocol & Peer-to-Peer Mesh Federation
**OpenTalon Platform Evolution — A2A (Agent-to-Agent) & Multi-Daemon Federation Architecture**

---

## 1. Executive Summary & Goals
OpenTalon v0.6.0 expands the control plane (`@opentalon/core`), storage layer (`@opentalon/memory`), ingress gateway (`@opentalon/gateway`), and CLI (`@opentalon/cli`) with native **Agent-to-Agent (A2A) Protocol & P2P Mesh Federation**:
1. **Agent Card Specification (`/.well-known/agent.json`)**: Deterministic metadata endpoint declaring agent identity, version, Ed25519 public key, capability skill manifest, active LLM driver, and operational endpoints.
2. **Cryptographic Identity & Zero-Trust Handshake (`AgentIdentityManager`)**: SQLite-persisted Ed25519 keypair generating and verifying asymmetric signatures (`X-Talon-Agent-Id`, `X-Talon-Timestamp`, `X-Talon-Nonce`, `X-Talon-Signature`) with replay attack prevention and clock-skew tolerance (±60s).
3. **P2P Mesh Peer Registry (`PeerRegistry`)**: Discovers, registers, and monitors peer node health, latency, and skill capabilities via `GET /api/a2a/peers` and `POST /api/a2a/peers/register`.
4. **Task Negotiation & Dispatch Engine (`A2AProtocolEngine`)**: Two-stage task lifecycle (`negotiate` -> `dispatch`) with capability matching (0 LLM tokens for negotiation) and circular delegation loop prevention (`delegationDepth <= 3`).
5. **SwarmDirector Remote Federation**: Enables `SwarmDirector` to dispatch sub-tasks across remote federated daemon nodes in *Fan-Out/Fan-In*, *Pipeline Saga*, or *Critic-Validator* topologies.
6. **Web Cockpit & CLI Telemetry**: Visualizes active federated mesh peers, latency metrics, delegation logs, and provides developer commands (`talon a2a peers`, `talon a2a ping`, `talon a2a dispatch`).

---

## 2. Architectural Decision Records (MADR Standard)

| # | Decision Title | Status | Context & Problem | Chosen Solution & Rationale | Consequences & Trade-offs | Orchestrated Skill |
|---|----------------|--------|-------------------|-----------------------------|---------------------------|-------------------|
| 1 | P2P REST Mesh vs WebSocket Pool | Accepted | Persistent WebSockets consume constant memory, connection file descriptors, and struggle on edge/serverless runtimes. | Use HTTP/1.1 REST with Ed25519 signed headers for stateless, scale-to-zero communication between daemons. | 0 idle socket overhead, universally compatible with Docker, Cloudflare Workers, and local CLI daemons. | `api-design-expert`, `a2a-agent-protocol-expert` |
| 2 | SQLite-Persisted Ed25519 Identity | Accepted | Storing private keys in plaintext files or env-only risks leakage or complex bootstrapping for local daemons. | Auto-generate an Ed25519 keypair on first initialization and persist securely in SQLite `agent_identity` table, with optional override via env. | Zero setup friction for developers, deterministic identity across restarts, and zero external crypto library bloat (`node:crypto`). | `zero-trust-secret-vault`, `authentication-identity-expert` |
| 3 | Two-Stage Negotiation (0-Token Gate) | Accepted | Sending full LLM prompts directly to remote agents risks token waste if the remote agent lacks required sandboxed skills. | First execute a light `POST /api/a2a/negotiate` verifying skill manifest match in-memory before issuing `POST /api/a2a/dispatch`. | 0 LLM token cost on rejected or incompatible tasks, preserving local and remote token budgets. | `llm-finops-router`, `structured-output-contracts` |
| 4 | Nonce Caching & Delegation Depth Guard | Accepted | Distributed federations risk replay attacks and circular delegation deadlocks (Node A -> Node B -> Node A). | Enforce `X-Talon-Nonce` deduplication cache in memory + incrementing `delegationDepth` capped at max 3. | Hard-stops infinite loops and eliminates malicious payload replay. | `autonomous-red-teamer`, `error-resilience-expert` |

---

## 3. Database Schema Extensions (`@opentalon/memory`)

```sql
-- 1. Singleton Agent Identity
CREATE TABLE IF NOT EXISTS agent_identity (
  id TEXT PRIMARY KEY,               -- e.g. 'urn:talon:agent:<uuid>'
  name TEXT NOT NULL,
  public_key TEXT NOT NULL,          -- SPKI Base64 / PEM
  private_key TEXT NOT NULL,         -- PKCS8 Base64 / PEM
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 2. Federated Peer Mesh Registry
CREATE TABLE IF NOT EXISTS federated_peers (
  peer_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  endpoint_url TEXT NOT NULL UNIQUE, -- e.g. 'http://127.0.0.1:3200'
  public_key TEXT NOT NULL,
  capabilities TEXT NOT NULL,        -- JSON array of skill names/capabilities
  status TEXT NOT NULL,              -- 'online' | 'offline' | 'unreachable'
  latency_ms REAL,
  last_seen_at INTEGER NOT NULL
);

-- 3. A2A Transaction & Delegation Audit Log
CREATE TABLE IF NOT EXISTS a2a_audit_logs (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  peer_id TEXT NOT NULL,
  direction TEXT NOT NULL,           -- 'inbound' | 'outbound'
  action TEXT NOT NULL,              -- 'negotiate' | 'dispatch'
  status TEXT NOT NULL,              -- 'accepted' | 'rejected' | 'completed' | 'failed'
  payload TEXT NOT NULL,             -- JSON stringified
  result TEXT,                       -- JSON stringified or text output
  duration_ms REAL,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_a2a_logs_peer ON a2a_audit_logs(peer_id);
CREATE INDEX IF NOT EXISTS idx_a2a_logs_timestamp ON a2a_audit_logs(timestamp DESC);
```

---

## 4. Subagent Contract Map Slice (`CONTEXT_MAP.md`)

```typescript
export interface AgentCard {
  urn: string;                      // e.g. "urn:talon:agent:a1b2c3d4"
  name: string;                     // e.g. "OpenTalon Node Alpha"
  version: string;                  // e.g. "0.6.0"
  publicKey: string;                // Ed25519 SPKI Base64
  endpoints: {
    base: string;                   // e.g. "http://127.0.0.1:3100"
    negotiate: string;              // "/api/a2a/negotiate"
    dispatch: string;               // "/api/a2a/dispatch"
  };
  skills: Array<{
    name: string;
    description: string;
    version: string;
    capabilities: Record<string, unknown>;
  }>;
  activeModel: string;
}

export interface A2ANegotiateRequest {
  taskId: string;
  requiredSkills: string[];
  taskDescription: string;
  delegationDepth: number;
}

export interface A2ANegotiateResponse {
  canHandle: boolean;
  reason?: string;
  estimatedLatencyMs?: number;
  availableSkills: string[];
}

export interface A2ADispatchRequest {
  taskId: string;
  task: string;
  contextSlice?: Record<string, unknown>;
  skillsFilter?: string[];
  delegationDepth: number;
  thinkingBudget?: number;
}

export interface A2ADispatchResponse {
  taskId: string;
  success: boolean;
  output: string;
  tokensUsed: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  durationMs: number;
  error?: string;
}
```

---

## 5. 8-Phase Implementation Roadmap (`zero-to-prod-orchestrator`)

- **Phase 1: Memory Layer & Identity Storage (`@opentalon/memory`)**
  - Implement `AgentIdentity` entity and `FederatedPeer` schema in `libsql-adapter.ts`.
  - Add unit tests verifying keypair persistence and retrieval.
- **Phase 2: Cryptographic Identity Manager (`@opentalon/core`)**
  - Implement `AgentIdentityManager` utilizing `node:crypto` (`generateKeyPairSync('ed25519')`).
  - Implement deterministic canonical payload signing & verification (`signPayload`, `verifySignature`).
- **Phase 3: Agent Card & Gateway Handlers (`@opentalon/gateway`)**
  - Implement `GET /.well-known/agent.json`.
  - Implement `GET /api/a2a/peers` and `POST /api/a2a/peers/register`.
  - Implement signed verification middleware for inbound requests.
- **Phase 4: A2A Negotiation & Dispatch Protocol (`@opentalon/core` + `@opentalon/gateway`)**
  - Implement `POST /api/a2a/negotiate` and `POST /api/a2a/dispatch`.
  - Wire into `DualBrainRouter.executeFastPath()`.
- **Phase 5: SwarmDirector Remote Delegation (`@opentalon/core`)**
  - Wire `targetPeerId` into `SwarmDirector` topologies for remote fan-out execution.
- **Phase 6: CLI Command Suite (`@opentalon/cli`)**
  - Add `talon a2a peers`, `talon a2a ping`, `talon a2a register`, and `talon a2a dispatch`.
- **Phase 7: Web Cockpit A2A Mesh Panel (`@opentalon/gateway`)**
  - Add Federated Mesh tab to Web Cockpit with live node status pills and latency charts.
- **Phase 8: Comprehensive Verification & Hardening**
  - Vitest test suites verifying full P2P handshake, signed payload verification, and remote execution.
