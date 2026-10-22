import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

  beforeEach(async () => {
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

  afterEach(async () => {
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
});

