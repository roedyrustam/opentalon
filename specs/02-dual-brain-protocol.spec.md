# SPEC-02: Dual-Brain Protocol Specification (Fast Path vs Slow Path)

## 1. Overview
The Dual-Brain Architecture segregates reactive agent execution from continuous evolutionary learning.

---

## 2. Fast Path Protocol (Execution & Gateway Loop)

### 2.1 Latency & Token Budget Constraints
- **Target Budget**: $< 1,500$ tokens per turn total prompt context.
- **Max Latency**: $< 250$ms time-to-first-token (TTFT) on standard broadband.
- **Top-K Skill Retrieval**: Retrieves maximum $K=3$ most relevant procedural skills via hybrid search to prevent prompt bloat.

### 2.2 Turn Execution Lifecycle
1. **User Prompt Ingress**: Received via Gateway (CLI or HTTP).
2. **Hybrid Skill Search**: Query `@opentalon/memory` using FTS5 + Vector hybrid retrieval for Top-$K$ relevant skills.
3. **Prefix KV-Cache Assembly**:
   - System Instruction (static prefix, KV-cache pinned).
   - Tool/Skill Definitions (top-$K$ schemas only).
   - Dynamic short-term conversation context.
4. **LLM Generation**: Invoke `LLMPort.generateContent()` with streaming response.
5. **Tool / Skill Execution**: Execute tool calls inside `SkillSandbox`.
6. **Emit Execution Trace**: Concurrently log `{ input, retrievedSkills, toolCalls, result, latencyMs, timestamp }` to the Async Event Queue.
7. **Immediate User Return**: Return result to the user immediately without blocking on Slow Path reflection.

---

## 3. Slow Path Protocol (Evolution & Reflection Loop)

### 3.1 Non-Blocking Background Queue
- The Slow Path operates entirely asynchronously via an in-process micro-queue or background worker.
- Receives execution traces from the Fast Path.

### 3.2 Evolution Pipeline Stages
1. **Trace Ingestion**: Evaluates trace outcomes (success, error, retry count, token consumption).
2. **Heuristic Extraction**: If an execution pattern or bug-fix occurs repeatedly, trigger LLM Reflection with extended reasoning (Gemini Thinking Budget: 16k-32k).
3. **Skill Synthesis**:
   - Generates or refines `SKILL.md` (frontmatter, documentation, triggers).
   - Generates sandboxed executable TypeScript/JavaScript logic.
4. **Verification & Sandbox Testing**:
   - Executes the synthesized skill against test fixtures in the Zero-Trust Sandbox.
   - If execution fails or violates capability grants, rollback candidate and record audit log.
5. **Procedural Memory Commit**:
   - Write updated skill to `@opentalon/memory` procedural skill table.
   - Increment semantic version (`v1.0.0` -> `v1.0.1`).
   - Update FTS5 search index and vector embeddings for instant Fast Path availability in future turns.
