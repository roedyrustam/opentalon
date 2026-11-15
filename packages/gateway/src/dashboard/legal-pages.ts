function renderLegalShell(title: string, badge: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — OpenTalon Sovereign AI</title>
  <style>
    :root {
      --bg: #0b0f17;
      --card: #111827;
      --border: #1f293d;
      --text: #f3f4f6;
      --muted: #9ca3af;
      --accent: #10b981;
      --primary: #3b82f6;
      --danger: #ef4444;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      line-height: 1.65;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .tabular-nums { font-variant-numeric: tabular-nums; font-family: var(--font-mono); }
    header {
      border-bottom: 1px solid var(--border);
      background: #0e1422;
      padding: 1rem 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-weight: 700;
      font-size: 1.05rem;
      color: #fff;
      text-decoration: none;
    }
    .pill {
      border: 1px solid var(--border);
      background: #172033;
      color: #93c5fd;
      padding: 0.2rem 0.6rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-family: var(--font-mono);
    }
    nav {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      font-size: 0.875rem;
    }
    nav a {
      color: var(--muted);
      text-decoration: none;
      padding: 0.35rem 0.65rem;
      border: 1px solid transparent;
      border-radius: 6px;
    }
    nav a:hover { color: #fff; border-color: var(--border); background: #111827; }
    main {
      flex: 1;
      max-width: 920px;
      width: 100%;
      margin: 2rem auto;
      padding: 0 1.5rem;
    }
    .panel {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 2rem;
      margin-bottom: 1.5rem;
    }
    h1 { font-size: 1.75rem; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 0.5rem; }
    h2 { font-size: 1.15rem; font-weight: 700; margin: 1.5rem 0 0.5rem; color: #e5e7eb; }
    p, li { color: #d1d5db; font-size: 0.94rem; margin-bottom: 0.65rem; }
    ul { padding-left: 1.25rem; }
    code {
      font-family: var(--font-mono);
      background: #0d131f;
      border: 1px solid var(--border);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      font-size: 0.85em;
      color: #a5f3fc;
    }
    .bilingual {
      border-left: 3px solid var(--primary);
      padding-left: 1rem;
      margin: 0.75rem 0;
    }
    .input {
      width: 100%;
      background: #0d131f;
      border: 1px solid var(--border);
      color: #fff;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      font-family: var(--font-mono);
      font-size: 0.9rem;
      margin-bottom: 1rem;
    }
    .btn {
      background: var(--primary);
      color: #fff;
      border: 1px solid #2563eb;
      padding: 0.65rem 1.25rem;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
    }
    .btn-danger {
      background: #b91c1c;
      border-color: #dc2626;
    }
    footer {
      border-top: 1px solid var(--border);
      padding: 1.25rem 2rem;
      text-align: center;
      color: var(--muted);
      font-size: 0.8rem;
    }
  </style>
</head>
<body>
  <header>
    <a href="/dashboard" class="brand">
      <span>OpenTalon Sovereign Cockpit</span>
      <span class="pill">${badge}</span>
    </a>
    <nav>
      <a href="/dashboard">Dashboard</a>
      <a href="/privacy">Privacy Policy</a>
      <a href="/terms">Terms &amp; Conditions</a>
      <a href="/delete-account">Data Deletion</a>
    </nav>
  </header>
  <main>
    ${bodyHtml}
  </main>
  <footer>
    OpenTalon v0.7.0 &bull; Compliant with UU No. 27/2022 (UU PDP Indonesia) &amp; GDPR Art. 13/17 &bull; Local-First Zero-Trust Runtime
  </footer>
</body>
</html>`;
}

export function getPrivacyPolicyHtml(): string {
  return renderLegalShell(
    'Privacy Policy / Kebijakan Privasi',
    'UU PDP No. 27/2022 & GDPR Art. 13',
    `
    <div class="panel">
      <h1>Privacy Policy &amp; Kebijakan Privasi</h1>
      <p style="color: var(--muted);">Effective Date: 2026-11-15 &bull; OpenTalon Framework (v0.7.0)</p>

      <h2>1. Local-First Data Residency (Penyimpanan Lokal Berdaulat)</h2>
      <p>OpenTalon is architected as a sovereign, local-first AI agent runtime. Episodic execution traces (<code>episodic_traces</code>), semantic memory facts (<code>semantic_facts</code>), procedural skills (<code>procedural_skills</code>), and Ed25519 node keys (<code>agent_identity</code>) are stored directly in your local libSQL database (<code>opentalon.db</code>) or your explicitly configured Turso instance.</p>
      <div class="bilingual">
        <p><strong>Bahasa Indonesia:</strong> OpenTalon memproses dan menyimpan riwayat interaksi, fakta semantik, skill prosedural, serta kunci kriptografi Ed25519 secara lokal di basis data <code>opentalon.db</code> milik pengguna. Tidak ada pengumpulan telemetri pihak ketiga tersembunyi.</p>
      </div>

      <h2>2. Prompt-Injection Firewall &amp; Secret Redaction</h2>
      <ul>
        <li>Inbound prompts pass through <code>PromptInjectionFirewall</code> before LLM dispatch.</li>
        <li>Detected API keys (<code>sk-...</code>, <code>AIza...</code>) and PEM private keys are automatically redacted into <code>[REDACTED_*]</code> placeholders prior to trace persistence.</li>
        <li>Sandboxed skills execute inside isolated VM contexts governed by <code>SecurityGate</code> (12 static rules) and strict anti-SSRF network allowlists.</li>
      </ul>

      <h2>3. Legal Basis &amp; User Rights (UU No. 27/2022 &amp; GDPR)</h2>
      <p>Under <strong>UU PDP No. 27 Tahun 2022</strong> and <strong>GDPR Articles 13 &amp; 17</strong>, you retain full ownership, inspection rights, portability (<code>GET /api/memory/export</code>), and immediate right to erasure via <a href="/delete-account" style="color: #60a5fa;">/delete-account</a> or <code>POST /api/privacy/delete-data</code>.</p>
    </div>
    `
  );
}

export function getTermsHtml(): string {
  return renderLegalShell(
    'Terms & Conditions / Syarat & Ketentuan',
    'MIT License & Zero-Trust Policy',
    `
    <div class="panel">
      <h1>Terms &amp; Conditions &bull; Syarat &amp; Ketentuan</h1>
      <p style="color: var(--muted);">OpenTalon v0.7.0 &bull; MIT Open-Source Software</p>

      <h2>1. License &amp; Sovereign Deployment</h2>
      <p>OpenTalon is distributed under the MIT License. Operators running local CLI daemons, serverless edge workers, or federated A2A nodes assume responsibility for API credentials configured in their environment.</p>
      <div class="bilingual">
        <p><strong>Bahasa Indonesia:</strong> OpenTalon disediakan di bawah Lisensi MIT. Operator sistem bertanggung jawab penuh atas kunci API penyedia LLM yang dikonfigurasi dan kebijakan host jaringan yang diizinkan di dalam lingkungan eksekusi masing-masing.</p>
      </div>

      <h2>2. Zero-Trust Sandbox &amp; Anti-SSRF Boundaries</h2>
      <ul>
        <li>Skills may not invoke wildcard egress (<code>*</code>) or cloud instance metadata endpoints (<code>169.254.169.254</code>, <code>metadata.google.internal</code>).</li>
        <li>All synthesized or imported skills must pass <code>SecurityGate.auditSkillCode()</code> before sandbox verification and procedural memory commitment.</li>
      </ul>

      <h2>3. FinOps &amp; A2A Federation Governance</h2>
      <p>Operators may enforce daily USD/token limits via <code>FinOpsBudgetTracker</code> and restrict remote peer delegations through Ed25519 signature verification (<code>delegationDepth &lt;= 3</code>).</p>
    </div>
    `
  );
}

export function getDataDeletionHtml(): string {
  return renderLegalShell(
    'User Data Deletion / Hapus Data Pengguna',
    'GDPR Art. 17 & UU PDP Erasure',
    `
    <div class="panel">
      <h1>User Data Deletion Portal &bull; Portal Hapus Data</h1>
      <p>Use this self-service portal to exercise your Right to Erasure under <strong>GDPR Art. 17</strong>, <strong>UU PDP No. 27/2022</strong>, and App Store / Play Store data safety requirements.</p>
      <div class="bilingual">
        <p><strong>Bahasa Indonesia:</strong> Masukkan <code>Session ID</code> spesifik untuk menghapus jejak episodik dan fakta semantik sesi tersebut, atau masukkan <code>*</code> untuk menghapus seluruh riwayat sesi secara permanen.</p>
      </div>

      <div style="margin-top: 1.5rem;">
        <label for="delete-session-id" style="display:block; font-size:0.85rem; color:var(--muted); margin-bottom:0.4rem;">Target Session ID (or <code>*</code> for all sessions):</label>
        <input id="delete-session-id" class="input" type="text" value="dashboard_sess" placeholder="e.g. dashboard_sess or *" />
        <button id="delete-submit-btn" class="btn btn-danger" onclick="submitDataDeletion()">Execute Permanent Data Deletion</button>
      </div>

      <div id="delete-receipt" style="display:none; margin-top: 1.25rem; background:#0d131f; border:1px solid var(--border); border-radius:8px; padding:1rem;">
        <div style="font-weight:700; color:#34d399; margin-bottom:0.4rem;">Deletion Receipt (Bukti Penghapusan Data)</div>
        <pre id="delete-receipt-json" class="tabular-nums" style="font-size:0.82rem; color:#e5e7eb; white-space:pre-wrap;"></pre>
      </div>
    </div>

    <script>
      async function submitDataDeletion() {
        const input = document.getElementById('delete-session-id');
        const sessionId = (input && input.value.trim()) || '*';
        const btn = document.getElementById('delete-submit-btn');
        if (btn) btn.disabled = true;
        try {
          const res = await fetch('/api/privacy/delete-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          });
          const data = await res.json();
          const box = document.getElementById('delete-receipt');
          const pre = document.getElementById('delete-receipt-json');
          if (box) box.style.display = 'block';
          if (pre) pre.textContent = JSON.stringify(data, null, 2);
        } catch (err) {
          alert('Failed to delete session data: ' + err.message);
        } finally {
          if (btn) btn.disabled = false;
        }
      }
    </script>
    `
  );
}
