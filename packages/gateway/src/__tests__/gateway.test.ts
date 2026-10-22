import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { ServerlessEdgeAdapter, LocalDaemonAdapter } from '../index.js';
import { DualBrainRouter, MockLLMDriver } from '@opentalon/core';
import { LibSqlMemoryAdapter } from '@opentalon/memory';
import { SandboxedVmRunner } from '@opentalon/skill-engine';

describe('Gateway - ServerlessEdgeAdapter', () => {
  let router: DualBrainRouter;
  let adapter: ServerlessEdgeAdapter;

  beforeEach(async () => {
    const memory = new LibSqlMemoryAdapter({ url: ':memory:' });
    await memory.initialize();
    const sandbox = new SandboxedVmRunner();
    const mockLLM = new MockLLMDriver();
    mockLLM.mockResponse = {
      content: 'Serverless response from OpenTalon Edge',
      tokensUsed: { promptTokens: 40, completionTokens: 15, totalTokens: 55 },
      model: 'edge-mock',
    };

    router = new DualBrainRouter({ memory, sandbox, llm: mockLLM });
    adapter = new ServerlessEdgeAdapter(router, {
      expectedApiKey: 'secret-talon-key',
    });
  });

  it('serves healthcheck on GET /health', async () => {
    const req = new Request('https://edge.opentalon.dev/health', { method: 'GET' });
    const res = await adapter.handleRequest(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; runtime: string };
    expect(body.status).toBe('ok');
    expect(body.runtime).toBe('edge-worker');
  });

  it('rejects unauthorized request when API key is missing or invalid', async () => {
    const req = new Request('https://edge.opentalon.dev/v1/chat', {
      method: 'POST',
      body: JSON.stringify({ input: 'hello' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await adapter.handleRequest(req);
    expect(res.status).toBe(401);
  });

  it('processes agent execution and returns valid JSON response', async () => {
    const req = new Request('https://edge.opentalon.dev/v1/chat', {
      method: 'POST',
      body: JSON.stringify({ input: 'Analyze metrics', sessionId: 'edge-sess-1' }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer secret-talon-key',
      },
    });

    const res = await adapter.handleRequest(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sessionId: string; output: string };
    expect(body.sessionId).toBe('edge-sess-1');
    expect(body.output).toBe('Serverless response from OpenTalon Edge');
  });
});

describe('Gateway - LocalDaemonAdapter', () => {
  let router: DualBrainRouter;
  let daemon: LocalDaemonAdapter;
  const testPort = 3199;

  beforeAll(async () => {
    const memory = new LibSqlMemoryAdapter({ url: ':memory:' });
    await memory.initialize();
    const sandbox = new SandboxedVmRunner();
    const mockLLM = new MockLLMDriver();
    mockLLM.mockResponse = {
      content: 'Daemon local response',
      tokensUsed: { promptTokens: 30, completionTokens: 10, totalTokens: 40 },
      model: 'daemon-mock',
    };

    router = new DualBrainRouter({ memory, sandbox, llm: mockLLM });
    daemon = new LocalDaemonAdapter(router, { port: testPort });
    await daemon.start();
  });

  afterAll(async () => {
    await daemon.stop();
  });

  it('responds to local healthcheck', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/health`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string };
    expect(json.status).toBe('ok');
  });

  it('processes chat POST request via local daemon HTTP', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'Local test query' }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { output: string };
    expect(json.output).toBe('Daemon local response');
  });

  it('exposes MCP tools via GET /api/mcp/tools', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/api/mcp/tools`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { tools: Array<{ name: string }> };
    expect(Array.isArray(json.tools)).toBe(true);
  });

  it('handles MCP JSON-RPC requests via POST /api/mcp/rpc', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/api/mcp/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 42,
        method: 'initialize',
      }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { id: number; result: { serverInfo: { name: string } } };
    expect(json.id).toBe(42);
    expect(json.result.serverInfo.name).toBe('opentalon-mcp-server');
  });

  it('executes Swarm topologies via POST /api/swarm/execute', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/api/swarm/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topology: 'fan_out_fan_in',
        task: 'Design secure payment gateway architecture',
      }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      topology: string;
      finalOutput: string;
      subagentResults: Array<{ role: string }>;
    };
    expect(json.topology).toBe('fan_out_fan_in');
    expect(json.subagentResults.length).toBeGreaterThan(0);
    expect(json.finalOutput).toBeDefined();
  });

  it('registers and deletes skills via POST & DELETE /api/skills', async () => {
    const rawMarkdown = `---
name: gateway_test_skill
version: 1.0.0
description: "A test skill registered via gateway"
capabilities: {}
---

# gateway_test_skill
Test skill implementation.

## Implementation
\`\`\`javascript
export default async function run(args) {
  return { value: args.x * 2 };
}
\`\`\`
`;

    // 1. Register Skill
    const createRes = await fetch(`http://127.0.0.1:${testPort}/api/skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: rawMarkdown }),
    });

    expect(createRes.status).toBe(200);
    const createJson = (await createRes.json()) as { success: boolean; skill: { name: string } };
    expect(createJson.success).toBe(true);
    expect(createJson.skill.name).toBe('gateway_test_skill');

    // 2. Delete Skill
    const deleteRes = await fetch(
      `http://127.0.0.1:${testPort}/api/skills?name=gateway_test_skill`,
      { method: 'DELETE' }
    );
    expect(deleteRes.status).toBe(200);
    const deleteJson = (await deleteRes.json()) as { success: boolean };
    expect(deleteJson.success).toBe(true);
  });

  it('manages slow path evolution via POST /api/evolution/run and GET /api/evolution/status', async () => {
    // Check status
    const statusRes = await fetch(`http://127.0.0.1:${testPort}/api/evolution/status`);
    expect(statusRes.status).toBe(200);
    const statusJson = (await statusRes.json()) as { isEvolving: boolean; queueLength: number };
    expect(typeof statusJson.isEvolving).toBe('boolean');

    // Run manual evolution cycle
    const runRes = await fetch(`http://127.0.0.1:${testPort}/api/evolution/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 10, dryRun: true }),
    });

    expect(runRes.status).toBe(200);
    const report = (await runRes.json()) as { opportunitiesFound: number };
    expect(report.opportunitiesFound).toBeDefined();
  });

  it('exports and imports memory snapshots via /api/memory/export and /api/memory/import', async () => {
    // Export
    const exportRes = await fetch(`http://127.0.0.1:${testPort}/api/memory/export`);
    expect(exportRes.status).toBe(200);
    const snapshot = (await exportRes.json()) as { version: string; skills: unknown[]; facts: unknown[] };
    expect(snapshot.version).toBe('1.0.0');

    // Import
    const importRes = await fetch(`http://127.0.0.1:${testPort}/api/memory/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    });

    expect(importRes.status).toBe(200);
    const importJson = (await importRes.json()) as { importedSkills: number };
    expect(importJson.importedSkills).toBeDefined();
  });
});

