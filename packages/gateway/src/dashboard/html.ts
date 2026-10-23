export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenTalon — Dual-Brain AI Agent Cockpit (Hermes × OpenClaw)</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Crect width='512' height='512' rx='116' fill='%23070a12'/%3E%3Cpolygon points='256,36 446,146 446,366 256,476 66,366 66,146' fill='none' stroke='%2310b981' stroke-width='8' stroke-dasharray='16 10'/%3E%3Cpath d='M190,235 L42,132 L78,188 L178,252 Z' fill='%2300f2fe'/%3E%3Cpath d='M322,235 L470,132 L434,188 L334,252 Z' fill='%23f59e0b'/%3E%3Cpath d='M256,184 A80,80 0 0,0 256,344 Z' fill='%2300f2fe'/%3E%3Cpath d='M256,184 A80,80 0 0,1 256,344 Z' fill='%23d946ef'/%3E%3Ccircle cx='256' cy='264' r='28' fill='%23fff'/%3E%3Cpath d='M226,74 L256,108 L286,74 L276,136 L256,198 L236,136 Z' fill='%23334155' stroke='%2300f2fe' stroke-width='6'/%3E%3C/svg%3E">
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
      <svg viewBox="0 0 512 512" width="38" height="38" style="filter: drop-shadow(0 0 8px rgba(0, 242, 254, 0.7)); flex-shrink: 0;">
        <defs>
          <linearGradient id="hbFast" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#00f2fe"/><stop offset="100%" stop-color="#0051ff"/></linearGradient>
          <linearGradient id="hbSlow" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f59e0b"/><stop offset="50%" stop-color="#ec4899"/><stop offset="100%" stop-color="#8b5cf6"/></linearGradient>
          <linearGradient id="hbClaw" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#64748b"/><stop offset="100%" stop-color="#0f172a"/></linearGradient>
        </defs>
        <!-- Zero-Trust Hexagonal Sandbox Shield -->
        <polygon points="256,32 452,145 452,367 256,480 60,367 60,145" fill="none" stroke="#10b981" stroke-width="10" stroke-dasharray="22 14" opacity="0.7"/>
        <!-- Hermes Cybernetic Talaria Wings -->
        <path d="M 188,236 L 34,128 L 74,190 L 176,256 Z" fill="url(#hbFast)"/>
        <path d="M 180,262 L 22,204 L 64,252 L 174,282 Z" fill="url(#hbFast)" opacity="0.85"/>
        <path d="M 324,236 L 478,128 L 438,190 L 336,256 Z" fill="url(#hbSlow)"/>
        <path d="M 332,262 L 490,204 L 448,252 L 338,282 Z" fill="url(#hbSlow)" opacity="0.85"/>
        <!-- Caduceus Orbital Helices -->
        <ellipse cx="256" cy="264" rx="148" ry="52" fill="none" stroke="url(#hbFast)" stroke-width="10" stroke-dasharray="24 14" transform="rotate(-26 256 264)"/>
        <ellipse cx="256" cy="264" rx="148" ry="52" fill="none" stroke="url(#hbSlow)" stroke-width="10" stroke-dasharray="24 14" transform="rotate(26 256 264)"/>
        <!-- Dual-Brain Core -->
        <path d="M 256,184 A 80,80 0 0,0 256,344 Z" fill="url(#hbFast)"/>
        <path d="M 256,184 A 80,80 0 0,1 256,344 Z" fill="url(#hbSlow)"/>
        <circle cx="256" cy="264" r="28" fill="#ffffff"/>
        <!-- OpenClaw Titanium Talons -->
        <polygon points="256,38 278,66 256,92 234,66" fill="url(#hbSlow)"/>
        <path d="M 226,74 L 256,110 L 286,74 L 276,136 L 256,196 L 236,136 Z" fill="url(#hbClaw)" stroke="#38bdf8" stroke-width="6"/>
        <g transform="rotate(-42 256 264)"><path d="M 232,88 L 256,128 L 280,94 L 270,152 L 256,204 L 242,152 Z" fill="url(#hbClaw)" stroke="#00f2fe" stroke-width="6"/></g>
        <g transform="rotate(42 256 264)"><path d="M 232,88 L 256,128 L 280,94 L 270,152 L 256,204 L 242,152 Z" fill="url(#hbClaw)" stroke="#f59e0b" stroke-width="6"/></g>
      </svg>
      <span>Open<span style="color: #00f2fe;">Talon</span></span>
      <span class="brand-badge">Hermes × OpenClaw</span>
      <a href="/showcase" target="_blank" class="brand-badge" style="text-decoration: none; margin-left: 0.5rem; background: linear-gradient(135deg, #00f2fe, #d946ef);" title="Open Standalone 3D Holographic Core">3D Core ↗</a>
    </div>
    <nav>
      <button class="tab-btn active" onclick="switchTab('overview')">Overview</button>
      <button class="tab-btn" onclick="switchTab('traces')">Episodic Traces</button>
      <button class="tab-btn" onclick="switchTab('skills')">Procedural Skills</button>
      <button class="tab-btn" onclick="switchTab('swarm')">Swarm Topologies</button>
      <button class="tab-btn" onclick="switchTab('mcp')">MCP Hub</button>
      <button class="tab-btn" onclick="switchTab('facts')">Semantic Memory</button>
      <button class="tab-btn" onclick="switchTab('chat')">Live Playground</button>
      <button class="tab-btn" onclick="switchTab('automations')">Automations & Cron</button>
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
        <div class="stat-card">
          <div class="stat-label">KV-Cache &amp; Prefix Saved</div>
          <div class="stat-value tabular-nums" id="stat-tokens-saved">0 <span style="font-size: 1rem; color: var(--text-muted);">tokens</span></div>
          <div class="stat-desc" id="stat-cache-hits-desc">Canonical prefix &amp; cachedContent hits: 0</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Avg System-2 Thinking</div>
          <div class="stat-value tabular-nums" id="stat-avg-thinking">0 <span style="font-size: 1rem; color: var(--text-muted);">tokens</span></div>
          <div class="stat-desc">O(1) Dynamic Entropy Budgeter</div>
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

      <div class="card" style="margin-top: 1.5rem;">
        <div class="card-title" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
          <span>Autonomous Cognitive Evolution (Hermes Slow Path)</span>
          <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
            <span id="evolution-status-badge" class="badge badge-success">Idle</span>
            <select id="evolution-draft-count" class="chat-input" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; width: auto;">
              <option value="1">1x Single Synthesis</option>
              <option value="3" selected>3x Speculative Multi-Draft (Sandbox Benchmarked)</option>
            </select>
            <button class="btn" id="run-evolution-btn" style="padding: 0.35rem 0.75rem; font-size: 0.75rem; background: linear-gradient(135deg, #d946ef, #8b5cf6);" onclick="runManualEvolution()">Trigger Evolution Cycle</button>
          </div>
        </div>
        <p style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.75rem;">
          The Slow Path autonomously inspects failure traces, clusters frequent unhandled prompts, triggers heuristic reflection, and synthesizes new skills or patches existing ones under Zero-Trust sandbox verification.
        </p>
        <div id="evolution-report-box" style="display: none; margin-top: 1rem; border-top: 1px solid var(--card-border); padding-top: 1rem;">
          <div style="font-weight: 700; color: #d946ef; font-size: 0.85rem; margin-bottom: 0.5rem;">Latest Evolution Report:</div>
          <pre id="evolution-report-pre" style="max-height: 240px;"></pre>
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
      <div class="card" id="new-skill-card" style="display: none; margin-bottom: 1.5rem;">
        <div class="card-title" style="display: flex; justify-content: space-between; align-items: center;">
          <span>Register New Skill (SKILL.md)</span>
          <button class="btn" style="padding: 0.35rem 0.75rem; font-size: 0.75rem; background: #374151;" onclick="closeNewSkillModal()">Cancel</button>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.75rem;">
          Paste a complete <code>SKILL.md</code> definition (with YAML frontmatter, capabilities, and JavaScript implementation). It will be statically validated, tested in the Zero-Trust Sandbox, and registered into procedural memory:
        </p>
        <textarea id="new-skill-markdown" style="width: 100%; height: 220px; background: #0d131f; border: 1px solid var(--card-border); color: #fff; padding: 0.75rem; border-radius: 8px; font-family: var(--font-mono); font-size: 0.85rem; margin-bottom: 0.75rem;" placeholder="---&#10;name: my_new_skill&#10;version: 1.0.0&#10;description: &quot;A new skill&quot;&#10;capabilities: {}&#10;---&#10;&#10;# my_new_skill&#10;Description...&#10;&#10;## Implementation&#10;&#96;&#96;&#96;javascript&#10;export default async function run(args) {&#10;  return { result: true };&#10;}&#10;&#96;&#96;&#96;"></textarea>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <button class="btn" onclick="saveNewSkill()">Verify & Commit into Memory</button>
          <div id="new-skill-status" style="font-size: 0.8rem; display: none;"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title" style="display: flex; justify-content: space-between; align-items: center;">
          <span>Registered Procedural Skills</span>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn" style="padding: 0.35rem 0.75rem; font-size: 0.75rem; background: #10b981;" onclick="openNewSkillModal()">+ Register New Skill</button>
            <button class="btn" style="padding: 0.35rem 0.75rem; font-size: 0.75rem;" onclick="loadSkills()">Refresh</button>
          </div>
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
            <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
              <input type="text" id="fact-search-input" class="chat-input" placeholder="Search facts..." style="width: 150px; padding: 0.4rem 0.75rem; font-size: 0.825rem;" onkeydown="if(event.key==='Enter') searchFacts()" />
              <select id="fact-filter-category" class="chat-input" style="padding: 0.4rem 0.75rem; font-size: 0.825rem;" onchange="loadFacts()">
                <option value="">All Categories</option>
                <option value="user_preference">User Preferences</option>
                <option value="system_rule">System Rules</option>
                <option value="domain_knowledge">Domain Knowledge</option>
                <option value="developer_habit">Developer Habits</option>
                <option value="grounded_research">Grounded Web Research</option>
              </select>
              <button class="btn" style="padding: 0.4rem 0.75rem; font-size: 0.825rem;" onclick="loadFacts()">Refresh</button>
              <button class="btn" style="background: #334155; padding: 0.4rem 0.75rem; font-size: 0.825rem;" onclick="exportMemorySnapshot()" title="Export JSON memory snapshot">Export</button>
              <button class="btn" style="background: #334155; padding: 0.4rem 0.75rem; font-size: 0.825rem;" onclick="promptImportMemorySnapshot()" title="Import JSON memory snapshot">Import</button>
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
        <div style="padding: 0.75rem 1.25rem; background: #0d131f; border-bottom: 1px solid var(--card-border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 1rem; font-size: 0.85rem; flex-wrap: wrap;">
            <span style="font-weight: 600; color: #f3f4f6;">Live Agent Chat</span>
            <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer; user-select: none;">
              <input type="checkbox" id="chat-grounding-toggle" style="cursor: pointer;" />
              <span style="color: #60a5fa; font-weight: 500;">🌐 Google Search Grounding</span>
            </label>
            <label style="display: flex; align-items: center; gap: 0.4rem; user-select: none;">
              <span style="color: #a78bfa; font-weight: 500;">🧠 Thinking Budget:</span>
              <select id="chat-thinking-mode" class="chat-input" style="padding: 0.2rem 0.5rem; font-size: 0.78rem; width: auto;">
                <option value="auto">Auto (O(1) Entropy)</option>
                <option value="fast">Fast (0 - 2K tokens)</option>
                <option value="balanced">Balanced (8K tokens)</option>
                <option value="deep">Deep System-2 (32K tokens)</option>
              </select>
            </label>
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">
            Fast Path &lt;1,500 tokens | Gemini Agent Booster v0.3.0
          </div>
        </div>
        <div class="chat-messages" id="chat-messages">
          <div class="message message-assistant">
            Hello! I am OpenTalon. Ask me anything, or try triggering one of my registered procedural skills (e.g. currency conversion, CSV processing, or statistical calculations).
          </div>
        </div>
        <div id="chat-attachments-bar" style="display: none; padding: 0.5rem 1.25rem; background: #111827; border-top: 1px solid var(--card-border); gap: 0.5rem; flex-wrap: wrap; align-items: center;"></div>
        <div class="chat-input-bar">
          <input type="file" id="chat-file-input" accept="image/*,application/pdf,audio/*" multiple style="display: none;" onchange="handleChatFileUpload(event)" />
          <button class="btn" style="background: #1f2937; border: 1px solid var(--card-border); padding: 0.75rem 1rem;" onclick="document.getElementById('chat-file-input').click()" title="Attach Image, Screenshot, PDF, or Audio for Gemini Multimodal Grounding">📎 Attach</button>
          <input type="text" id="chat-input" class="chat-input" placeholder="Type a message, attach a screenshot/PDF, or trigger a skill..." onkeydown="if(event.key==='Enter') sendMessage()" />
          <button class="btn" onclick="sendMessage()">Send</button>
        </div>
      </div>
    </section>

    <!-- TAB 8: AGENT CRON & AUTONOMOUS AUTOMATIONS -->
    <section id="automations" class="tab-content">
      <!-- Proactive Heartbeat Alert Banner -->
      <div id="cron-alert-banner" style="display: none; background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 12px; padding: 1rem 1.5rem; margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <span style="font-size: 1.25rem;">⏰</span>
          <div>
            <div style="font-weight: 700; color: #34d399;" id="cron-alert-title">Proactive Watcher Event</div>
            <div style="font-size: 0.85rem; color: var(--text-muted);" id="cron-alert-desc">OpenTalon executed a background job automatically.</div>
          </div>
        </div>
        <button class="btn" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; background: #374151;" onclick="dismissCronAlert()">Dismiss</button>
      </div>

      <!-- Quick Preset Cards -->
      <div class="card" style="margin-bottom: 1.5rem;">
        <div class="card-title" style="display: flex; justify-content: space-between; align-items: center;">
          <span>⚡ Instant Automation Presets</span>
          <span class="badge badge-success">Zero-Config Templates</span>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">
          Click any preset to prefill and configure an autonomous background routine immediately:
        </p>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem;">
          <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--card-border); border-radius: 8px; padding: 1rem; cursor: pointer; transition: all 0.2s ease;" onclick="applyAutomationPreset('hourly-health-check', '@hourly', 'skill', 'http_json_fetcher', { url: 'http://127.0.0.1:3100/health' })" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--card-border)'">
            <div style="font-weight: 700; font-size: 0.9rem; color: #38bdf8; margin-bottom: 0.25rem;">🩺 Hourly Health Check</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem;">Direct Skill Action (0 tokens) — verifies endpoint availability every hour.</div>
            <span class="badge badge-blue">@hourly • Skill</span>
          </div>
          <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--card-border); border-radius: 8px; padding: 1rem; cursor: pointer; transition: all 0.2s ease;" onclick="applyAutomationPreset('daily-system-digest', '@daily', 'prompt', '', { prompt: 'Analyze recent traces, memory facts, and generate a daily operational digest.' })" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--card-border)'">
            <div style="font-weight: 700; font-size: 0.9rem; color: #a78bfa; margin-bottom: 0.25rem;">📊 Daily Operational Digest</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem;">Fast Path Prompt — synthesizes execution statistics and health report.</div>
            <span class="badge badge-purple">@daily • Prompt</span>
          </div>
          <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--card-border); border-radius: 8px; padding: 1rem; cursor: pointer; transition: all 0.2s ease;" onclick="applyAutomationPreset('periodic-watcher-30s', 'every 30s', 'prompt', '', { prompt: 'Scan for system anomalies and report status.' })" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--card-border)'">
            <div style="font-weight: 700; font-size: 0.9rem; color: #34d399; margin-bottom: 0.25rem;">⏱️ 30s Rapid Watcher</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem;">Short interval test — runs every 30 seconds for live monitoring.</div>
            <span class="badge badge-success">every 30s • Prompt</span>
          </div>
        </div>
      </div>

      <!-- New Automation Form Modal/Drawer -->
      <div class="card" id="new-cron-card" style="display: none; margin-bottom: 1.5rem; border-color: var(--primary);">
        <div class="card-title" style="display: flex; justify-content: space-between; align-items: center;">
          <span id="cron-form-title">Register Autonomous Background Job</span>
          <button class="btn" style="padding: 0.35rem 0.75rem; font-size: 0.75rem; background: #374151;" onclick="closeNewCronModal()">Cancel</button>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
          <div>
            <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.35rem;">Job Name (Unique slug):</label>
            <input type="text" id="cron-name-input" class="chat-input" placeholder="e.g. hourly-backup" style="width: 100%;" />
          </div>
          <div>
            <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.35rem;">Schedule (Cron / Natural Interval):</label>
            <input type="text" id="cron-expr-input" class="chat-input" placeholder="e.g. */15 * * * * or @hourly or every 30m" style="width: 100%;" />
          </div>
        </div>

        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.35rem;">Action Routing Mode:</label>
          <div style="display: flex; gap: 1.5rem; align-items: center;">
            <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; cursor: pointer;">
              <input type="radio" name="cronActionType" value="prompt" checked onchange="toggleCronActionTypeInputs()" />
              <span>Prompt Action (Fast Path AI Reasoning, &lt;1,500 tokens)</span>
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; cursor: pointer;">
              <input type="radio" name="cronActionType" value="skill" onchange="toggleCronActionTypeInputs()" />
              <span>Direct Skill Action (Zero-Trust Sandbox, 0 tokens)</span>
            </label>
          </div>
        </div>

        <!-- Prompt Payload Field -->
        <div id="cron-prompt-field" style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.35rem;">AI Prompt Instruction:</label>
          <textarea id="cron-prompt-input" class="chat-input" rows="3" placeholder="Enter instructions for the agent to execute on schedule..." style="width: 100%; font-family: var(--font-sans);"></textarea>
        </div>

        <!-- Skill Payload Fields -->
        <div id="cron-skill-field" style="display: none; margin-bottom: 1rem;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div>
              <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.35rem;">Skill Name:</label>
              <input type="text" id="cron-skill-name-input" class="chat-input" placeholder="e.g. http_json_fetcher" style="width: 100%;" />
            </div>
            <div>
              <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.35rem;">JSON Arguments (args):</label>
              <input type="text" id="cron-skill-args-input" class="chat-input" placeholder='{"url": "https://..."}' style="width: 100%; font-family: var(--font-mono);" />
            </div>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
          <button class="btn" style="background: #374151; padding: 0.5rem 1rem;" onclick="closeNewCronModal()">Cancel</button>
          <button class="btn" style="padding: 0.5rem 1.25rem;" onclick="submitNewCronJob()">Save & Activate Automation</button>
        </div>
      </div>

      <!-- Active Automations Table -->
      <div class="card">
        <div class="card-title" style="display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span>Active Scheduled Automations</span>
            <span id="cron-active-count-badge" class="badge badge-blue">0 Jobs</span>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn" style="padding: 0.35rem 0.75rem; font-size: 0.75rem;" onclick="openNewCronModal()">+ New Automation</button>
            <button class="btn" style="background: #374151; padding: 0.35rem 0.75rem; font-size: 0.75rem;" onclick="loadAutomations()">Refresh</button>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Name</th>
              <th>Schedule</th>
              <th>Action Type</th>
              <th>Next Run</th>
              <th>Last Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="cron-jobs-table-body">
            <tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Loading background automations...</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Recent Execution Logs Drawer -->
      <div class="card" style="margin-top: 1.5rem;">
        <div class="card-title" style="display: flex; justify-content: space-between; align-items: center;">
          <span>Execution History & Audit Logs</span>
          <button class="btn" style="padding: 0.35rem 0.75rem; font-size: 0.75rem; background: #374151;" onclick="loadCronLogs()">Refresh Logs</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Job ID</th>
              <th>Time</th>
              <th>Duration</th>
              <th>Tokens</th>
              <th>Status</th>
              <th>Output / Error</th>
            </tr>
          </thead>
          <tbody id="cron-logs-table-body">
            <tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No background execution logs yet.</td></tr>
          </tbody>
        </table>
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
      if (tabId === 'automations') loadAutomations();
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
        if (data.booster) {
          const savedEl = document.getElementById('stat-tokens-saved');
          const hitsDescEl = document.getElementById('stat-cache-hits-desc');
          const avgThinkEl = document.getElementById('stat-avg-thinking');
          if (savedEl) {
            savedEl.innerHTML = (data.booster.estimatedTokensSaved || 0).toLocaleString() + ' <span style="font-size: 1rem; color: var(--text-muted);">tokens</span>';
          }
          if (hitsDescEl) {
            const totalHits = (data.booster.prefixHits || 0) + (data.booster.cacheHits || 0);
            hitsDescEl.innerText = 'Canonical prefix & cachedContent hits: ' + totalHits;
          }
          if (avgThinkEl) {
            avgThinkEl.innerHTML = (data.booster.avgThinkingBudget || 0).toLocaleString() + ' <span style="font-size: 1rem; color: var(--text-muted);">tokens</span>';
          }
        }
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
              <button class="btn" style="background: #dc2626; padding: 0.25rem 0.6rem; font-size: 0.725rem; margin-left: 0.25rem;" onclick="deleteSkill('\${s.name}')">Delete</button>
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

    let conversationHistory = [];
    let pendingAttachments = [];

    function handleChatFileUpload(event) {
      const files = Array.from(event.target.files || []);
      for (const file of files) {
        const reader = new FileReader();
        reader.onload = () => {
          const resultStr = String(reader.result || '');
          const base64Data = resultStr.replace(/^data:[^;]+;base64,/, '');
          pendingAttachments.push({
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            data: base64Data,
          });
          renderPendingAttachments();
        };
        reader.readAsDataURL(file);
      }
      event.target.value = '';
    }

    function removePendingAttachment(idx) {
      pendingAttachments.splice(idx, 1);
      renderPendingAttachments();
    }

    function renderPendingAttachments() {
      const bar = document.getElementById('chat-attachments-bar');
      if (!bar) return;
      if (pendingAttachments.length === 0) {
        bar.style.display = 'none';
        bar.innerHTML = '';
        return;
      }
      bar.style.display = 'flex';
      bar.innerHTML = pendingAttachments.map((att, idx) =>
        '<span class="badge badge-blue" style="display: inline-flex; align-items: center; gap: 0.4rem;">📎 ' +
        escapeHtml(att.name || att.mimeType) +
        ' <button onclick="removePendingAttachment(' + idx + ')" style="background:none;border:none;color:#fff;cursor:pointer;font-weight:bold;">×</button></span>'
      ).join('');
    }

    async function sendMessage() {
      const input = document.getElementById('chat-input');
      const text = input.value.trim();
      if (!text && pendingAttachments.length === 0) return;
      input.value = '';
      const currentAttachments = [...pendingAttachments];
      pendingAttachments = [];
      renderPendingAttachments();

      const container = document.getElementById('chat-messages');
      const attachBadgeHtml = currentAttachments.length > 0
        ? '<div style="margin-top:0.35rem;font-size:0.75rem;opacity:0.85;">' + currentAttachments.map(a => '📎 ' + escapeHtml(a.name || a.mimeType)).join(' &bull; ') + '</div>'
        : '';
      container.innerHTML += \`<div class="message message-user">\${escapeHtml(text || '[Multimodal Attachment]')}\${attachBadgeHtml}</div>\`;
      
      const assistantMsg = document.createElement('div');
      assistantMsg.className = 'message message-assistant';
      assistantMsg.innerHTML = '<em>OpenTalon is thinking...</em>';
      container.appendChild(assistantMsg);
      container.scrollTop = container.scrollHeight;

      conversationHistory.push({ role: 'user', content: text, attachments: currentAttachments.length > 0 ? currentAttachments : undefined });

      try {
        const groundingEnabled = document.getElementById('chat-grounding-toggle')?.checked || false;
        const thinkingModeSelect = document.getElementById('chat-thinking-mode')?.value || 'auto';
        let thinkingConfig = undefined;
        if (thinkingModeSelect === 'fast') thinkingConfig = { thinkingBudget: 0, mode: 'fast' };
        else if (thinkingModeSelect === 'balanced') thinkingConfig = { thinkingBudget: 8192, mode: 'balanced' };
        else if (thinkingModeSelect === 'deep') thinkingConfig = { thinkingBudget: 32768, mode: 'deep' };

        const response = await fetch('/v1/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: text || 'Analyze the attached multimodal content.',
            attachments: currentAttachments.length > 0 ? currentAttachments : undefined,
            sessionId: 'dashboard_sess',
            history: conversationHistory.slice(-10),
            enableSearchGrounding: groundingEnabled,
            thinkingConfig,
          })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedText = '';
        let firstChunk = true;
        let groundingData = null;
        let cacheHitId = null;
        let boosterData = null;

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
                if (data.webSearchQueries || data.sources) {
                  groundingData = data;
                }
                if (data.cacheId) {
                  cacheHitId = data.cacheId;
                }
                if (data.thinkingTier !== undefined) {
                  boosterData = data;
                }
              } catch (e) {}
            }
          }
        }
        if (accumulatedText) {
          conversationHistory.push({ role: 'assistant', content: accumulatedText });
        }

        // Render Grounding Citations card if present
        if (groundingData && groundingData.sources && groundingData.sources.length > 0) {
          let sourcesHtml = '<div style="margin-top: 0.75rem; padding: 0.6rem 0.8rem; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 8px; font-size: 0.8rem;">';
          const savedFactsNotice = groundingData.groundedFactsSaved ? ' <span class="badge badge-success" style="font-size:0.68rem;margin-left:0.4rem;">+' + groundingData.groundedFactsSaved + ' Auto-Saved to Memory</span>' : '';
          sourcesHtml += '<div style="font-weight: 600; color: #60a5fa; margin-bottom: 0.35rem;">🌐 Verified Google Search Sources' + savedFactsNotice + '</div>';
          for (const s of groundingData.sources) {
            sourcesHtml += '<div style="margin-bottom: 0.25rem;">• <a href="' + escapeHtml(s.url) + '" target="_blank" style="color: #93c5fd; text-decoration: underline;">' + escapeHtml(s.title || s.url) + '</a></div>';
          }
          sourcesHtml += '</div>';
          assistantMsg.innerHTML += sourcesHtml;
        }

        const badgesHtml = [];
        if (boosterData) {
          badgesHtml.push('<span class="badge badge-blue" style="font-size: 0.72rem;">🧠 Thinking: ' + (boosterData.thinkingBudgetUsed || 0).toLocaleString() + ' tokens (' + escapeHtml(boosterData.thinkingTier) + ')</span>');
        }
        if (cacheHitId) {
          const savedTxt = boosterData && boosterData.tokensSaved ? ' • Saved ~' + boosterData.tokensSaved + ' tokens' : '';
          badgesHtml.push('<span class="badge badge-purple" style="font-size: 0.72rem;">⚡ KV-Cache / Prefix Hit (' + escapeHtml(cacheHitId) + savedTxt + ')</span>');
        }
        if (badgesHtml.length > 0) {
          assistantMsg.innerHTML += '<div style="margin-top: 0.5rem; display: flex; gap: 0.4rem; flex-wrap: wrap;">' + badgesHtml.join('') + '</div>';
        }
        loadStats();
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

    async function exportMemorySnapshot() {
      try {
        const res = await fetch('/api/memory/export?includeTraces=true');
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'opentalon-snapshot-' + Date.now() + '.json';
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        alert('Failed to export snapshot: ' + e.message);
      }
    }

    async function promptImportMemorySnapshot() {
      const jsonStr = prompt('Paste JSON memory snapshot to restore:');
      if (!jsonStr) return;
      try {
        const snapshot = JSON.parse(jsonStr);
        const res = await fetch('/api/memory/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(snapshot),
        });
        const result = await res.json();
        alert('Memory snapshot restored!\\nSkills: ' + result.importedSkills + '\\nFacts: ' + result.importedFacts + '\\nTraces: ' + result.importedTraces);
        loadFacts();
        loadSkills();
        loadStats();
      } catch (e) {
        alert('Import error: ' + e.message);
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

    function openNewSkillModal() {
      document.getElementById('new-skill-card').style.display = 'block';
      document.getElementById('new-skill-markdown').focus();
    }

    function closeNewSkillModal() {
      document.getElementById('new-skill-card').style.display = 'none';
      document.getElementById('new-skill-status').style.display = 'none';
    }

    async function saveNewSkill() {
      const md = document.getElementById('new-skill-markdown').value.trim();
      const statusDiv = document.getElementById('new-skill-status');
      if (!md) {
        alert('Please provide SKILL.md markdown content.');
        return;
      }
      statusDiv.style.display = 'block';
      statusDiv.style.color = '#38bdf8';
      statusDiv.innerText = 'Validating and compiling in Zero-Trust Sandbox...';

      try {
        const res = await fetch('/api/skills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markdown: md }),
        });
        const data = await res.json();
        if (data.error) {
          statusDiv.style.color = '#ef4444';
          statusDiv.innerText = 'Error: ' + data.error;
          return;
        }

        statusDiv.style.color = '#34d399';
        statusDiv.innerText = 'Skill ' + data.skill.name + ' successfully registered!';
        document.getElementById('new-skill-markdown').value = '';
        setTimeout(() => closeNewSkillModal(), 2000);
        loadSkills();
        loadStats();
      } catch (e) {
        statusDiv.style.color = '#ef4444';
        statusDiv.innerText = 'Registration failed: ' + e.message;
      }
    }

    async function deleteSkill(skillName) {
      if (!confirm('Are you sure you want to delete procedural skill "' + skillName + '"?')) return;
      try {
        const res = await fetch('/api/skills?name=' + encodeURIComponent(skillName), { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          loadSkills();
          loadStats();
        } else {
          alert('Could not delete skill: ' + (data.error || 'Unknown'));
        }
      } catch (e) {
        alert('Delete failed: ' + e.message);
      }
    }

    async function runManualEvolution() {
      const btn = document.getElementById('run-evolution-btn');
      const badge = document.getElementById('evolution-status-badge');
      const box = document.getElementById('evolution-report-box');
      const pre = document.getElementById('evolution-report-pre');

      btn.disabled = true;
      btn.innerText = 'Evolving...';
      badge.className = 'badge badge-purple';
      badge.innerText = 'Evolution In Flight';
      box.style.display = 'block';
      pre.innerText = 'Scanning episodic traces and extracting heuristics...';

      try {
        const speculativeDraftCount = parseInt(document.getElementById('evolution-draft-count')?.value || '3', 10);
        const res = await fetch('/api/evolution/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 50, dryRun: false, speculativeDraftCount }),
        });
        const report = await res.json();
        pre.innerText = JSON.stringify(report, null, 2);
        badge.className = 'badge badge-success';
        badge.innerText = 'Evolution Completed';
        loadSkills();
        loadStats();
      } catch (e) {
        badge.className = 'badge badge-purple';
        badge.innerText = 'Failed';
        pre.innerText = 'Evolution error: ' + e.message;
      } finally {
        btn.disabled = false;
        btn.innerText = 'Trigger Evolution Cycle';
      }
    }

    // 3D Holographic Core Renderer (60FPS Interactive Orbit)
    function init3DHero() {
      const canvas = document.getElementById('talon3DHeroCanvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const W = canvas.width;
      const H = canvas.height;
      const CX = W / 2;
      const CY = H / 2;

      let rotX = -0.2;
      let rotY = 0.4;
      let targetRotX = -0.2;
      let targetRotY = 0.4;
      let isDragging = false;
      let lastMouseX = 0;
      let lastMouseY = 0;
      let pulseTime = 0;
      let flashIntensity = 0;

      window.pulse3DHero = function(type) {
        flashIntensity = 1.0;
      };

      // 40 Ambient Orbit Particles
      const particles = [];
      for (let i = 0; i < 40; i++) {
        particles.push({
          theta: Math.random() * Math.PI * 2,
          phi: Math.acos((Math.random() * 2) - 1),
          dist: 85 + Math.random() * 45,
          speed: 0.012 + Math.random() * 0.02,
          size: 1 + Math.random() * 1.8,
          color: Math.random() > 0.5 ? '#00f2fe' : '#d946ef'
        });
      }

      // 5 Talon Claws scaled for 140px widget
      const clawSegments = [
        { baseAngle: 0, length: 95, curvature: 0.65, color: '#38bdf8' },
        { baseAngle: (Math.PI * 2) / 3, length: 90, curvature: 0.6, color: '#00f2fe' },
        { baseAngle: (Math.PI * 4) / 3, length: 90, curvature: 0.6, color: '#d946ef' },
        { baseAngle: (Math.PI / 3), length: 75, curvature: 0.5, color: '#818cf8' },
        { baseAngle: (Math.PI * 5) / 3, length: 75, curvature: 0.5, color: '#c084fc' }
      ];

      function project(x, y, z) {
        const cosY = Math.cos(rotY);
        const sinY = Math.sin(rotY);
        const x1 = x * cosY - z * sinY;
        const z1 = z * cosY + x * sinY;

        const cosX = Math.cos(rotX);
        const sinX = Math.sin(rotX);
        const y2 = y * cosX - z1 * sinX;
        const z2 = z1 * cosX + y * sinX;

        const fov = 400;
        const scale = fov / (fov + z2 + 150);
        return { x: CX + x1 * scale, y: CY + y2 * scale, scale: scale, z: z2 };
      }

      function drawRing(rx, ry, tilt, color, dash) {
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash(dash);
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = color;

        for (let a = 0; a <= Math.PI * 2; a += 0.15) {
          const x = rx * Math.cos(a);
          const y = ry * Math.sin(a) * Math.cos(tilt) - rx * Math.sin(a) * Math.sin(tilt);
          const z = ry * Math.sin(a) * Math.sin(tilt) + rx * Math.cos(a) * Math.cos(tilt);
          const p = project(x, y, z);
          if (a === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }

      function drawClaw(claw, time) {
        const segments = 4;
        const baseDist = 65;
        const angle = claw.baseAngle + Math.sin(time * 0.8) * 0.05;
        const pts = [];

        for (let s = 0; s <= segments; s++) {
          const ratio = s / segments;
          const r = baseDist + ratio * 45;
          const theta = angle + ratio * claw.curvature;
          const x = r * Math.cos(theta);
          const y = -75 + ratio * 85;
          const z = r * Math.sin(theta);
          pts.push(project(x, y, z));
        }

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.lineWidth = 7 * pts[0].scale;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#1e293b';
        ctx.stroke();

        ctx.lineWidth = 3 * pts[0].scale;
        ctx.strokeStyle = '#475569';
        ctx.stroke();

        const tip = pts[pts.length - 1];
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 4 * tip.scale, 0, Math.PI * 2);
        ctx.fillStyle = claw.color;
        ctx.shadowBlur = 10 * tip.scale;
        ctx.shadowColor = claw.color;
        ctx.fill();
        ctx.restore();
      }

      function render() {
        pulseTime += 0.035;
        if (flashIntensity > 0) flashIntensity -= 0.02;

        if (!isDragging) {
          targetRotY += 0.007;
          targetRotX = -0.2 + Math.sin(pulseTime * 0.5) * 0.1;
        }
        rotX += (targetRotX - rotX) * 0.1;
        rotY += (targetRotY - rotY) * 0.1;

        ctx.clearRect(0, 0, W, H);

        // Radial glow
        const glowRad = ctx.createRadialGradient(CX, CY, 0, CX, CY, 130);
        glowRad.addColorStop(0, 'rgba(0, 242, 254, 0.15)');
        glowRad.addColorStop(0.5, 'rgba(217, 70, 239, 0.08)');
        glowRad.addColorStop(1, 'transparent');
        ctx.fillStyle = glowRad;
        ctx.fillRect(0, 0, W, H);

        // Orbiting particles
        for (const p of particles) {
          p.theta += p.speed;
          const px = p.dist * Math.sin(p.phi) * Math.cos(p.theta);
          const py = p.dist * Math.sin(p.phi) * Math.sin(p.theta);
          const pz = p.dist * Math.cos(p.phi);
          const proj = project(px, py, pz);

          ctx.beginPath();
          ctx.arc(proj.x, proj.y, p.size * proj.scale, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.shadowBlur = 6;
          ctx.shadowColor = p.color;
          ctx.fill();
        }

        // Fast & Slow Path Orbital Rings
        const fastGlow = Math.sin(pulseTime * 3) * 0.15 + (flashIntensity * 0.4);
        drawRing(75, 28, -0.4, 'rgba(0, 242, 254, ' + (0.7 + fastGlow) + ')', [12, 8]);
        drawRing(75, 28, 0.5, 'rgba(217, 70, 239, ' + (0.7 + fastGlow) + ')', [12, 8]);

        // Central Singularity Core
        const coreProj = project(0, 0, 0);
        const coreRad = (18 + Math.sin(pulseTime * 2) * 2.5 + flashIntensity * 8) * coreProj.scale;
        const coreGrad = ctx.createRadialGradient(coreProj.x, coreProj.y, 0, coreProj.x, coreProj.y, coreRad);
        coreGrad.addColorStop(0, '#ffffff');
        coreGrad.addColorStop(0.4, '#00f2fe');
        coreGrad.addColorStop(0.8, '#d946ef');
        coreGrad.addColorStop(1, 'transparent');

        ctx.save();
        ctx.beginPath();
        ctx.arc(coreProj.x, coreProj.y, coreRad, 0, Math.PI * 2);
        ctx.fillStyle = coreGrad;
        ctx.shadowBlur = 20 * coreProj.scale;
        ctx.shadowColor = '#00f2fe';
        ctx.fill();
        ctx.restore();

        // 3D Claws
        for (const claw of clawSegments) {
          drawClaw(claw, pulseTime);
        }

        requestAnimationFrame(render);
      }

      // Drag interaction
      canvas.addEventListener('mousedown', function(e) {
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
      });

      window.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        targetRotY += dx * 0.01;
        targetRotX += dy * 0.01;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
      });

      window.addEventListener('mouseup', function() { isDragging = false; });

      canvas.addEventListener('touchstart', function(e) {
        if (e.touches.length === 1) {
          isDragging = true;
          lastMouseX = e.touches[0].clientX;
          lastMouseY = e.touches[0].clientY;
        }
      });

      window.addEventListener('touchmove', function(e) {
        if (!isDragging || e.touches.length !== 1) return;
        const dx = e.touches[0].clientX - lastMouseX;
        const dy = e.touches[0].clientY - lastMouseY;
        targetRotY += dx * 0.015;
        targetRotX += dy * 0.015;
        lastMouseX = e.touches[0].clientX;
        lastMouseY = e.touches[0].clientY;
      });

      window.addEventListener('touchend', function() { isDragging = false; });

      render();
    }

    // Automations & Cron Controller
    function openNewCronModal() {
      const card = document.getElementById('new-cron-card');
      if (card) card.style.display = 'block';
    }

    function closeNewCronModal() {
      const card = document.getElementById('new-cron-card');
      if (card) card.style.display = 'none';
    }

    function toggleCronActionTypeInputs() {
      const checked = document.querySelector('input[name="cronActionType"]:checked');
      const type = checked ? checked.value : 'prompt';
      const promptField = document.getElementById('cron-prompt-field');
      const skillField = document.getElementById('cron-skill-field');
      if (promptField && skillField) {
        if (type === 'prompt') {
          promptField.style.display = 'block';
          skillField.style.display = 'none';
        } else {
          promptField.style.display = 'none';
          skillField.style.display = 'block';
        }
      }
    }

    function applyAutomationPreset(name, cron, actionType, skillName, payload) {
      openNewCronModal();
      const nameInput = document.getElementById('cron-name-input');
      const exprInput = document.getElementById('cron-expr-input');
      if (nameInput) nameInput.value = name;
      if (exprInput) exprInput.value = cron;
      const radios = document.querySelectorAll('input[name="cronActionType"]');
      radios.forEach((r) => { (r as HTMLInputElement).checked = ((r as HTMLInputElement).value === actionType); });
      toggleCronActionTypeInputs();

      if (actionType === 'prompt') {
        const pInput = document.getElementById('cron-prompt-input');
        if (pInput) pInput.value = payload.prompt || '';
      } else {
        const sInput = document.getElementById('cron-skill-name-input');
        const aInput = document.getElementById('cron-skill-args-input');
        if (sInput) sInput.value = skillName || '';
        if (aInput) aInput.value = payload ? JSON.stringify(payload) : '{}';
      }
    }

    async function submitNewCronJob() {
      const name = (document.getElementById('cron-name-input') as HTMLInputElement).value.trim();
      const cron = (document.getElementById('cron-expr-input') as HTMLInputElement).value.trim();
      const checked = document.querySelector('input[name="cronActionType"]:checked') as HTMLInputElement;
      const actionType = checked ? checked.value : 'prompt';

      if (!name || !cron) {
        alert('Please fill in Job Name and Schedule Expression.');
        return;
      }

      let actionPayload: any = {};
      if (actionType === 'prompt') {
        const prompt = (document.getElementById('cron-prompt-input') as HTMLTextAreaElement).value.trim();
        if (!prompt) {
          alert('Please enter a prompt instruction.');
          return;
        }
        actionPayload = { prompt };
      } else {
        const skillName = (document.getElementById('cron-skill-name-input') as HTMLInputElement).value.trim();
        const argsStr = (document.getElementById('cron-skill-args-input') as HTMLInputElement).value.trim() || '{}';
        if (!skillName) {
          alert('Please enter a skill name.');
          return;
        }
        try {
          actionPayload = { skillName, args: JSON.parse(argsStr) };
        } catch (e: any) {
          alert('Invalid JSON in skill arguments: ' + e.message);
          return;
        }
      }

      try {
        const res = await fetch('/api/cron/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            cron,
            actionType,
            actionPayload,
            status: 'active',
            notifyChannels: ['sse'],
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          alert('Failed to register job: ' + (err.error || res.statusText));
          return;
        }
        closeNewCronModal();
        loadAutomations();
      } catch (e: any) {
        alert('Error: ' + e.message);
      }
    }

    async function loadAutomations() {
      const tbody = document.getElementById('cron-jobs-table-body');
      if (!tbody) return;
      try {
        const res = await fetch('/api/cron/jobs');
        const jobs = await res.json();
        const badge = document.getElementById('cron-active-count-badge');
        if (badge) badge.innerText = jobs.length + ' Jobs';

        if (!jobs || jobs.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No background automations registered yet. Use presets above or click "+ New Automation".</td></tr>';
          loadCronLogs();
          return;
        }

        tbody.innerHTML = jobs.map((j: any) => {
          const isPaused = j.status === 'paused';
          const statusBadge = isPaused 
            ? '<span class="badge" style="background: rgba(107, 114, 128, 0.2); color: #9ca3af;">Paused</span>' 
            : '<span class="badge badge-success">Active</span>';
          const typeBadge = j.actionType === 'prompt' 
            ? '<span class="badge badge-purple">Prompt</span>' 
            : '<span class="badge badge-blue">Skill (0 tokens)</span>';
          const nextRun = j.nextRunAt ? new Date(j.nextRunAt).toLocaleTimeString() : 'N/A';
          const lastStatus = j.lastStatus ? '<span class="badge ' + (j.lastStatus === 'success' ? 'badge-success' : 'badge') + '" style="' + (j.lastStatus !== 'success' ? 'background:rgba(239, 68, 68, 0.2);color:#f87171;' : '') + '">' + j.lastStatus + '</span>' : '<span style="color:var(--text-muted)">Pending</span>';

          return '<tr>' +
            '<td>' + statusBadge + '</td>' +
            '<td style="font-weight: 600; color: #fff;">' + escapeHtml(j.name) + '</td>' +
            '<td><code>' + escapeHtml(j.cron) + '</code></td>' +
            '<td>' + typeBadge + '</td>' +
            '<td class="tabular-nums" style="font-size: 0.825rem;">' + nextRun + '</td>' +
            '<td>' + lastStatus + '</td>' +
            '<td style="white-space: nowrap;">' +
              '<button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; margin-right: 0.35rem;" onclick="triggerCronJob(\\'' + escapeHtml(j.id) + '\\')">Run Now</button>' +
              '<button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background: #374151; margin-right: 0.35rem;" onclick="toggleCronJob(\\'' + escapeHtml(j.id) + '\\', ' + (!isPaused) + ')">' + (isPaused ? 'Resume' : 'Pause') + '</button>' +
              '<button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background: #991b1b;" onclick="deleteCronJob(\\'' + escapeHtml(j.id) + '\\')">Del</button>' +
            '</td>' +
          '</tr>';
        }).join('');

        loadCronLogs();
      } catch (e: any) {
        tbody.innerHTML = '<tr><td colspan="7" style="color: #ef4444; text-align: center;">Error loading automations: ' + e.message + '</td></tr>';
      }
    }

    async function triggerCronJob(id: string) {
      try {
        const res = await fetch('/api/cron/jobs/' + encodeURIComponent(id) + '/trigger', { method: 'POST' });
        const log = await res.json();
        loadAutomations();
        showCronAlert('Triggered job manually', 'Result: ' + log.status + ' (Duration: ' + log.durationMs + 'ms)');
      } catch (e: any) {
        alert('Trigger failed: ' + e.message);
      }
    }

    async function toggleCronJob(id: string, active: boolean) {
      try {
        await fetch('/api/cron/jobs/' + encodeURIComponent(id) + '/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active }),
        });
        loadAutomations();
      } catch (e: any) {
        alert('Toggle failed: ' + e.message);
      }
    }

    async function deleteCronJob(id: string) {
      if (!confirm('Are you sure you want to delete this scheduled automation?')) return;
      try {
        await fetch('/api/cron/jobs/' + encodeURIComponent(id), { method: 'DELETE' });
        loadAutomations();
      } catch (e: any) {
        alert('Delete failed: ' + e.message);
      }
    }

    async function loadCronLogs() {
      const tbody = document.getElementById('cron-logs-table-body');
      if (!tbody) return;
      try {
        const res = await fetch('/api/cron/logs?limit=25');
        const logs = await res.json();
        if (!logs || logs.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1rem;">No execution logs recorded yet.</td></tr>';
          return;
        }

        tbody.innerHTML = logs.map((l: any) => {
          const time = new Date(l.startedAt).toLocaleTimeString();
          const statusBadge = l.status === 'success' 
            ? '<span class="badge badge-success">success</span>' 
            : '<span class="badge" style="background:rgba(239, 68, 68, 0.2);color:#f87171;">' + l.status + '</span>';
          const detail = l.errorMessage || l.output || 'No output';
          const preview = detail.length > 70 ? detail.slice(0, 70) + '...' : detail;

          return '<tr>' +
            '<td style="font-family: var(--font-mono); font-size: 0.75rem;">' + escapeHtml(l.jobId) + '</td>' +
            '<td class="tabular-nums" style="font-size: 0.8rem;">' + time + '</td>' +
            '<td class="tabular-nums" style="font-size: 0.8rem;">' + (l.durationMs != null ? l.durationMs + 'ms' : '--') + '</td>' +
            '<td class="tabular-nums" style="font-size: 0.8rem;">' + (l.tokensUsed || 0) + '</td>' +
            '<td>' + statusBadge + '</td>' +
            '<td style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted); max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="' + escapeHtml(detail) + '">' + escapeHtml(preview) + '</td>' +
          '</tr>';
        }).join('');
      } catch (e: any) {
        tbody.innerHTML = '<tr><td colspan="6" style="color: #ef4444; text-align: center;">Error loading logs: ' + e.message + '</td></tr>';
      }
    }

    function showCronAlert(title: string, desc: string) {
      const banner = document.getElementById('cron-alert-banner');
      const titleEl = document.getElementById('cron-alert-title');
      const descEl = document.getElementById('cron-alert-desc');
      if (banner && titleEl && descEl) {
        titleEl.innerText = title;
        descEl.innerText = desc;
        banner.style.display = 'flex';
      }
    }

    function dismissCronAlert() {
      const banner = document.getElementById('cron-alert-banner');
      if (banner) banner.style.display = 'none';
    }

    // Live Server-Sent Events (SSE) Bus
    function initLiveEvents() {
      if (!window.EventSource) return;
      try {
        const es = new EventSource('/api/events');
        es.addEventListener('trace', () => {
          window.pulse3DHero?.('fast');
          loadStats();
          const activeTab = document.querySelector('.tab-content.active')?.id;
          if (activeTab === 'traces') loadTraces();
        });
        es.addEventListener('skill_registered', () => {
          window.pulse3DHero?.('skill');
          loadStats();
          loadSkills();
        });
        es.addEventListener('evolution_completed', () => {
          window.pulse3DHero?.('slow');
          loadStats();
          loadSkills();
          const badge = document.getElementById('evolution-status-badge');
          if (badge) {
            badge.className = 'badge badge-success';
            badge.innerText = 'Evolution Synced';
          }
        });
        es.addEventListener('cron_notification', (e) => {
          window.pulse3DHero?.('fast');
          try {
            const data = JSON.parse(e.data);
            showCronAlert('Automated Execution: ' + data.jobName, 'Status: ' + data.status + ' (Tokens: ' + (data.tokensUsed || 0) + ')');
          } catch (_) {}
          const activeTab = document.querySelector('.tab-content.active')?.id;
          if (activeTab === 'automations') loadAutomations();
        });
      } catch (e) {}
    }

    // Auto-load on startup
    loadStats();
    init3DHero();
    initLiveEvents();
  </script>
</body>
</html>
`;
}
