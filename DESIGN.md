# OpenTalon — Design & Skill Orchestration Document (Slow Path Closed-Loop)

## 1. Understanding Summary
- **Core Goal**: Mewujudkan siklus evolusi otonom mandiri (*closed-loop procedural skill evolution*) di mana kegagalan eksekusi atau repetisi tugas tanpa skill pada Fast Path secara asinkron memicu penalaran System-2 LLM, sintesis `SKILL.md`, pengujian sandbox, dan komit otomatis ke database SQLite libSQL.
- **Audience**: AI Agent developers, sistem otonom lokal dan serverless edge yang membutuhkan agen yang mampu beradaptasi dan memperbaiki diri (*self-healing*) tanpa henti.
- **Key Flows**:
  1. Fast Path Router memproses kueri turn (<1.500 token budget) dan mencatat `EpisodicTrace` ke database.
  2. Event `trace:emitted` ditampung ke dalam **Debounced Evolution Queue** (jeda 5 detik atau buffer batch).
  3. `EvolutionEngine` menganalisis trace dengan `HeuristicsExtractor` untuk menemukan kandidat `heal_failure` atau `synthesize_new`.
  4. LLM System-2 Thinking memformulasikan dokumen `SKILL.md` lengkap dengan metadata, capability boundaries, dan unit test assertions.
  5. `SkillSynthesizer` menguji kode kandidat di dalam `SandboxedVmRunner` isolate.
  6. Jika valid, skill disimpan secara atomik ke tabel `procedural_skills`, disinkronkan ke `fts_skills` FTS5 index, dan dihitung embedding vektornya untuk hybrid search.
- **Non-Goals**:
  - Tidak memblokir respon Fast Path (Fast Path tetap mempertahankan SLA sub-detik).
  - Tidak mengizinkan sintesis kode dengan kapabilitas berisiko tanpa verifikasi sandbox.

---

## 2. Technical Architecture & Skill Delegation

| Layer / Sub-domain | Komponen Teknis | Skill vibes-plug Terdelegasi |
| :--- | :--- | :--- |
| **Routing & Event Queue** | `DualBrainRouter` + in-memory debounced event queue | `error-resilience-expert`, `async-queue-temporal-expert` |
| **Heuristics Extraction** | `HeuristicsExtractor` (klasifikasi trace error & missing skills) | `spec-driven-development-expert` |
| **Autonomous Evolution** | `EvolutionEngine` + LLM System-2 Reflection (16k thinking budget) | `ai-llm-integration-expert`, `gemini-agent-booster` |
| **Zero-Trust Sandbox** | `ISkillSandbox` / `SandboxedVmRunner` (isolasi kapabilitas) | `autonomous-red-teamer`, `anti-slop` |
| **Persistence & Indexing**| libSQL SQLite, `procedural_skills`, `fts_skills`, Vector embeddings | `database-orm-expert` |
| **CLI & Operator Tools** | CLI `talon evolve` & flag `talon serve --auto-evolve` | `senior-frontend` / `js-backend-expert` |

---

## 3. Component Architecture & Event Lifecycle

```
[User Request] 
      │
      ▼
[DualBrainRouter.executeFastPath()]
      │
      ├───► (1) Save EpisodicTrace to SQLite (Sync)
      ├───► (2) Return FastPathResult to User (<1,500 Tokens, <500ms)
      │
      └───► (3) emit('trace:emitted', trace)
                  │
                  ▼
         [Debounced Evolution Queue]
         (Accumulates traces for 5s / max 5 traces)
                  │
                  ▼
         [EvolutionEngine.runEvolutionCycle()]
                  │
                  ├──► HeuristicsExtractor.extractOpportunities(traces)
                  │          │
                  │          ├── 'heal_failure'
                  │          └── 'synthesize_new'
                  │
                  ├──► LLM Reflection Call (System-2 Reasoning)
                  │          │
                  │          └── Returns verified SKILL.md Candidate
                  │
                  ├──► SkillSynthesizer.synthesize()
                  │          │
                  │          └── SandboxedVmRunner Execution & Test Cases
                  │
                  └──► LibSqlMemoryAdapter.saveSkill()
                             │
                             └── Atomic commit to DB & FTS5 Indexing
```

---

## 4. Architectural Decision Records (MADR Standard)

| # | Judul Keputusan | Status | Konteks & Masalah | Solusi Terpilih & Alasan | Konsekuensi & Trade-off |
|---|----------------|--------|-------------------|--------------------------|-------------------------|
| **ADR-01** | Debounced In-Memory Queue | **Accepted** | Mencegah lonjakan pemanggilan LLM (*thundering herd*) saat banyak turn terjadi bersamaan. | Menerapkan buffer debounce 5 detik di `DualBrainRouter` sebelum memicu `EvolutionEngine`. | Sedikit jeda (5 detik) sebelum skill baru aktif di memori, namun menjamin efisiensi FinOps. |
| **ADR-02** | Circuit Breaker & Throttle | **Accepted** | Mencegah loop kegagalan tak terbatas saat LLM menghasilkan kode yang gagal di sandbox. | Batasi maksimal 2x percobaan per `opportunity.id` dan batasi rate limit evolusi maksimal 5 skill/jam. | Peluang evolusi yang gagal 2x berturut-turut akan di-discard dan dicatat di audit log. |
| **ADR-03** | Dedicated CLI Command (`talon evolve`) | **Accepted** | Pengembang membutuhkan cara manual untuk memicu evolusi atau menjalankan evolusi terjadwal di CI/CD. | Menambahkan subcommand `talon evolve` dengan opsi `--limit`, `--dry-run`, dan `--json`. | Menambah surface area CLI `@opentalon/cli`, namun meningkatkan DX secara signifikan. |

---

## 5. Pre-Mortem Risk Assessment & Mitigation

1. **Risk: Sandbox Exhaustion or Infinite Loop during Test Run**
   - *Mitigation*: Hard timeout 5.000ms pada `SandboxedVmRunner` dan isolasi memori 16MB.
2. **Risk: Token Budget Exhaustion on Evolution Loop**
   - *Mitigation*: Panggilan LLM pada `EvolutionEngine` dipatok dengan batas token output ketat dan sistem fallback otomatis dari Gemini 2.5 Pro ke Flash.
3. **Risk: Malicious Skill Injection via User Inputs**
   - *Mitigation*: Sanitasi schema kapabilitas; tolak otomatis skill yang meminta `capabilities.net.allowedHosts = ["*"]` atau akses di luar sandbox.

---

## 6. Subagent Contract Map Slice (`CONTEXT_MAP.md` slice)

```typescript
// Shared Types Slice for Subagents:
export interface EvolutionQueueConfig {
  debounceMs?: number;        // Default 5000ms
  maxBatchSize?: number;      // Default 5 traces
  maxRetriesPerOpp?: number;  // Default 2 attempts
  enabled?: boolean;          // Default true
}

export interface EvolveCommandOptions {
  limit?: string;             // Number of traces to scan
  dryRun?: boolean;           // Do not commit to DB
  json?: boolean;             // Output machine-readable JSON report
}
```
