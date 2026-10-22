# Product Requirements Document (PRD): OpenTalon

## 1. Project Overview & Vision
**OpenTalon** is a next-generation, high-performance, open-source AI Agent framework. It synergizes the self-evolving procedural memory and autonomous skill synthesis of **Hermes Agent** with the ultra-frugal token consumption and multi-gateway agility of **OpenClaw**, governed by a Zero-Trust capability-based sandbox.

### Core Value Proposition
- **Extreme Token Frugality**: Fast Path execution maintains `< 1,500` tokens per conversational turn.
- **Continuous Autonomous Evolution**: Background Slow Path asynchronously evaluates traces, synthesizes new procedural skills (`SKILL.md`), and commits them to versioned storage.
- **Enterprise-Grade Security**: Isolated execution sandbox with strict capability controls (`net`, `fs`, `env`).
- **Hybrid Deployment Topology**: Runs in-process on Node.js 22+ local CLI daemons and stateless serverless edge workers (Cloudflare Workers, Vercel, AWS Lambda) without architecture modifications.

---

## 2. Target Persona & Use Cases
1. **AI Agent Developers**: Need an extensible, production-ready framework with modular ports and adapters without vendor lock-in.
2. **FinTech & Enterprise Engineers**: Require deterministic security guarantees, audit logs, and capability controls over agent-generated code.
3. **Edge & Serverless Architects**: Require scale-to-zero agents with sub-second startup times and minimal token overhead.

---

## 3. System Architecture & Modules
- **`@opentalon/core`**: Control plane, Hexagonal LLM Port (Gemini Driver with Thinking Budget & Cache, OpenAI Driver, Anthropic Driver), Dual-Brain Router, Token Budgeting Engine.
- **`@opentalon/memory`**: libSQL SQLite storage engine with FTS5 BM25 search, vector embeddings, and Reciprocal Rank Fusion (RRF).
- **`@opentalon/skill-engine`**: Zero-Trust Skill Sandbox runner, `SKILL.md` parser/serializer, Versioning & Rollback engine, Autonomous Skill Synthesizer.
- **`@opentalon/gateway`**: Local CLI (daemon) and Serverless Edge (HTTP webhook) ingress ports.
- **`talon` CLI**: Developer CLI binary (`talon init`, `talon run`, `talon serve`, `talon skills`).

---

## 4. Non-Functional Requirements (NFR)
- **Zero-Latency In-Process**: Monorepo packages call each other in-process with 0ms network hop.
- **Token Budget Ceiling**: Fast Path prompt payload $\le 1,500$ tokens per turn.
- **Test Coverage**: 100% passing unit tests across memory, sandbox, and core router.
- **Anti-Slop Compliance**: Zero placeholder implementations (`// TODO`), production-grade TypeScript strictness.
