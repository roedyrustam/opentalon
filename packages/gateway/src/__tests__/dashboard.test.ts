import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocalDaemonAdapter } from '../index.js';
import { DualBrainRouter, MockLLMDriver } from '@opentalon/core';
import { LibSqlMemoryAdapter } from '@opentalon/memory';
import { SandboxedVmRunner } from '@opentalon/skill-engine';

describe('Gateway - Embedded Web Dashboard & Cockpit APIs', () => {
  let router: DualBrainRouter;
  let daemon: LocalDaemonAdapter;
  const testPort = 3188;

  beforeEach(async () => {
    const memory = new LibSqlMemoryAdapter({ url: ':memory:' });
    await memory.initialize();

    // Seed test skill
    await memory.saveSkill({
      id: 'skill-dash-calc',
      name: 'add_two',
      description: 'Adds two numbers',
      capabilities: {},
      version: '1.0.0',
      code: 'export default async function run(args) { return { sum: args.a + args.b }; }',
      hash: 'hash-dash-calc',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const sandbox = new SandboxedVmRunner();
    const mockLLM = new MockLLMDriver();
    mockLLM.mockResponse = {
      content: 'Dashboard test chat response',
      tokensUsed: { promptTokens: 30, completionTokens: 10, totalTokens: 40 },
      model: 'dash-mock',
    };

    router = new DualBrainRouter({ memory, sandbox, llm: mockLLM });
    daemon = new LocalDaemonAdapter(router, { port: testPort });
    await daemon.start();
  });

  afterEach(async () => {
    await daemon.stop();
  });

  it('serves dashboard HTML on GET / and GET /dashboard', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');

    const html = await res.text();
    expect(html).toContain('OpenTalon — Dual-Brain AI Agent Cockpit');
    expect(html).toContain('brand-badge');
    expect(html).toContain('Swarm Topologies');
    expect(html).toContain('MCP Hub');
    expect(html).toContain('Automations & Cron');
    expect(html).toContain('cron-jobs-table-body');
    expect(html).toContain('cron-alert-banner');
    expect(html).toContain('swarm-top-fanout');
    expect(html).toContain('mcp-tools-list');
  });

  it('returns statistics via GET /api/stats', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/api/stats`);
    expect(res.status).toBe(200);

    const stats = (await res.json()) as { skillsCount: number; tracesCount: number; avgLatencyMs: number };
    expect(stats.skillsCount).toBe(1);
    expect(typeof stats.tracesCount).toBe('number');
  });

  it('lists skills via GET /api/skills', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/api/skills`);
    expect(res.status).toBe(200);

    const skills = (await res.json()) as Array<{ name: string; version: string }>;
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('add_two');
  });

  it('executes a skill test in sandbox via POST /api/skills/test', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/api/skills/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'add_two', args: { a: 15, b: 35 } }),
    });

    expect(res.status).toBe(200);
    const result = (await res.json()) as { success: boolean; data: { sum: number } };
    expect(result.success).toBe(true);
    expect(result.data.sum).toBe(50);
  });

  it('handles SSE streaming via POST /v1/stream on local daemon', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/v1/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'Stream live tokens to dashboard' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');

    const text = await res.text();
    expect(text).toContain('event: start');
    expect(text).toContain('event: token');
    expect(text).toContain('event: done');
  });
});
