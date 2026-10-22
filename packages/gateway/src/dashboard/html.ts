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
      <span>🦅 OpenTalon</span>
      <span class="brand-badge">Dual-Brain Engine</span>
    </div>
    <nav>
      <button class="tab-btn active" onclick="switchTab('overview')">Overview</button>
      <button class="tab-btn" onclick="switchTab('traces')">Episodic Traces</button>
      <button class="tab-btn" onclick="switchTab('skills')">Procedural Skills</button>
      <button class="tab-btn" onclick="switchTab('chat')">Live Playground</button>
    </nav>
  </header>

  <main>
    <!-- TAB 1: OVERVIEW -->
    <section id="overview" class="tab-content active">
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

    <!-- TAB 4: LIVE PLAYGROUND (SSE STREAMING) -->
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
      event.target.classList.add('active');
      document.getElementById(tabId).classList.add('active');

      if (tabId === 'traces') loadTraces();
      if (tabId === 'skills') loadSkills();
      if (tabId === 'overview') loadStats();
    }

    async function loadStats() {
      try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        document.getElementById('stat-skills-count').innerText = data.skillsCount;
        document.getElementById('stat-traces-count').innerText = data.tracesCount;
        document.getElementById('stat-avg-latency').innerHTML = data.avgLatencyMs + ' <span style="font-size: 1rem; color: var(--text-muted);">ms</span>';
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

    // Auto-load on startup
    loadStats();
  </script>
</body>
</html>
`;
}
