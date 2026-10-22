export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenTalon — Dual-Brain AI Agent Cockpit</title>
  <style>
    :root {
      --bg: #0b0f17;
      --card-bg: #111827;
      --card-border: #1f293d;
      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --accent: #10b981;
      --accent-purple: #8b5cf6;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Tabular numbers for clean telemetry */
    .tabular-nums { font-variant-numeric: tabular-nums; font-family: var(--font-mono); }

    /* Top Navigation Bar */
    header {
      background: rgba(17, 24, 39, 0.85);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--card-border);
      padding: 0.875rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 50;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-weight: 700;
      font-size: 1.15rem;
      letter-spacing: -0.02em;
    }

    .brand-badge {
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      color: white;
      padding: 0.2rem 0.6rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    nav {
      display: flex;
      gap: 0.5rem;
    }

    .tab-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      padding: 0.45rem 1rem;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      font-size: 0.875rem;
      transition: all 0.15s ease;
    }

    .tab-btn:hover {
      color: var(--text);
      background: rgba(255, 255, 255, 0.04);
    }

    .tab-btn.active {
      color: #fff;
      background: #1f2937;
      border-color: var(--card-border);
    }

    /* Main Container */
    main {
      flex: 1;
      max-width: 1400px;
      width: 100%;
      margin: 0 auto;
      padding: 2rem;
    }

    .tab-content { display: none; }
    .tab-content.active { display: block; }

    /* Stat Cards Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 1.25rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 1.25rem 1.5rem;
      position: relative;
      overflow: hidden;
    }

    .stat-label {
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 0.5rem;
    }

    .stat-value {
      font-size: 1.85rem;
      font-weight: 700;
      color: #fff;
    }

    .stat-desc {
      font-size: 0.775rem;
      color: var(--text-muted);
      margin-top: 0.35rem;
    }

    /* Cards & Containers */
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }

    .card-title {
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    /* Table */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
      text-align: left;
    }

    th {
      border-bottom: 1px solid var(--card-border);
      padding: 0.75rem 1rem;
      color: var(--text-muted);
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    td {
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
      padding: 0.85rem 1rem;
      vertical-align: middle;
    }

    tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }

    /* Badges */
    .badge {
      display: inline-block;
      padding: 0.2rem 0.5rem;
      border-radius: 6px;
      font-size: 0.725rem;
      font-weight: 600;
      font-family: var(--font-mono);
    }

    .badge-success { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge-blue { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
    .badge-purple { background: rgba(139, 92, 246, 0.15); color: #a78bfa; border: 1px solid rgba(139, 92, 246, 0.3); }

    /* Playground / Chat */
    .chat-container {
      display: flex;
      flex-direction: column;
      height: 600px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      overflow: hidden;
    }

    .chat-messages {
      flex: 1;
      padding: 1.5rem;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .message {
      max-width: 80%;
      padding: 1rem 1.25rem;
      border-radius: 10px;
      font-size: 0.925rem;
      line-height: 1.5;
    }

    .message-user {
      align-self: flex-end;
      background: var(--primary);
      color: #fff;
      border-bottom-right-radius: 2px;
    }

    .message-assistant {
      align-self: flex-start;
      background: #1f2937;
      border: 1px solid var(--card-border);
      border-bottom-left-radius: 2px;
    }

    .chat-input-bar {
      padding: 1rem 1.5rem;
      background: #0d131f;
      border-top: 1px solid var(--card-border);
      display: flex;
      gap: 0.75rem;
    }

    .chat-input {
      flex: 1;
      background: #111827;
      border: 1px solid var(--card-border);
      color: #fff;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      font-size: 0.9rem;
      outline: none;
    }

    .chat-input:focus { border-color: var(--primary); }

    .btn {
      background: var(--primary);
      color: #fff;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .btn:hover { background: var(--primary-hover); }

    /* Code View */
    pre {
      background: #0d131f;
      border: 1px solid var(--card-border);
      padding: 1rem;
      border-radius: 8px;
      font-family: var(--font-mono);
      font-size: 0.85rem;
      overflow-x: auto;
      color: #e5e7eb;
    }
  </style>
</head>
<body>

  <header>
    <div class="brand">
      <svg viewBox="0 0 512 512" width="34" height="34" style="filter: drop-shadow(0 0 8px rgba(0, 242, 254, 0.7)); flex-shrink: 0;">
        <defs>
          <linearGradient id="hbFast" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#00f2fe"/><stop offset="100%" stop-color="#0072ff"/></linearGradient>
          <linearGradient id="hbSlow" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#d946ef"/><stop offset="100%" stop-color="#8b5cf6"/></linearGradient>
          <linearGradient id="hbClaw" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#475569"/><stop offset="100%" stop-color="#0f172a"/></linearGradient>
        </defs>
        <ellipse cx="256" cy="256" rx="140" ry="50" fill="none" stroke="url(#hbFast)" stroke-width="8" stroke-dasharray="24 16" transform="rotate(-25 256 256)"/>
        <ellipse cx="256" cy="256" rx="140" ry="50" fill="none" stroke="url(#hbSlow)" stroke-width="8" stroke-dasharray="24 16" transform="rotate(35 256 256)"/>
        <path d="M 256,180 A 76,76 0 0,0 256,332 Z" fill="url(#hbFast)"/>
        <path d="M 256,180 A 76,76 0 0,1 256,332 Z" fill="url(#hbSlow)"/>
        <circle cx="256" cy="256" r="28" fill="#ffffff"/>
        <path d="M 230,70 L 256,110 L 282,70 L 275,130 L 256,180 L 237,130 Z" fill="url(#hbClaw)" stroke="#38bdf8" stroke-width="4"/>
        <g transform="rotate(-40 256 256)"><path d="M 235,90 L 256,130 L 277,95 L 268,150 L 256,195 L 244,150 Z" fill="url(#hbClaw)" stroke="#00f2fe" stroke-width="4"/></g>
        <g transform="rotate(40 256 256)"><path d="M 235,90 L 256,130 L 277,95 L 268,150 L 256,195 L 244,150 Z" fill="url(#hbClaw)" stroke="#d946ef" stroke-width="4"/></g>
      </svg>
      <span>Open<span style="color: #00f2fe;">Talon</span></span>
      <span class="brand-badge">Dual-Brain Engine</span>
    </div>
    <nav>
      <button class="tab-btn active" onclick="switchTab('overview')">Overview</button>
      <button class="tab-btn" onclick="switchTab('traces')">Episodic Traces</button>
      <button class="tab-btn" onclick="switchTab('skills')">Procedural Skills</button>
      <button class="tab-btn" onclick="switchTab('swarm')">Swarm Topologies</button>
      <button class="tab-btn" onclick="switchTab('mcp')">MCP Hub</button>
      <button class="tab-btn" onclick="switchTab('facts')">Semantic Memory</button>
      <button class="tab-btn" onclick="switchTab('chat')">Live Playground</button>
    </nav>
  </header>

  <main>
    <!-- TAB 1: OVERVIEW -->
    <section id="overview" class="tab-content active">
      <!-- 3D DYNAMIC DUAL-BRAIN HOLOGRAPHIC HERO WIDGET -->
      <div style="background: radial-gradient(circle at 85% 50%, rgba(0, 242, 254, 0.12), transparent 50%), radial-gradient(circle at 15% 50%, rgba(217, 70, 239, 0.12), transparent 50%), #0e1422; border: 1px solid var(--card-border); border-radius: 16px; padding: 1.5rem 2rem; margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1.5rem; position: relative; overflow: hidden; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);">
        <div style="flex: 1; min-width: 300px;">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 10px #10b981;"></span>
            <span style="font-family: var(--font-mono); font-size: 0.75rem; color: #10b981; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;">Zero-Trust Dual-Brain Core Online</span>
          </div>
          <h2 style="font-size: 1.75rem; font-weight: 900; letter-spacing: -0.03em; margin-bottom: 0.5rem;">
            Autonomous Cognitive Architecture
          </h2>
          <p style="color: var(--text-muted); font-size: 0.9rem; line-height: 1.5; max-width: 600px;">
            OpenTalon synergizes <strong style="color: #00f2fe;">Fast Path</strong> low-latency token frugality (&lt;1,500 tokens/turn) with an asynchronous <strong style="color: #d946ef;">Slow Path</strong> evolutionary reflection engine governed by a sandboxed capability matrix.
          </p>
          <div style="display: flex; gap: 0.75rem; margin-top: 1.25rem;">
            <span style="background: rgba(0, 242, 254, 0.1); border: 1px solid rgba(0, 242, 254, 0.3); color: #00f2fe; padding: 0.3rem 0.75rem; border-radius: 6px; font-size: 0.75rem; font-family: var(--font-mono); font-weight: 600;">⚡ Fast Path: &lt;500ms</span>
            <span style="background: rgba(217, 70, 239, 0.1); border: 1px solid rgba(217, 70, 239, 0.3); color: #d946ef; padding: 0.3rem 0.75rem; border-radius: 6px; font-size: 0.75rem; font-family: var(--font-mono); font-weight: 600;">🧠 Slow Path: Closed-Loop</span>
            <span style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); color: #10b981; padding: 0.3rem 0.75rem; border-radius: 6px; font-size: 0.75rem; font-family: var(--font-mono); font-weight: 600;">🛡️ Sandbox: Strict Isolate</span>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <canvas id="talon3DHeroCanvas" width="280" height="280" style="width: 140px; height: 140px; border-radius: 50%; background: #070a12; border: 1px solid #1e293b; box-shadow: 0 0 30px rgba(0, 242, 254, 0.25); cursor: pointer;" title="Dynamic 3D OpenTalon Core — Interactive Orbit"></canvas>
          <span style="font-size: 0.7rem; font-family: var(--font-mono); color: var(--text-muted); margin-top: 0.5rem;">Live 3D Telemetry Core</span>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Fast Path Budget</div>
          <div class="stat-value tabular-nums">&lt; 1,500 <span style="font-size: 1rem; color: var(--text-muted);">tokens</span></div>
          <div class="stat-desc">Zero-Latency in-process router</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Indexed Skills</div>
          <div class="stat-value tabular-nums" id="stat-skills-count">--</div>
          <div class="stat-desc">Hybrid FTS5 + Vector SQLite index</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Episodic Traces</div>
          <div class="stat-value tabular-nums" id="stat-traces-count">--</div>
          <div class="stat-desc">Continuous Slow Path learning pool</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Avg Execution Latency</div>
          <div class="stat-value tabular-nums" id="stat-avg-latency">-- <span style="font-size: 1rem; color: var(--text-muted);">ms</span></div>
          <div class="stat-desc">In-process zero network overhead</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Semantic Facts</div>
          <div class="stat-value tabular-nums" id="stat-facts-count">--</div>
          <div class="stat-desc">Zero-Latency System-1 context injection</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">
          <span>Active Dual-Brain Pipeline Architecture</span>
          <span class="badge badge-success">Production Ready</span>
        </div>
        <div style="line-height: 1.6; color: var(--text-muted); font-size: 0.925rem;">
          <p>• <strong>Fast Path:</strong> Evaluates incoming turns within &lt;1,500 tokens using Reciprocal Rank Fusion (RRF) hybrid retrieval, executes tools inside a capability-isolated sandbox, and logs execution traces.</p>
          <p style="margin-top: 0.5rem;">• <strong>Slow Path:</strong> Runs non-blocking background reflection with Gemini System-2 Deep Thinking to diagnose failures, extract reusable heuristics, and autonomously commit self-healed <code>SKILL.md</code> files.</p>
        </div>
      </div>
    </section>

    <!-- TAB 2: EPISODIC TRACES -->
    <section id="traces" class="tab-content">
      <div class="card">
        <div class="card-title">
          <span>Recent Execution Traces</span>
          <button class="btn" style="padding: 0.35rem 0.75rem; font-size: 0.75rem;" onclick="loadTraces()">Refresh</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Session</th>
              <th>User Input</th>
              <th>Skills Used</th>
              <th>Tokens</th>
              <th>Latency</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="traces-table-body">
            <tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Loading traces...</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- TAB 3: PROCEDURAL SKILLS -->
    <section id="skills" class="tab-content">
      <div class="card">
        <div class="card-title">
          <span>Registered Procedural Skills</span>
          <button class="btn" style="padding: 0.35rem 0.75rem; font-size: 0.75rem;" onclick="loadSkills()">Refresh</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Version</th>
              <th>Description</th>
              <th>Capabilities</th>
              <th>SHA-256 Hash</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="skills-table-body">
            <tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Loading skills...</td></tr>
          </tbody>
        </table>
      </div>

      <div class="card" id="skill-tester-card" style="display: none;">
        <div class="card-title">
          <span id="test-skill-title">Skill Sandbox Execution</span>
          <button class="btn" style="padding: 0.35rem 0.75rem; font-size: 0.75rem; background: #374151;" onclick="closeTester()">Close</button>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">Arguments (JSON):</p>
        <textarea id="test-skill-args" style="width: 100%; height: 80px; background: #0d131f; border: 1px solid var(--card-border); color: #fff; padding: 0.75rem; border-radius: 8px; font-family: var(--font-mono); margin-bottom: 1rem;">{}</textarea>
        <button class="btn" onclick="executeSkillTest()">Run in Sandbox</button>
        <div id="test-result-box" style="margin-top: 1rem; display: none;">
          <pre id="test-result-output"></pre>
        </div>
      </div>
    </section>

    <!-- TAB 4: SWARM TOPOLOGIES -->
    <section id="swarm" class="tab-content">
      <div class="card" style="margin-bottom: 1.5rem;">
        <div class="card-title">Autonomous Swarm Orchestration Engine</div>
        <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 1.25rem;">
          Dispatch multi-agent concurrent swarms across 2026 cognitive topologies: Fan-Out/Fan-In parallel research, Pipeline Saga sequential dependent execution, or Critic-Validator Loop zero-tolerance quality gates.
        </p>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
          <div class="stat-card" id="swarm-top-fanout" style="cursor: pointer; border: 2px solid var(--primary);" onclick="selectSwarmTopology('fan_out_fan_in')">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
              <strong style="color: #60a5fa;">Fan-Out / Fan-In</strong>
              <span class="badge badge-blue">Parallel</span>
            </div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">
              Concurrent subagent execution (Architect, Security, Craftsman) with unified consensus synthesis.
            </div>
          </div>

          <div class="stat-card" id="swarm-top-saga" style="cursor: pointer; border: 1px solid var(--card-border);" onclick="selectSwarmTopology('pipeline_saga')">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
              <strong style="color: #a78bfa;">Pipeline Saga</strong>
              <span class="badge badge-purple">Sequential</span>
            </div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">
              Multi-stage pipeline passing intermediate state: Discovery &rarr; Contracts &rarr; Implementation.
            </div>
          </div>

          <div class="stat-card" id="swarm-top-critic" style="cursor: pointer; border: 1px solid var(--card-border);" onclick="selectSwarmTopology('critic_validator_loop')">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
              <strong style="color: #34d399;">Critic-Validator Loop</strong>
              <span class="badge badge-success">Quality Gate</span>
            </div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">
              Self-healing adversarial loop between Implementer and Strict Critic until 100% verified.
            </div>
          </div>
        </div>

        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">Mission / Task Objective:</label>
          <textarea id="swarm-task-input" style="width: 100%; height: 90px; background: #0d131f; border: 1px solid var(--card-border); color: #fff; padding: 0.75rem; border-radius: 8px; font-family: var(--font-sans); font-size: 0.9rem;" placeholder="e.g. Design and synthesize a DOKU SNAP BI payment webhook processor with HMAC validation and atomic idempotency..."></textarea>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; gap: 1rem; align-items: center;">
            <span style="font-size: 0.8rem; color: var(--text-muted);">Selected Topology: <strong id="swarm-selected-label" style="color: #60a5fa;">fan_out_fan_in</strong></span>
          </div>
          <button class="btn" id="swarm-run-btn" onclick="runSwarmTask()">Launch Swarm Mission</button>
        </div>
      </div>

      <div id="swarm-results-card" class="card" style="display: none;">
        <div class="card-title">
          <span>Swarm Execution Telemetry</span>
          <span id="swarm-telemetry-badge" class="badge badge-blue">Running...</span>
        </div>
        <div id="swarm-subagents-container" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;"></div>
        <div style="border-top: 1px solid var(--card-border); padding-top: 1rem;">
          <div style="font-weight: 700; margin-bottom: 0.5rem; color: #38bdf8;">Final Unified Output / Approved Solution:</div>
          <pre id="swarm-final-output" style="max-height: 400px; white-space: pre-wrap;"></pre>
        </div>
      </div>
    </section>

    <!-- TAB 5: MCP HUB -->
    <section id="mcp" class="tab-content">
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; margin-bottom: 1.5rem;">
        <div class="card">
          <div class="card-title">OpenTalon MCP Server Status</div>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">
            OpenTalon natively implements Model Context Protocol (MCP v1.x, specification 2024-11-05). All procedural skills and episodic traces are accessible as tools and resources.
          </p>
          <div style="display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.85rem; font-family: var(--font-mono);">
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #1f293d; padding-bottom: 0.4rem;">
              <span style="color: var(--text-muted);">JSON-RPC Protocol:</span>
              <span style="color: #38bdf8;">2.0 (spec 2024-11-05)</span>
            </div>
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #1f293d; padding-bottom: 0.4rem;">
              <span style="color: var(--text-muted);">HTTP RPC Endpoint:</span>
              <span style="color: #34d399;">/api/mcp/rpc</span>
            </div>
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #1f293d; padding-bottom: 0.4rem;">
              <span style="color: var(--text-muted);">Stdio Integration:</span>
              <span style="color: #a78bfa;">talon mcp serve</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: var(--text-muted);">Compatible Clients:</span>
              <span style="color: #f3f4f6;">Claude Desktop, Cursor, AGY</span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Import Remote MCP Server Tools</div>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.75rem;">
            Auto-synthesize sandboxed procedural skills by connecting to any external HTTP MCP server endpoint:
          </p>
          <div style="margin-bottom: 0.75rem;">
            <input type="text" id="mcp-import-url" class="chat-input" placeholder="http://127.0.0.1:8000/rpc" style="width: 100%; margin-bottom: 0.5rem;" />
            <div style="display: flex; gap: 0.5rem;">
              <input type="text" id="mcp-import-prefix" class="chat-input" placeholder="prefix (e.g. ext)" style="width: 120px;" value="ext" />
              <button class="btn" style="flex: 1;" onclick="importMcpTools()">Discover & Import Tools</button>
            </div>
          </div>
          <div id="mcp-import-status" style="font-size: 0.8rem; color: var(--text-muted); display: none;"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">
          <span>Active MCP Tools</span>
          <button class="btn" style="padding: 0.25rem 0.75rem; font-size: 0.75rem;" onclick="loadMcpTools()">Refresh</button>
        </div>
        <div id="mcp-tools-list" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1rem;">
          <div style="color: var(--text-muted); font-size: 0.875rem;">Loading MCP tools...</div>
        </div>
      </div>
    </section>

    <!-- TAB 6: SEMANTIC MEMORY (FACTS & KNOWLEDGE) -->
    <section id="facts" class="tab-content">
      <div style="display: grid; grid-template-columns: 360px 1fr; gap: 1.5rem; margin-bottom: 1.5rem; align-items: start;">
        <!-- Left: Add New Fact Form -->
        <div class="card">
          <div class="card-title">Store Semantic Fact</div>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">
            Store persistent user preferences, system constraints, or domain rules that are automatically retrieved and injected into the Fast Path prompt.
          </p>
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            <div>
              <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">Category</label>
              <select id="fact-new-category" class="chat-input" style="width: 100%;">
                <option value="user_preference">User Preference</option>
                <option value="system_rule">System Rule</option>
                <option value="domain_knowledge">Domain Knowledge</option>
                <option value="developer_habit">Developer Habit</option>
              </select>
            </div>
            <div>
              <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">Key / Subject</label>
              <input type="text" id="fact-new-key" class="chat-input" placeholder="e.g. preferred_currency" style="width: 100%;" />
            </div>
            <div>
              <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">Value / Instruction</label>
              <textarea id="fact-new-value" class="chat-input" rows="3" placeholder="e.g. Always format prices in USD with two decimals" style="width: 100%; resize: vertical;"></textarea>
            </div>
            <div>
              <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">Confidence Score (0.1 - 1.0)</label>
              <input type="number" id="fact-new-confidence" class="chat-input" value="1.0" min="0.1" max="1.0" step="0.1" style="width: 100%;" />
            </div>
            <button class="btn" onclick="saveNewFact()" style="margin-top: 0.5rem;">Save Fact to Memory</button>
            <div id="fact-save-status" style="font-size: 0.8rem; display: none;"></div>
          </div>
        </div>

        <!-- Right: Search & Fact Explorer -->
        <div class="card">
          <div class="card-title" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
            <span>Active Knowledge Items</span>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              <input type="text" id="fact-search-input" class="chat-input" placeholder="Search facts..." style="width: 180px; padding: 0.4rem 0.75rem; font-size: 0.825rem;" onkeydown="if(event.key==='Enter') searchFacts()" />
              <select id="fact-filter-category" class="chat-input" style="padding: 0.4rem 0.75rem; font-size: 0.825rem;" onchange="loadFacts()">
                <option value="">All Categories</option>
                <option value="user_preference">User Preferences</option>
                <option value="system_rule">System Rules</option>
                <option value="domain_knowledge">Domain Knowledge</option>
                <option value="developer_habit">Developer Habits</option>
              </select>
              <button class="btn" style="padding: 0.4rem 0.8rem; font-size: 0.825rem;" onclick="loadFacts()">Refresh</button>
            </div>
          </div>

          <div id="facts-list-container" style="display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1rem;">
            <div style="color: var(--text-muted);">Loading semantic memory facts...</div>
          </div>
        </div>
      </div>
    </section>

    <!-- TAB 7: LIVE PLAYGROUND (SSE STREAMING) -->
    <section id="chat" class="tab-content">
      <div class="chat-container">
        <div class="chat-messages" id="chat-messages">
          <div class="message message-assistant">
            Hello! I am OpenTalon. Ask me anything, or try triggering one of my registered procedural skills (e.g. currency conversion, CSV processing, or statistical calculations).
          </div>
        </div>
        <div class="chat-input-bar">
          <input type="text" id="chat-input" class="chat-input" placeholder="Type a message or instruction..." onkeydown="if(event.key==='Enter') sendMessage()" />
          <button class="btn" onclick="sendMessage()">Send</button>
        </div>
      </div>
    </section>
  </main>

  <script>
    let activeTestSkillName = '';

    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      if (typeof event !== 'undefined' && event?.target?.classList) {
        event.target.classList.add('active');
      }
      const el = document.getElementById(tabId);
      if (el) el.classList.add('active');

      if (tabId === 'traces') loadTraces();
      if (tabId === 'skills') loadSkills();
      if (tabId === 'overview') loadStats();
      if (tabId === 'mcp') loadMcpTools();
      if (tabId === 'facts') loadFacts();
    }

    async function loadStats() {
      try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        document.getElementById('stat-skills-count').innerText = data.skillsCount;
        document.getElementById('stat-traces-count').innerText = data.tracesCount;
        document.getElementById('stat-avg-latency').innerHTML = data.avgLatencyMs + ' <span style="font-size: 1rem; color: var(--text-muted);">ms</span>';
        const factsEl = document.getElementById('stat-facts-count');
        if (factsEl) factsEl.innerText = data.factsCount ?? 0;
      } catch (e) {
        console.error('Failed to load stats', e);
      }
    }

    async function loadTraces() {
      const tbody = document.getElementById('traces-table-body');
      try {
        const res = await fetch('/api/traces');
        const traces = await res.json();
        if (traces.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No traces recorded yet.</td></tr>';
          return;
        }

        tbody.innerHTML = traces.map(t => \`
          <tr>
            <td class="tabular-nums">\${t.id.slice(0, 14)}...</td>
            <td class="tabular-nums">\${t.sessionId.slice(0, 12)}</td>
            <td><strong>\${escapeHtml(t.input)}</strong></td>
            <td>\${(t.retrievedSkillIds || []).map(s => \`<span class="badge badge-blue">\${escapeHtml(s)}</span>\`).join(' ') || '<span style="color:var(--text-muted)">none</span>'}</td>
            <td class="tabular-nums">\${t.tokensUsed?.totalTokens || 0}</td>
            <td class="tabular-nums">\${Math.round(t.latencyMs)}ms</td>
            <td><span class="badge \${t.success ? 'badge-success' : 'badge-purple'}">\${t.success ? 'OK' : 'FAIL'}</span></td>
          </tr>
        \`).join('');
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #ef4444;">Failed to fetch traces.</td></tr>';
      }
    }

    async function loadSkills() {
      const tbody = document.getElementById('skills-table-body');
      try {
        const res = await fetch('/api/skills');
        const skills = await res.json();
        if (skills.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No procedural skills registered.</td></tr>';
          return;
        }

        tbody.innerHTML = skills.map(s => \`
          <tr>
            <td><strong>\${escapeHtml(s.name)}</strong></td>
            <td class="tabular-nums">v\${s.version}</td>
            <td style="color: var(--text-muted); max-width: 320px;">\${escapeHtml(s.description)}</td>
            <td>\${renderCapabilities(s.capabilities)}</td>
            <td class="tabular-nums" style="font-size: 0.75rem; color: var(--text-muted);">\${s.hash.slice(0, 12)}...</td>
            <td>
              <button class="btn" style="padding: 0.25rem 0.6rem; font-size: 0.725rem;" onclick="openTester('\${s.name}')">Test</button>
            </td>
          </tr>
        \`).join('');
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #ef4444;">Failed to fetch skills.</td></tr>';
      }
    }

    function renderCapabilities(caps) {
      const badges = [];
      if (caps?.net?.allowedHosts?.length) badges.push(\`<span class="badge badge-blue">net:\${caps.net.allowedHosts.length}</span>\`);
      if (caps?.fs?.readPaths?.length || caps?.fs?.writePaths?.length) badges.push(\`<span class="badge badge-purple">fs:scoped</span>\`);
      if (caps?.env?.length) badges.push(\`<span class="badge badge-success">env:\${caps.env.length}</span>\`);
      return badges.join(' ') || '<span style="color:var(--text-muted)">none</span>';
    }

    function openTester(skillName) {
      activeTestSkillName = skillName;
      document.getElementById('test-skill-title').innerText = 'Sandbox Test: ' + skillName;
      document.getElementById('skill-tester-card').style.display = 'block';
      document.getElementById('test-result-box').style.display = 'none';
    }

    function closeTester() {
      document.getElementById('skill-tester-card').style.display = 'none';
    }

    async function executeSkillTest() {
      const argsText = document.getElementById('test-skill-args').value;
      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(argsText);
      } catch (e) {
        alert('Invalid JSON in arguments');
        return;
      }

      const resBox = document.getElementById('test-result-box');
      const outPre = document.getElementById('test-result-output');
      resBox.style.display = 'block';
      outPre.innerText = 'Executing inside Zero-Trust Sandbox...';

      try {
        const res = await fetch('/api/skills/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: activeTestSkillName, args: parsedArgs })
        });
        const data = await res.json();
        outPre.innerText = JSON.stringify(data, null, 2);
      } catch (e) {
        outPre.innerText = 'Execution error: ' + e.message;
      }
    }

    async function sendMessage() {
      const input = document.getElementById('chat-input');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';

      const container = document.getElementById('chat-messages');
      container.innerHTML += \`<div class="message message-user">\${escapeHtml(text)}</div>\`;
      
      const assistantMsg = document.createElement('div');
      assistantMsg.className = 'message message-assistant';
      assistantMsg.innerHTML = '<em>OpenTalon is thinking...</em>';
      container.appendChild(assistantMsg);
      container.scrollTop = container.scrollHeight;

      try {
        const response = await fetch('/v1/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: text, sessionId: 'dashboard_sess' })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedText = '';
        let firstChunk = true;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.chunk) {
                  if (firstChunk) {
                    accumulatedText = '';
                    firstChunk = false;
                  }
                  accumulatedText += data.chunk;
                  assistantMsg.innerText = accumulatedText;
                  container.scrollTop = container.scrollHeight;
                }
              } catch (e) {}
            }
          }
        }
      } catch (err) {
        assistantMsg.innerText = 'Error: ' + err.message;
      }
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Swarm Topologies Controller
    let activeSwarmTopology = 'fan_out_fan_in';

    function selectSwarmTopology(top) {
      activeSwarmTopology = top;
      const lbl = document.getElementById('swarm-selected-label');
      if (lbl) lbl.innerText = top;
      const f = document.getElementById('swarm-top-fanout');
      const s = document.getElementById('swarm-top-saga');
      const c = document.getElementById('swarm-top-critic');
      if (f) f.style.borderColor = top === 'fan_out_fan_in' ? 'var(--primary)' : 'var(--card-border)';
      if (s) s.style.borderColor = top === 'pipeline_saga' ? 'var(--primary)' : 'var(--card-border)';
      if (c) c.style.borderColor = top === 'critic_validator_loop' ? 'var(--primary)' : 'var(--card-border)';
    }

    async function runSwarmTask() {
      const task = document.getElementById('swarm-task-input').value.trim();
      if (!task) {
        alert('Please specify a task objective for the swarm.');
        return;
      }

      const runBtn = document.getElementById('swarm-run-btn');
      const resultsCard = document.getElementById('swarm-results-card');
      const badge = document.getElementById('swarm-telemetry-badge');
      const subContainer = document.getElementById('swarm-subagents-container');
      const finalOut = document.getElementById('swarm-final-output');

      runBtn.disabled = true;
      runBtn.innerText = 'Swarm Executing...';
      resultsCard.style.display = 'block';
      badge.className = 'badge badge-purple';
      badge.innerText = 'Swarm In Flight...';
      subContainer.innerHTML = '<div style="color:var(--text-muted)">Coordinating subagents in parallel...</div>';
      finalOut.innerText = 'Synthesizing verified solution...';

      const start = Date.now();
      try {
        const res = await fetch('/api/swarm/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topology: activeSwarmTopology,
            task: task,
          }),
        });

        const data = await res.json();
        const duration = Date.now() - start;

        if (data.error) {
          badge.className = 'badge badge-purple';
          badge.innerText = 'Failed';
          finalOut.innerText = 'Error: ' + data.error;
          return;
        }

        badge.className = 'badge badge-success';
        badge.innerText = 'Completed in ' + duration + 'ms';

        if (data.subagentResults && data.subagentResults.length > 0) {
          subContainer.innerHTML = data.subagentResults.map(sub => \`
            <div style="background: #0d131f; border: 1px solid var(--card-border); border-radius: 8px; padding: 1rem;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <strong style="color: #60a5fa;">\${escapeHtml(sub.role)}</strong>
                <span class="badge badge-blue tabular-nums">\${sub.durationMs}ms</span>
              </div>
              <div style="font-size: 0.825rem; color: #d1d5db; max-height: 140px; overflow-y: auto; white-space: pre-wrap; font-family: var(--font-mono);">\${escapeHtml(sub.output)}</div>
            </div>
          \`).join('');
        } else {
          subContainer.innerHTML = '<div style="color:var(--text-muted)">Single pipeline synthesis</div>';
        }

        finalOut.innerText = data.finalOutput || JSON.stringify(data, null, 2);
      } catch (err) {
        badge.innerText = 'Error';
        finalOut.innerText = 'Execution failure: ' + err.message;
      } finally {
        runBtn.disabled = false;
        runBtn.innerText = 'Launch Swarm Mission';
      }
    }

    // MCP Controller
    async function loadMcpTools() {
      const container = document.getElementById('mcp-tools-list');
      if (!container) return;
      container.innerHTML = '<div style="color: var(--text-muted);">Fetching registered MCP tools...</div>';

      try {
        const res = await fetch('/api/mcp/tools');
        const data = await res.json();
        const tools = data.tools || [];

        if (tools.length === 0) {
          container.innerHTML = '<div style="color: var(--text-muted);">No MCP tools exposed yet. Register procedural skills to expose them.</div>';
          return;
        }

        container.innerHTML = tools.map(t => \`
          <div style="background: #0d131f; border: 1px solid var(--card-border); border-radius: 8px; padding: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <strong style="color: #34d399; font-family: var(--font-mono);">\${escapeHtml(t.name)}</strong>
              <button class="btn" style="padding: 0.2rem 0.5rem; font-size: 0.7rem;" onclick="callMcpToolPrompt('\${escapeHtml(t.name)}')">Call Tool</button>
            </div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem;">\${escapeHtml(t.description)}</div>
          </div>
        \`).join('');
      } catch (err) {
        container.innerHTML = '<div style="color: #ef4444;">Failed to load MCP tools: ' + err.message + '</div>';
      }
    }

    async function callMcpToolPrompt(toolName) {
      const argsStr = prompt('Enter JSON arguments for MCP tool "' + toolName + '":', '{}');
      if (argsStr === null) return;
      let args = {};
      try {
        args = JSON.parse(argsStr);
      } catch (e) {
        alert('Invalid JSON: ' + e.message);
        return;
      }

      try {
        const res = await fetch('/api/mcp/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: { name: toolName, arguments: args }
          })
        });
        const rpcRes = await res.json();
        alert('MCP Result:\\n' + JSON.stringify(rpcRes, null, 2));
      } catch (e) {
        alert('RPC Error: ' + e.message);
      }
    }

    async function importMcpTools() {
      const url = document.getElementById('mcp-import-url').value.trim();
      const prefix = document.getElementById('mcp-import-prefix').value.trim() || 'mcp';
      const statusDiv = document.getElementById('mcp-import-status');
      if (!url) {
        alert('Please enter a valid remote MCP endpoint URL');
        return;
      }

      statusDiv.style.display = 'block';
      statusDiv.style.color = '#38bdf8';
      statusDiv.innerText = 'Connecting to ' + url + ' and discovering tools...';

      try {
        const res = await fetch('/api/mcp/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, prefix })
        });
        const data = await res.json();
        if (data.error) {
          statusDiv.style.color = '#ef4444';
          statusDiv.innerText = 'Import error: ' + data.error;
          return;
        }

        statusDiv.style.color = '#34d399';
        statusDiv.innerText = 'Successfully imported ' + (data.importedSkills ? data.importedSkills.length : 0) + ' remote tools!';
        loadMcpTools();
        loadSkills();
        loadStats();
      } catch (e) {
        statusDiv.style.color = '#ef4444';
        statusDiv.innerText = 'Import failure: ' + e.message;
      }
    }

    // Semantic Memory Controller
    async function loadFacts() {
      const container = document.getElementById('facts-list-container');
      if (!container) return;
      container.innerHTML = '<div style="color: var(--text-muted);">Loading semantic facts...</div>';

      const catFilter = document.getElementById('fact-filter-category').value;
      const url = catFilter ? '/api/facts?category=' + encodeURIComponent(catFilter) : '/api/facts';

      try {
        const res = await fetch(url);
        const facts = await res.json();

        if (facts.length === 0) {
          container.innerHTML = '<div style="color: var(--text-muted); padding: 1rem 0;">No semantic facts recorded in this category. Use the form on the left to add one!</div>';
          return;
        }

        container.innerHTML = facts.map(f => \`
          <div style="background: #0d131f; border: 1px solid var(--card-border); border-radius: 8px; padding: 1rem; display: flex; justify-content: space-between; align-items: start; gap: 1rem;">
            <div style="flex: 1;">
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem;">
                <span class="badge \${f.category === 'user_preference' ? 'badge-blue' : f.category === 'system_rule' ? 'badge-purple' : 'badge-success'}">\${escapeHtml(f.category)}</span>
                <strong style="color: #38bdf8; font-family: var(--font-mono); font-size: 0.9rem;">\${escapeHtml(f.key)}</strong>
                <span style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);">Score: \${f.confidence}</span>
              </div>
              <div style="font-size: 0.875rem; color: #e5e7eb; line-height: 1.4; margin-bottom: 0.4rem;">\${escapeHtml(f.value)}</div>
              <div style="font-size: 0.725rem; color: var(--text-muted); font-family: var(--font-mono);">ID: \${escapeHtml(f.id)}</div>
            </div>
            <button class="btn" style="background: #dc2626; padding: 0.3rem 0.6rem; font-size: 0.75rem;" onclick="deleteFact('\${escapeHtml(f.id)}')">Delete</button>
          </div>
        \`).join('');
      } catch (err) {
        container.innerHTML = '<div style="color: #ef4444;">Failed to load facts: ' + err.message + '</div>';
      }
    }

    async function searchFacts() {
      const q = document.getElementById('fact-search-input').value.trim();
      if (!q) {
        loadFacts();
        return;
      }

      const container = document.getElementById('facts-list-container');
      container.innerHTML = '<div style="color: var(--text-muted);">Searching knowledge with FTS5...</div>';

      try {
        const catFilter = document.getElementById('fact-filter-category').value;
        const url = '/api/facts/search?q=' + encodeURIComponent(q) + (catFilter ? '&category=' + encodeURIComponent(catFilter) : '');
        const res = await fetch(url);
        const facts = await res.json();

        if (facts.length === 0) {
          container.innerHTML = '<div style="color: var(--text-muted); padding: 1rem 0;">No matching facts found for "' + escapeHtml(q) + '".</div>';
          return;
        }

        container.innerHTML = facts.map(f => \`
          <div style="background: #0d131f; border: 1px solid var(--card-border); border-radius: 8px; padding: 1rem; display: flex; justify-content: space-between; align-items: start; gap: 1rem;">
            <div style="flex: 1;">
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem;">
                <span class="badge \${f.category === 'user_preference' ? 'badge-blue' : f.category === 'system_rule' ? 'badge-purple' : 'badge-success'}">\${escapeHtml(f.category)}</span>
                <strong style="color: #38bdf8; font-family: var(--font-mono); font-size: 0.9rem;">\${escapeHtml(f.key)}</strong>
              </div>
              <div style="font-size: 0.875rem; color: #e5e7eb; line-height: 1.4;">\${escapeHtml(f.value)}</div>
            </div>
            <button class="btn" style="background: #dc2626; padding: 0.3rem 0.6rem; font-size: 0.75rem;" onclick="deleteFact('\${escapeHtml(f.id)}')">Delete</button>
          </div>
        \`).join('');
      } catch (err) {
        container.innerHTML = '<div style="color: #ef4444;">Search error: ' + err.message + '</div>';
      }
    }

    async function saveNewFact() {
      const category = document.getElementById('fact-new-category').value;
      const key = document.getElementById('fact-new-key').value.trim();
      const value = document.getElementById('fact-new-value').value.trim();
      const confidence = parseFloat(document.getElementById('fact-new-confidence').value) || 1.0;
      const statusDiv = document.getElementById('fact-save-status');

      if (!key || !value) {
        alert('Please provide both Key and Value for the fact.');
        return;
      }

      statusDiv.style.display = 'block';
      statusDiv.style.color = '#38bdf8';
      statusDiv.innerText = 'Saving fact into semantic memory...';

      try {
        const res = await fetch('/api/facts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, key, value, confidence }),
        });
        const data = await res.json();

        if (data.error) {
          statusDiv.style.color = '#ef4444';
          statusDiv.innerText = 'Error: ' + data.error;
          return;
        }

        statusDiv.style.color = '#34d399';
        statusDiv.innerText = 'Fact saved successfully!';
        document.getElementById('fact-new-key').value = '';
        document.getElementById('fact-new-value').value = '';
        setTimeout(() => { statusDiv.style.display = 'none'; }, 3000);

        loadFacts();
        loadStats();
      } catch (err) {
        statusDiv.style.color = '#ef4444';
        statusDiv.innerText = 'Failed: ' + err.message;
      }
    }

    async function deleteFact(factId) {
      if (!confirm('Are you sure you want to delete this fact from semantic memory?')) return;

      try {
        const res = await fetch('/api/facts?id=' + encodeURIComponent(factId), {
          method: 'DELETE',
        });
        const data = await res.json();
        if (data.success) {
          loadFacts();
          loadStats();
        } else {
          alert('Could not delete fact.');
        }
      } catch (err) {
        alert('Delete failed: ' + err.message);
      }
    }

    // 3D Talon Core Mini Hologram
    function init3DHero() {
      const cvs = document.getElementById('talon3DHeroCanvas');
      if (!cvs) return;
      const c = cvs.getContext('2d');
      const w = cvs.width, h = cvs.height, cx = w/2, cy = h/2;
      let angle = 0;

      function draw3D() {
        angle += 0.025;
        c.clearRect(0, 0, w, h);

        // Core Quantum Glow
        const rad = 42 + Math.sin(angle * 2.5) * 2;
        // Fast path left
        c.beginPath();
        c.arc(cx, cy, rad, Math.PI * 0.5, Math.PI * 1.5);
        c.fillStyle = '#00f2fe';
        c.shadowBlur = 18;
        c.shadowColor = '#00f2fe';
        c.fill();

        // Slow path right
        c.beginPath();
        c.arc(cx, cy, rad, Math.PI * 1.5, Math.PI * 0.5);
        c.fillStyle = '#d946ef';
        c.shadowBlur = 18;
        c.shadowColor = '#d946ef';
        c.fill();
        c.shadowBlur = 0;

        // Center white node
        c.beginPath();
        c.arc(cx, cy, 12, 0, Math.PI * 2);
        c.fillStyle = '#ffffff';
        c.fill();

        // Orbiting Claws
        for (let i = 0; i < 3; i++) {
          const a = angle + (i * Math.PI * 2) / 3;
          const x = cx + Math.cos(a) * 78;
          const y = cy + Math.sin(a) * 32;
          c.beginPath();
          c.arc(x, y, 5, 0, Math.PI * 2);
          c.fillStyle = i % 2 === 0 ? '#38bdf8' : '#c084fc';
          c.shadowBlur = 10;
          c.shadowColor = c.fillStyle;
          c.fill();
          c.shadowBlur = 0;

          // Talon link
          c.beginPath();
          c.moveTo(cx, cy);
          c.lineTo(x, y);
          c.strokeStyle = 'rgba(71, 85, 105, 0.4)';
          c.lineWidth = 2;
          c.stroke();
        }

        requestAnimationFrame(draw3D);
      }
      draw3D();
    }

    // Auto-load on startup
    loadStats();
    init3DHero();
  </script>
</body>
</html>
`;
}
