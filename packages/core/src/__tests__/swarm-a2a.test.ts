import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SwarmDirector } from '../swarm/swarm-director.js';
import { MockLLMDriver } from '../drivers/mock-driver.js';
import { LibSqlMemoryAdapter } from '@opentalon/memory';
import { AgentIdentityManager } from '../a2a/identity-manager.js';
import { type SwarmTaskRequest } from '../swarm/types.js';

describe('SwarmDirector - A2A Federated Remote Delegation', () => {
  let memory: LibSqlMemoryAdapter;
  let identityManager: AgentIdentityManager;
  let llm: MockLLMDriver;
  let director: SwarmDirector;

  beforeEach(async () => {
    memory = new LibSqlMemoryAdapter({ url: ':memory:' });
    await memory.initialize();
    identityManager = new AgentIdentityManager(memory, { agentName: 'Coordinator Swarm Node' });
    llm = new MockLLMDriver();
    director = new SwarmDirector(llm, undefined, identityManager);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await memory.close();
  });

  it('delegates subagent execution to remote peer via A2A dispatch', async () => {
    // Mock remote peer dispatch response
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        taskId: 'swarm_remote_agent_1',
        senderAgentId: 'swarm-director',
        executorPeerId: 'urn:talon:agent:remote-worker-node',
        success: true,
        output: 'Remote database schema designed: PostgreSQL with RLS and tigerbeetle',
        tokensUsed: { promptTokens: 45, completionTokens: 25, totalTokens: 70 },
        durationMs: 85,
      }),
    } as unknown as Response);

    const request: SwarmTaskRequest = {
      topology: 'fan_out_fan_in',
      task: 'Design multi-tenant FinTech architecture',
      agents: [
        {
          id: 'local_architect',
          role: 'System Architect',
          systemInstruction: 'Design high level microservices',
        },
        {
          id: 'remote_db_specialist',
          role: 'Database Specialist',
          systemInstruction: 'Design PostgreSQL schema',
          targetPeerUrl: 'http://127.0.0.1:4500', // Remote peer
        },
      ],
    };

    const result = await director.executeSwarm(request);

    expect(result.topology).toBe('fan_out_fan_in');
    expect(result.subagentResults.length).toBe(2);

    const remoteResult = result.subagentResults.find((r) => r.agentId === 'remote_db_specialist');
    expect(remoteResult).toBeDefined();
    expect(remoteResult?.success).toBe(true);
    expect(remoteResult?.output).toContain('tigerbeetle');

    // Confirm signed A2A request was dispatched
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callUrl = fetchMock.mock.calls[0][0];
    expect(callUrl).toBe('http://127.0.0.1:4500/api/a2a/dispatch');

    const callInit = fetchMock.mock.calls[0][1] as RequestInit;
    const callHeaders = callInit.headers as Record<string, string>;
    expect(callHeaders['X-Talon-Agent-Id']).toMatch(/^urn:talon:agent:/);
    expect(callHeaders['X-Talon-Signature']).toBeTruthy();
  });
});
