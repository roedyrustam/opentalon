import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LibSqlMemoryAdapter } from '../libsql-adapter.js';
import { cosineSimilarity, reciprocalRankFusion } from '../rrf.js';
import { type EpisodicTrace, type ProceduralSkill, type SemanticFact } from '../types.js';

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

  it('saves, searches, lists, and deletes semantic facts', async () => {
    const fact1: SemanticFact = {
      id: 'fact-1',
      sessionId: 'sess-pref',
      category: 'user_preference',
      key: 'preferred_language',
      value: 'id-ID',
      confidence: 0.95,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const fact2: SemanticFact = {
      id: 'fact-2',
      sessionId: 'sess-pref',
      category: 'user_preference',
      key: 'currency_default',
      value: 'IDR',
      confidence: 1.0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const fact3: SemanticFact = {
      id: 'fact-3',
      category: 'system_entity',
      key: 'gateway_merchant_id',
      value: 'MCH_994821',
      confidence: 1.0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await adapter.saveFact(fact1);
    await adapter.saveFact(fact2);
    await adapter.saveFact(fact3);

    // Get specific fact
    const got = await adapter.getFact('preferred_language', 'user_preference');
    expect(got).not.toBeNull();
    expect(got?.value).toBe('id-ID');

    // List facts by category
    const userPrefs = await adapter.listFacts({ category: 'user_preference' });
    expect(userPrefs).toHaveLength(2);

    // Search facts
    const searchRes = await adapter.searchFacts('currency IDR');
    expect(searchRes.length).toBeGreaterThan(0);
    expect(searchRes[0].key).toBe('currency_default');

    // Delete fact
    const deleted = await adapter.deleteFact('fact-1');
    expect(deleted).toBe(true);

    const recheck = await adapter.getFact('preferred_language');
    expect(recheck).toBeNull();
  });

  it('exports and imports memory snapshots accurately', async () => {
    // Seed a skill and a fact
    await adapter.saveSkill({
      id: 'skill-snap-1',
      name: 'calculate_tax',
      description: 'Calculates VAT tax percentage',
      capabilities: {},
      version: '1.0.0',
      code: 'export default async function run(args) { return { tax: args.amount * 0.11 }; }',
      hash: 'sha-tax',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await adapter.saveFact({
      id: 'fact-snap-1',
      category: 'tax_rule',
      key: 'vat_rate',
      value: '11%',
      confidence: 1.0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const snapshot = await adapter.exportSnapshot();
    expect(snapshot.version).toBe('1.0.0');
    expect(snapshot.skills.length).toBeGreaterThanOrEqual(1);
    expect(snapshot.facts.length).toBeGreaterThanOrEqual(1);

    // Create a new fresh memory database and import the snapshot
    const targetAdapter = new LibSqlMemoryAdapter({ url: ':memory:' });
    await targetAdapter.initialize();

    const importRes = await targetAdapter.importSnapshot(snapshot);
    expect(importRes.importedSkills).toBe(snapshot.skills.length);
    expect(importRes.importedFacts).toBe(snapshot.facts.length);

    const importedSkill = await targetAdapter.getSkill('calculate_tax');
    expect(importedSkill).not.toBeNull();
    expect(importedSkill?.description).toBe('Calculates VAT tax percentage');

    const importedFact = await targetAdapter.getFact('vat_rate');
    expect(importedFact).not.toBeNull();
    expect(importedFact?.value).toBe('11%');

    await targetAdapter.close();
  });
});

