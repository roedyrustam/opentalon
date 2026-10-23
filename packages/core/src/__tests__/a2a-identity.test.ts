import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LibSqlMemoryAdapter } from '@opentalon/memory';
import {
  AgentIdentityManager,
  canonicalJsonStringify,
} from '../a2a/identity-manager.js';

describe('A2A Protocol - AgentIdentityManager & Cryptographic Signing', () => {
  let memory: LibSqlMemoryAdapter;
  let identityManager: AgentIdentityManager;

  beforeEach(async () => {
    memory = new LibSqlMemoryAdapter({ url: ':memory:' });
    await memory.initialize();
    identityManager = new AgentIdentityManager(memory, {
      agentName: 'Test Node Alpha',
      maxClockSkewMs: 10_000, // 10s for testing
      nonceTtlMs: 30_000,
    });
  });

  afterEach(async () => {
    await memory.close();
  });

  it('canonicalJsonStringify sorts keys deterministically', () => {
    const obj1 = { z: 1, a: { y: 2, x: 3 }, m: [3, 2, 1] };
    const obj2 = { a: { x: 3, y: 2 }, m: [3, 2, 1], z: 1 };

    expect(canonicalJsonStringify(obj1)).toBe(canonicalJsonStringify(obj2));
    expect(canonicalJsonStringify(obj1)).toBe('{"a":{"x":3,"y":2},"m":[3,2,1],"z":1}');
  });

  it('generates, persists, and reuses Ed25519 identity in SQLite', async () => {
    const id1 = await identityManager.getOrCreateIdentity();
    expect(id1.id).toMatch(/^urn:talon:agent:[a-f0-9-]+$/);
    expect(id1.name).toBe('Test Node Alpha');
    expect(id1.publicKey).toContain('BEGIN PUBLIC KEY');
    expect(id1.privateKey).toContain('BEGIN PRIVATE KEY');

    // Subsequent retrieval returns the same cached identity
    const id2 = await identityManager.getOrCreateIdentity();
    expect(id2.id).toBe(id1.id);
    expect(id2.publicKey).toBe(id1.publicKey);

    // Fresh manager instance attached to the same memory finds the persisted identity
    const freshManager = new AgentIdentityManager(memory);
    const id3 = await freshManager.getOrCreateIdentity();
    expect(id3.id).toBe(id1.id);
    expect(id3.publicKey).toBe(id1.publicKey);
  });

  it('signs payload and verifies authentic signature', async () => {
    const payload = {
      taskId: 'task-999',
      command: 'convert_currency',
      args: { amount: 150, from: 'USD', to: 'IDR' },
    };

    const headers = await identityManager.signPayload(payload);
    expect(headers.agentId).toMatch(/^urn:talon:agent:/);
    expect(headers.signature).toBeTruthy();
    expect(headers.nonce).toBeTruthy();
    expect(headers.timestamp).toBeGreaterThan(0);

    const verification = identityManager.verifyRequestSignature(payload, headers);
    expect(verification.valid).toBe(true);
    expect(verification.signerAgentId).toBe(headers.agentId);
  });

  it('rejects tampered payload', async () => {
    const originalPayload = { action: 'transfer', amount: 100 };
    const headers = await identityManager.signPayload(originalPayload);

    // Attacker tampers with the payload
    const tamperedPayload = { action: 'transfer', amount: 10000 };
    const verification = identityManager.verifyRequestSignature(tamperedPayload, headers);

    expect(verification.valid).toBe(false);
    expect(verification.error).toContain('ERR_INVALID_SIGNATURE');
  });

  it('rejects replayed nonce (replay attack prevention)', async () => {
    const payload = { event: 'ping', id: 42 };
    const headers = await identityManager.signPayload(payload);

    // First attempt succeeds
    const firstVerify = identityManager.verifyRequestSignature(payload, headers);
    expect(firstVerify.valid).toBe(true);

    // Second attempt with exact same nonce fails
    const secondVerify = identityManager.verifyRequestSignature(payload, headers);
    expect(secondVerify.valid).toBe(false);
    expect(secondVerify.error).toContain('ERR_NONCE_REPLAY');
  });

  it('rejects requests with excessive clock skew', async () => {
    const payload = { ping: true };
    const headers = await identityManager.signPayload(payload);

    // Manipulate timestamp to 60 seconds in the past (threshold is 10s)
    const skewedHeaders = {
      ...headers,
      timestamp: Date.now() - 60_000,
    };

    const verification = identityManager.verifyRequestSignature(payload, skewedHeaders);
    expect(verification.valid).toBe(false);
    expect(verification.error).toContain('ERR_CLOCK_SKEW');
  });
});
