import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LibSqlMemoryAdapter } from '../libsql-adapter.js';
import { cosineSimilarity, reciprocalRankFusion } from '../rrf.js';
import { type EpisodicTrace, type ProceduralSkill } from '../types.js';

describe('Memory Package - RRF & Cosine Similarity', () => {
  it('calculates cosine similarity correctly', () => {
    const v1 = [1, 0, 0];
    const v2 = [1, 0, 0];
    const v3 = [0, 1, 0];
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(1.0);
    expect(cosineSimilarity(v1, v3)).toBeCloseTo(0.0);
  });

  it('performs Reciprocal Rank Fusion correctly', () => {
    const fts = [
      { id: 'skill-a', item: 'A' },
      { id: 'skill-b', item: 'B' },
    ];
    const vec = [
      { id: 'skill-b', item: 'B' },
      { id: 'skill-c', item: 'C' },
    ];

    const result = reciprocalRankFusion(fts, vec, 60);
    // skill-b appears in both rankings (rank 2 in fts, rank 1 in vec)
    // score for b = 1/(60+2) + 1/(60+1) = 1/62 + 1/61 = ~0.0325
    // score for a = 1/(60+1) = ~0.0163
    // score for c = 1/(60+2) = ~0.0161
    expect(result[0].item).toBe('B');
    expect(result[0].rrfScore).toBeGreaterThan(result[1].rrfScore);
  });
});

describe('LibSqlMemoryAdapter (In-Memory Engine)', () => {
  let adapter: LibSqlMemoryAdapter;

  beforeEach(async () => {
    adapter = new LibSqlMemoryAdapter({
      url: ':memory:',
    });
    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.close();
  });

  it('saves and retrieves episodic traces', async () => {
    const trace: EpisodicTrace = {
      id: 'trace-1',
      sessionId: 'sess-abc',
      input: 'Calculate fibonacci',
      output: 'Fibonacci computed',
      retrievedSkillIds: ['skill-fib'],
      toolCalls: [
        {
          toolName: 'fibonacci',
          args: { n: 10 },
          result: 55,
          success: true,
          durationMs: 12,
        },
      ],
      tokensUsed: {
        promptTokens: 120,
        completionTokens: 30,
        totalTokens: 150,
      },
      latencyMs: 180,
      success: true,
      timestamp: Date.now(),
    };

    await adapter.saveTrace(trace);
    const sessionTraces = await adapter.getTracesBySession('sess-abc');
    expect(sessionTraces).toHaveLength(1);
    expect(sessionTraces[0].id).toBe('trace-1');
    expect(sessionTraces[0].toolCalls[0].toolName).toBe('fibonacci');
  });

  it('saves, searches, and deletes procedural skills', async () => {
    const skillA: ProceduralSkill = {
      id: 'skill-1',
      name: 'fetch_weather',
      description: 'Fetch current weather forecasts for cities worldwide',
      capabilities: {
        net: { allowedHosts: ['api.weather.com'], allowHttp: false },
      },
      version: '1.0.0',
      code: 'export default async function run() { return { temp: 25 }; }',
      hash: 'sha256-abc',
      embedding: [0.1, 0.9, 0.2],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const skillB: ProceduralSkill = {
      id: 'skill-2',
      name: 'send_email',
      description: 'Send transactional emails to registered users',
      capabilities: {
        net: { allowedHosts: ['api.resend.com'], allowHttp: false },
      },
      version: '1.0.0',
      code: 'export default async function run() { return { sent: true }; }',
      hash: 'sha256-def',
      embedding: [0.9, 0.1, 0.1],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await adapter.saveSkill(skillA);
    await adapter.saveSkill(skillB);

    const retrieved = await adapter.getSkill('fetch_weather');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.name).toBe('fetch_weather');

    // Hybrid Search: Searching for weather query with close embedding to skillA
    const searchResults = await adapter.searchSkillsHybrid(
      'weather forecast',
      [0.12, 0.88, 0.19],
      5
    );

    expect(searchResults.length).toBeGreaterThan(0);
    expect(searchResults[0].item.name).toBe('fetch_weather');

    // Delete skill
    const deleted = await adapter.deleteSkill('skill-1');
    expect(deleted).toBe(true);

    const recheck = await adapter.getSkill('fetch_weather');
    expect(recheck).toBeNull();
  });
});
