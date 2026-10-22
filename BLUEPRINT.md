# Blueprint: Autonomous Proactive Background Daemon & Agent Cron System
**OpenTalon Platform Evolution — v0.2.0 Architecture**

---

## 1. Executive Summary & Goals
OpenTalon v0.2.0 evolves from a purely reactive request-response agent into a **fully sovereign, autonomous proactive agent daemon**. 
Equipped with an integrated in-process heartbeat scheduler, webhook ingress listener, zero-token direct skill trigger, and real-time SSE proactive alert bus, OpenTalon can watch systems, run periodic maintenance, and alert developers without requiring manual user initiation.

---

## 2. Architectural Pillars & Skill Delegation Matrix

| Domain Module | Orchestrated Skills | Key Responsibilities |
| :--- | :--- | :--- |
| **Scheduler Engine** | `cron-scheduler-expert`, `proactive-background-watcher` | Deterministic 1s tick evaluation, standard 5-part cron parsing, natural intervals (`@hourly`, `every 15m`), single-flight execution mutex, catch-up coalescing on system wake. |
| **Persistence & Audit** | `database-orm-expert` | LibSql tables `scheduled_jobs` and `job_execution_logs`, ACID transactions, FTS search for execution logs. |
| **Execution Paths** | `@opentalon/skill-engine`, `@opentalon/core` | Dual execution routing: Fast Path `<1,500` token prompt execution vs. Zero-Trust direct procedural skill execution (0 tokens). |
| **Ingress & Security** | `api-design-expert`, `autonomous-red-teamer` | Inbound webhook router `POST /api/webhooks/:name`, HMAC SHA-256 signature verification, anti-DoS sliding window rate limiting. |
| **Telemetry & UI** | `sse-websocket-streaming-expert`, `senior-frontend` | SSE bus proactive alert dispatching (`/api/events`), real-time Web Cockpit Automations tab with job toggle and live logs. |
| **CLI Ergonomics** | `fullstack-expert` | `talon cron` command suite with list, add, trigger, toggle, and log viewing capabilities. |
| **Testing & Quality** | `autonomous-tdd-debugger`, `anti-slop` | 100% test pass guarantee across all scheduler, database, gateway, and CLI unit test suites. |

---

## 3. Database Schema DDL (LibSql SQLite)

```sql
-- Scheduled Automations Table
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  cron TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK(action_type IN ('prompt', 'skill')),
  action_payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'running')),
  next_run_at INTEGER,
  last_run_at INTEGER,
  last_status TEXT CHECK(last_status IN ('success', 'failure', 'timeout', 'skipped')),
  failure_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  timeout_ms INTEGER DEFAULT 30000,
  notify_channels TEXT DEFAULT '["sse"]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_next ON scheduled_jobs(status, next_run_at);

-- Job Execution Audit Logs
CREATE TABLE IF NOT EXISTS job_execution_logs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  duration_ms INTEGER,
  status TEXT NOT NULL CHECK(status IN ('success', 'failure', 'timeout')),
  output TEXT,
  error_message TEXT,
  tokens_used INTEGER DEFAULT 0,
  FOREIGN KEY (job_id) REFERENCES scheduled_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_logs_job_time ON job_execution_logs(job_id, started_at DESC);
```

---

## 4. Architectural Decision Records (MADR)

| # | Decision Title | Status | Context & Problem | Chosen Solution & Rationale | Consequences & Trade-offs | Orchestrated Skill |
|---|----------------|--------|-------------------|-----------------------------|---------------------------|-------------------|
| 1 | In-Process Heartbeat Daemon | Accepted | Need continuous cron evaluation without requiring external cron daemons or complex OS systemd installations. | Embed lightweight 1-second tick loop inside `LocalDaemonAdapter` (`talon serve`). | Background jobs only run while daemon is active; state is persistent in SQLite so no jobs are lost across restarts. | `cron-scheduler-expert` |
| 2 | Dual Execution Routing (Prompt vs. Direct Skill) | Accepted | Running LLM for every scheduled task causes unnecessary token consumption and API costs. | Support `action_type: 'skill'` which invokes sandboxed skill directly (0 tokens), reserving `action_type: 'prompt'` for cognitive tasks. | 90%+ cost reduction for standard monitoring and health check jobs. | `ai-llm-integration-expert` |
| 3 | Anti-Thundering Herd Coalesce | Accepted | Machine sleep/wake cycles cause missed ticks to pile up, risking dozens of parallel executions on wake. | If `now - next_run_at > 2 * interval`, collapse missed runs into a single catch-up execution. | Eliminates CPU spikes and token burst charges upon machine resume. | `error-resilience-expert` |
| 4 | HMAC SHA-256 Webhook Ingress | Accepted | Public webhook endpoints must be protected against malicious spoofing and DDoS replay attacks. | Verify `X-Talon-Signature` matching HMAC of request body with shared secret. | Secure external integration with GitHub, Stripe, and monitoring alerts. | `autonomous-red-teamer` |

