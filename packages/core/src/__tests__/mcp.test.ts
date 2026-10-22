import { describe, it, expect, beforeEach } from 'vitest';
import { McpServer } from '../mcp/mcp-server.js';
import { McpClientAdapter } from '../mcp/mcp-client.js';
import { McpToolBridge } from '../mcp/mcp-bridge.js';
import { LibSqlMemoryAdapter } from '@opentalon/memory';
import { SandboxedVmRunner } from '@opentalon/skill-engine';

describe('MCP Protocol - Server & Client Handshake', () => {
  let memory: LibSqlMemoryAdapter;
  let sandbox: SandboxedVmRunner;
  let server: McpServer;

  beforeEach(async () => {
    memory = new LibSqlMemoryAdapter({ url: ':memory:' });
    await memory.initialize();
    sandbox = new SandboxedVmRunner();
    server = new McpServer(memory, sandbox);

    // Seed a skill in memory
    await memory.saveSkill({
      id: 'skill-mcp-add',
      name: 'add_two_numbers',
      description: 'Adds two numbers together',
      capabilities: {},
      version: '1.0.0',
      code: 'export default async function run(args) { return { result: args.a + args.b }; }',
      hash: 'hash-add',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Seed a trace in memory
    await memory.saveTrace({
      id: 'trace-mcp-1',
      sessionId: 'sess-mcp',
      input: 'Test input',
      output: 'Test output',
      retrievedSkillIds: ['skill-mcp-add'],
      toolCalls: [],
      tokensUsed: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
      latencyMs: 15,
      success: true,
      timestamp: Date.now(),
    });
  });

  it('handles initialize handshake accurately', async () => {
    const res = await server.handleMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
    });

    expect(res.error).toBeUndefined();
    const result = res.result as { protocolVersion: string; serverInfo: { name: string } };
    expect(result.protocolVersion).toBe('2024-11-05');
    expect(result.serverInfo.name).toBe('opentalon-mcp-server');
  });

  it('lists registered procedural skills as MCP tools', async () => {
    const res = await server.handleMessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });

    expect(res.error).toBeUndefined();
    const result = res.result as { tools: Array<{ name: string; description: string }> };
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toBe('add_two_numbers');
  });

  it('executes tool call safely inside sandbox via tools/call', async () => {
    const res = await server.handleMessage({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'add_two_numbers',
        arguments: { a: 15, b: 27 },
      },
    });

    expect(res.error).toBeUndefined();
    const result = res.result as { content: Array<{ type: string; text: string }>; isError: boolean };
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('"result": 42');
  });

  it('exposes episodic memory traces via resources/list and resources/read', async () => {
    const listRes = await server.handleMessage({
      jsonrpc: '2.0',
      id: 4,
      method: 'resources/list',
    });

    const listResult = listRes.result as { resources: Array<{ uri: string }> };
    expect(listResult.resources).toHaveLength(1);
    expect(listResult.resources[0].uri).toBe('opentalon://traces/trace-mcp-1');

    const readRes = await server.handleMessage({
      jsonrpc: '2.0',
      id: 5,
      method: 'resources/read',
      params: {
        uri: 'opentalon://traces/trace-mcp-1',
      },
    });

    const readResult = readRes.result as { contents: Array<{ text: string }> };
    expect(readResult.contents[0].text).toContain('sess-mcp');
  });

  it('integrates seamlessly with McpClientAdapter over in-process transport', async () => {
    const client = new McpClientAdapter({
      name: 'local-test-client',
      transport: 'in_process',
      handler: (req) => server.handleMessage(req),
    });

    const tools = await client.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('add_two_numbers');

    const callResult = (await client.callTool('add_two_numbers', { a: 100, b: 25 })) as {
      content: Array<{ text: string }>;
    };
    expect(callResult.content[0].text).toContain('"result": 125');
  });

  it('imports remote MCP tools into procedural memory via McpToolBridge', async () => {
    const client = new McpClientAdapter({
      name: 'remote-test-client',
      transport: 'in_process',
      handler: (req) => server.handleMessage(req),
    });

    const report = await McpToolBridge.importMcpTools(client, memory, { prefix: 'ext' });
    expect(report.importedSkills).toHaveLength(1);
    expect(report.importedSkills[0].name).toBe('ext_add_two_numbers');
    expect(report.importedSkills[0].remoteToolName).toBe('add_two_numbers');

    const saved = await memory.getSkill('skill-ext_add_two_numbers');
    expect(saved).toBeDefined();
    expect(saved?.name).toBe('ext_add_two_numbers');

    // Verify that the bridged skill can execute in sandboxed VM
    const execResult = await sandbox.execute({
      code: saved!.code,
      args: { a: 10, b: 20 },
      capabilities: saved!.capabilities,
    });
    expect(execResult.success).toBe(true);
    expect(execResult.data).toMatchObject({
      tool: 'add_two_numbers',
      executedArgs: { a: 10, b: 20 },
      mcpBridged: true,
    });
  });
});

