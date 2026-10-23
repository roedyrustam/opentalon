import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DualBrainRouter,
  MockLLMDriver,
  AgentIdentityManager,
  type AgentCard,
  type A2ANegotiateRequest,
  type A2ANegotiateResponse,
  type A2ADispatchRequest,
  type A2ADispatchResponse,
} from '@opentalon/core';
import { LibSqlMemoryAdapter, type FederatedPeer } from '@opentalon/memory';
import { SandboxedVmRunner } from '@opentalon/skill-engine';
import { LocalDaemonAdapter } from '../adapters/local-daemon.js';

describe('A2A Protocol Gateway Endpoints', () => {
  let memory: LibSqlMemoryAdapter;
  let llm: MockLLMDriver;
  let sandbox: SandboxedVmRunner;
  let router: DualBrainRouter;
  let daemon: LocalDaemonAdapter;
  let clientIdentityManager: AgentIdentityManager;
  let port: number;
  let baseUrl: string;

  beforeEach(async () => {
    memory = new LibSqlMemoryAdapter({ url: ':memory:' });
    await memory.initialize();

    // Add a test skill
    await memory.saveSkill({
      id: 'skill-test-1',
      name: 'currency-converter',
      description: 'Converts currencies',
      capabilities: {},
      version: '1.0.0',
      code: 'export default async function run(args) { return { converted: args.amount * 15000 }; }',
      hash: 'hash-test-1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    llm = new MockLLMDriver();
    llm.mockResponse = {
      content: '100 USD is 1,500,000 IDR',
      tokensUsed: { promptTokens: 30, completionTokens: 15, totalTokens: 45 },
      model: 'mock-model',
    };
    sandbox = new SandboxedVmRunner();
    router = new DualBrainRouter({ memory, llm, sandbox });

    daemon = new LocalDaemonAdapter(router, { port: 0 }); // Random port
    port = await daemon.start();
    baseUrl = `http://127.0.0.1:${port}`;

    // Separate identity manager acting as the remote client caller
    const clientMemory = new LibSqlMemoryAdapter({ url: ':memory:' });
    await clientMemory.initialize();
    clientIdentityManager = new AgentIdentityManager(clientMemory, {
      agentName: 'Client Caller Node',
    });
  });

  afterEach(async () => {
    await daemon.stop();
    await memory.close();
  });

  it('serves standard Agent Card at /.well-known/agent.json', async () => {
    const res = await fetch(`${baseUrl}/.well-known/agent.json`);
    expect(res.status).toBe(200);

    const card = (await res.json()) as AgentCard;
    expect(card.urn).toMatch(/^urn:talon:agent:/);
    expect(card.version).toBe('0.6.0');
    expect(card.status).toBe('online');
    expect(card.publicKey).toContain('BEGIN PUBLIC KEY');
    expect(card.endpoints.agentCard).toBe(`${baseUrl}/.well-known/agent.json`);
    expect(card.endpoints.negotiate).toBe(`${baseUrl}/api/a2a/negotiate`);
    expect(card.endpoints.dispatch).toBe(`${baseUrl}/api/a2a/dispatch`);
    expect(card.skills.some((s) => s.name === 'currency-converter')).toBe(true);
  });

  it('registers and lists federated peers in P2P mesh', async () => {
    const peerPayload: FederatedPeer = {
      peerId: 'peer-remote-node-1',
      name: 'Remote Node 1',
      endpointUrl: 'http://127.0.0.1:9999',
      publicKey: 'test-public-key-1',
      capabilities: ['crypto-signer'],
      status: 'online',
      lastSeenAt: Date.now(),
    };

    const regRes = await fetch(`${baseUrl}/api/a2a/peers/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(peerPayload),
    });
    expect(regRes.status).toBe(201);

    const listRes = await fetch(`${baseUrl}/api/a2a/peers`);
    expect(listRes.status).toBe(200);
    const peers = (await listRes.json()) as FederatedPeer[];
    expect(peers.length).toBe(1);
    expect(peers[0].peerId).toBe('peer-remote-node-1');
    expect(peers[0].capabilities).toEqual(['crypto-signer']);

    // Delete peer
    const delRes = await fetch(`${baseUrl}/api/a2a/peers/peer-remote-node-1`, {
      method: 'DELETE',
    });
    expect(delRes.status).toBe(200);

    const afterDelRes = await fetch(`${baseUrl}/api/a2a/peers`);
    const afterPeers = (await afterDelRes.json()) as FederatedPeer[];
    expect(afterPeers.length).toBe(0);
  });

  it('negotiates task capability with cryptographic signature verification', async () => {
    const payload: A2ANegotiateRequest = {
      taskId: 'task-negotiate-01',
      senderAgentId: 'urn:talon:agent:client-node',
      requiredSkills: ['currency-converter'],
      taskDescription: 'Convert 100 USD to IDR',
      delegationDepth: 1,
    };

    const signedHeaders = await clientIdentityManager.signPayload(payload);

    const res = await fetch(`${baseUrl}/api/a2a/negotiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Talon-Agent-Id': signedHeaders.agentId,
        'X-Talon-Public-Key': signedHeaders.publicKey,
        'X-Talon-Signature': signedHeaders.signature,
        'X-Talon-Timestamp': String(signedHeaders.timestamp),
        'X-Talon-Nonce': signedHeaders.nonce,
      },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(200);
    const response = (await res.json()) as A2ANegotiateResponse;
    expect(response.canHandle).toBe(true);
    expect(response.availableSkills).toContain('currency-converter');
    expect(response.assignedPeerId).toMatch(/^urn:talon:agent:/);
  });

  it('rejects tampered signature in negotiation', async () => {
    const payload: A2ANegotiateRequest = {
      taskId: 'task-tamper-01',
      senderAgentId: 'urn:talon:agent:client-node',
      requiredSkills: ['currency-converter'],
      taskDescription: 'Convert 100 USD to IDR',
      delegationDepth: 1,
    };

    const signedHeaders = await clientIdentityManager.signPayload(payload);

    // Tamper with the payload body
    const tamperedPayload = { ...payload, taskDescription: 'HACKED TASK' };

    const res = await fetch(`${baseUrl}/api/a2a/negotiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Talon-Agent-Id': signedHeaders.agentId,
        'X-Talon-Public-Key': signedHeaders.publicKey,
        'X-Talon-Signature': signedHeaders.signature,
        'X-Talon-Timestamp': String(signedHeaders.timestamp),
        'X-Talon-Nonce': signedHeaders.nonce,
      },
      body: JSON.stringify(tamperedPayload),
    });

    expect(res.status).toBe(401);
    const err = (await res.json()) as { error: string };
    expect(err.error).toContain('ERR_INVALID_SIGNATURE');
  });

  it('dispatches task execution and logs audit record', async () => {
    const payload: A2ADispatchRequest = {
      taskId: 'task-dispatch-01',
      senderAgentId: 'urn:talon:agent:client-node',
      task: 'Convert 100 USD to IDR',
      skillsFilter: ['currency-converter'],
      delegationDepth: 1,
    };

    const signedHeaders = await clientIdentityManager.signPayload(payload);

    const res = await fetch(`${baseUrl}/api/a2a/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Talon-Agent-Id': signedHeaders.agentId,
        'X-Talon-Public-Key': signedHeaders.publicKey,
        'X-Talon-Signature': signedHeaders.signature,
        'X-Talon-Timestamp': String(signedHeaders.timestamp),
        'X-Talon-Nonce': signedHeaders.nonce,
      },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(200);
    const response = (await res.json()) as A2ADispatchResponse;
    expect(response.success).toBe(true);
    expect(response.taskId).toBe('task-dispatch-01');
    expect(response.output).toContain('1,500,000 IDR');
    expect(response.tokensUsed.totalTokens).toBeGreaterThan(0);

    // Verify audit log recorded
    const logsRes = await fetch(`${baseUrl}/api/a2a/logs`);
    expect(logsRes.status).toBe(200);
    const logs = (await logsRes.json()) as Array<{ action: string; status: string }>;
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some((l) => l.action === 'dispatch' && l.status === 'completed')).toBe(true);
  });

  it('enforces delegation depth limit to prevent circular deadlocks', async () => {
    const payload: A2ADispatchRequest = {
      taskId: 'task-circular-01',
      senderAgentId: 'urn:talon:agent:client-node',
      task: 'Infinite loop test',
      delegationDepth: 4, // Exceeds limit of 3
    };

    const res = await fetch(`${baseUrl}/api/a2a/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(400);
    const err = (await res.json()) as { error: string };
    expect(err.error).toContain('ERR_MAX_DELEGATION_DEPTH');
  });
});