---

## 5. Subagent Contract Map Slice (`CONTEXT_MAP.md`)

```typescript
export interface ScheduledJob {
  id: string;
  name: string;
  cron: string;
  actionType: 'prompt' | 'skill';
  actionPayload: {
    prompt?: string;
    skillName?: string;
    args?: Record<string, unknown>;
  };
  status: 'active' | 'paused' | 'running';
  nextRunAt?: number;
  lastRunAt?: number;
  lastStatus?: 'success' | 'failure' | 'timeout' | 'skipped';
  failureCount: number;
  maxRetries: number;
  timeoutMs: number;
  notifyChannels: string[];
  createdAt: number;
  updatedAt: number;
}

export interface JobExecutionLog {
  id: string;
  jobId: string;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  status: 'success' | 'failure' | 'timeout';
  output?: string;
  errorMessage?: string;
  tokensUsed: number;
}

export interface ICronScheduler {
  start(): void;
  stop(): void;
  evaluateTick(now?: number): Promise<void>;
  registerJob(job: Omit<ScheduledJob, 'id' | 'createdAt' | 'updatedAt' | 'failureCount'>): Promise<ScheduledJob>;
  triggerJob(idOrName: string): Promise<JobExecutionLog>;
  toggleJob(idOrName: string, active?: boolean): Promise<ScheduledJob>;
  deleteJob(idOrName: string): Promise<boolean>;
  getJobs(): Promise<ScheduledJob[]>;
  getLogs(jobId?: string, limit?: number): Promise<JobExecutionLog[]>;
}
```

---

## 6. Execution Roadmap (8-Phase Zero-to-Prod Pipeline)

1. **Phase 1: Memory Layer Extensions (`@opentalon/memory`)**
   - Create schema migration for `scheduled_jobs` and `job_execution_logs`.
   - Add CRUD methods to `LibSqlMemoryAdapter`.
   - Add unit tests with 100% passing coverage.
2. **Phase 2: Cron Engine Core (`@opentalon/core`)**
   - Implement zero-dependency cron parser & next-run calculator.
   - Implement `CronScheduler` with single-flight mutex, timeout guard, and dual routing (`DualBrainRouter` vs `SandboxedVmRunner`).
   - Add unit tests for schedule evaluation, catch-up coalescing, and circuit breaking.
3. **Phase 3: Webhook Ingress & Daemon Integration (`@opentalon/gateway`)**
   - Wire `CronScheduler` into `LocalDaemonAdapter.start()` / `stop()`.
   - Add REST endpoints `/api/cron/*` and `/api/webhooks/:name`.
   - Add HMAC signature verification middleware.
   - Dispatch proactive alert events through `/api/events` SSE bus.
4. **Phase 4: Web Cockpit Automations Tab (`packages/gateway`)**
   - Add Tab 8 "Automations" to the Web Dashboard.
   - Interactive automation cards, status toggle switch, "New Job" modal with presets.
   - Live execution log viewer streaming via SSE.
5. **Phase 5: CLI Command Suite (`packages/cli`)**
   - Implement `talon cron list`, `talon cron add`, `talon cron trigger`, `talon cron pause`, `talon cron resume`, `talon cron logs`.
   - Add alias `talon schedule`.
6. **Phase 6: Default Out-of-the-Box Preset Automations**
   - Provide standard presets: "Hourly Health Check" (0 token skill action) & "Daily System Digest" (prompt action).
7. **Phase 7: End-to-End Hardening & Regression Verification**
   - Run complete test suite (`vitest run`), ensuring all existing 92 tests + new scheduler tests pass with zero regressions.
8. **Phase 8: Documentation & Checkpoint Update**
   - Update `PRD.md`, `DOCUMENTATION.md`, `CHECKPOINT.md`, and `README.md`.
