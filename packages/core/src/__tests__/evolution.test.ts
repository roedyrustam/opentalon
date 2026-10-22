import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EvolutionEngine } from '../evolution/evolution-engine.js';
import { HeuristicsExtractor } from '../evolution/heuristics-extractor.js';
import { DualBrainRouter } from '../router/dual-brain-router.js';
import { LibSqlMemoryAdapter, type EpisodicTrace } from '@opentalon/memory';
import { SandboxedVmRunner } from '@opentalon/skill-engine';
import { MockLLMDriver } from '../drivers/mock-driver.js';

describe('Evolution Engine - Heuristics Extractor', () => {
  it('extracts healing opportunities from failed traces', () => {
    const traces: EpisodicTrace[] = [
      {
        id: 'trace-fail-1',
        sessionId: 'sess-1',
        input: 'Calculate interest rate',
        output: 'Error: Rate calculation failed',
        retrievedSkillIds: ['calc_interest'],
        toolCalls: [
          {
            toolName: 'calc_interest',
            args: { principal: 1000 },
            result: 'TypeError: rate is undefined',
            success: false,
            durationMs: 15,
          },
        ],
        tokensUsed: { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
        latencyMs: 120,
        success: false,
        errorMessage: 'calc_interest threw an uncaught exception',
        timestamp: Date.now(),
      },
    ];

    const opps = HeuristicsExtractor.extractOpportunities(traces);
    expect(opps).toHaveLength(1);
    expect(opps[0].type).toBe('heal_failure');
    expect(opps[0].failedToolName).toBe('calc_interest');
  });

  it('extracts synthesis opportunities for repetitive missing-skill queries', () => {
    const traces: EpisodicTrace[] = [
      {
        id: 'trace-miss-1',
        sessionId: 'sess-2',
        input: 'generate random uuid string',
        output: 'I cannot generate random strings directly.',
        retrievedSkillIds: [],
        toolCalls: [],
        tokensUsed: { promptTokens: 40, completionTokens: 15, totalTokens: 55 },
        latencyMs: 90,
        success: true,
        timestamp: Date.now(),
      },
    ];

    const opps = HeuristicsExtractor.extractOpportunities(traces);
    expect(opps.length).toBeGreaterThan(0);
    expect(opps[0].type).toBe('synthesize_new');
    expect(opps[0].sampleInputs[0]).toContain('generate random uuid string');
  });
});

describe('Evolution Engine - Autonomous Evolution Cycle', () => {
  let memory: LibSqlMemoryAdapter;
  let sandbox: SandboxedVmRunner;
  let mockLLM: MockLLMDriver;
  let engine: EvolutionEngine;

  const validSkillMarkdown = `---
name: parse_semver
version: "1.0.0"
description: "Parses major, minor, patch from semantic version string"
capabilities: {"net": {"allowedHosts": [], "allowHttp": false}}
---

# parse_semver
Parses semver strings.

## Implementation

\`\`\`javascript
export default async function run(args) {
  const parts = String(args.version).split('.').map(Number);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
  };
}
\`\`\`

## Test Cases

\`\`\`json
[
  {
    "args": { "version": "2.4.1" },
    "expected": { "major": 2, "minor": 4, "patch": 1 }
  }
]
\`\`\`
`;

  beforeEach(async () => {
    memory = new LibSqlMemoryAdapter({ url: ':memory:' });
    await memory.initialize();
    sandbox = new SandboxedVmRunner();
    mockLLM = new MockLLMDriver();
    engine = new EvolutionEngine(memory, sandbox, mockLLM, {
      maxRetriesPerOpportunity: 2,
      maxSynthesesPerHour: 2,
      enableSelfHealingRetry: true,
    });
  });

  it('runs complete evolution cycle and commits verified skill to memory', async () => {
    await memory.saveTrace({
      id: 'trace-seed-1',
      sessionId: 'sess-seed',
      input: 'parse semver string version',
      output: 'Unable to parse semver.',
      retrievedSkillIds: [],
      toolCalls: [],
      tokensUsed: { promptTokens: 40, completionTokens: 10, totalTokens: 50 },
      latencyMs: 80,
      success: true,
      timestamp: Date.now(),
    });

    mockLLM.mockResponse = {
      content: validSkillMarkdown,
      tokensUsed: { promptTokens: 120, completionTokens: 80, totalTokens: 200 },
      model: 'gemini-reflection-mock',
    };

    const report = await engine.runEvolutionCycle();
    expect(report.opportunitiesFound).toBeGreaterThan(0);
    expect(report.skillsSynthesized).toHaveLength(1);
    expect(report.skillsSynthesized[0].name).toBe('parse_semver');

    const savedSkill = await memory.getSkill('parse_semver');
    expect(savedSkill).not.toBeNull();
    expect(savedSkill?.name).toBe('parse_semver');
    expect(savedSkill?.hash).toBeDefined();
  });

  it('supports dry-run mode without committing to database', async () => {
    await memory.saveTrace({
      id: 'trace-seed-dry',
      sessionId: 'sess-dry',
      input: 'parse semver string version',
      output: 'Unable to parse semver.',
      retrievedSkillIds: [],
      toolCalls: [],
      tokensUsed: { promptTokens: 40, completionTokens: 10, totalTokens: 50 },
      latencyMs: 80,
      success: true,
      timestamp: Date.now(),
    });

    mockLLM.mockResponse = {
      content: validSkillMarkdown,
      tokensUsed: { promptTokens: 120, completionTokens: 80, totalTokens: 200 },
      model: 'gemini-reflection-mock',
    };

    const report = await engine.runEvolutionCycle({ dryRun: true });
    expect(report.skillsSynthesized).toHaveLength(1);

    // In dry-run, DB should NOT contain the skill
    const inDb = await memory.getSkill('parse_semver');
    expect(inDb).toBeNull();
  });

  it('circuit breaker trips after repeated synthesis failures', async () => {
    await memory.saveTrace({
      id: 'trace-fail-loop',
      sessionId: 'sess-fail',
      input: 'parse semver string version',
      output: 'Unable to parse semver.',
      retrievedSkillIds: [],
      toolCalls: [],
      tokensUsed: { promptTokens: 40, completionTokens: 10, totalTokens: 50 },
      latencyMs: 80,
      success: true,
      timestamp: Date.now(),
    });

    // LLM outputs syntax error code that will fail sandbox verification
    mockLLM.mockResponse = {
      content: `---
name: broken_skill
version: "1.0.0"
description: "Syntax error skill"
capabilities: {}
---
\`\`\`javascript
export default async function run() {
  throw new Error("Deliberate failure in sandbox");
}
\`\`\`
`,
      tokensUsed: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      model: 'mock-llm',
    };

    // Attempt 1: Fails
    const rep1 = await engine.runEvolutionCycle();
    expect(rep1.errors.length).toBeGreaterThan(0);

    // Attempt 2: Fails
    const rep2 = await engine.runEvolutionCycle();
    expect(rep2.errors.length).toBeGreaterThan(0);

    // Attempt 3: Circuit breaker should trip and skip
    const rep3 = await engine.runEvolutionCycle();
    expect(rep3.skipped.length).toBeGreaterThan(0);
    expect(rep3.skipped[0].reason).toContain('Circuit breaker tripped');
  });

  it('enforces FinOps rate throttle when hourly quota is reached', async () => {
    await memory.saveTrace({
      id: 'trace-finops-1',
      sessionId: 'sess-finops',
      input: 'parse semver string version',
      output: 'Unable to parse semver.',
      retrievedSkillIds: [],
      toolCalls: [],
      tokensUsed: { promptTokens: 40, completionTokens: 10, totalTokens: 50 },
      latencyMs: 80,
      success: true,
      timestamp: Date.now(),
    });

    mockLLM.mockResponse = {
      content: validSkillMarkdown,
      tokensUsed: { promptTokens: 120, completionTokens: 80, totalTokens: 200 },
      model: 'gemini-reflection-mock',
    };

    // First 2 succeed (maxSynthesesPerHour is configured as 2 in beforeEach)
    await engine.runEvolutionCycle();
    await engine.runEvolutionCycle();

    // 3rd attempt trips FinOps limit
    const rep3 = await engine.runEvolutionCycle();
    expect(rep3.skipped.length).toBeGreaterThan(0);
    expect(rep3.skipped[0].reason).toContain('FinOps rate limit reached');
  });
});

describe('DualBrainRouter - Debounced Evolution Queue Integration', () => {
  let memory: LibSqlMemoryAdapter;
  let sandbox: SandboxedVmRunner;
  let mockLLM: MockLLMDriver;
  let router: DualBrainRouter;

  beforeEach(async () => {
    memory = new LibSqlMemoryAdapter({ url: ':memory:' });
    await memory.initialize();
    sandbox = new SandboxedVmRunner();
    mockLLM = new MockLLMDriver();

    router = new DualBrainRouter({
      memory,
      sandbox,
      llm: mockLLM,
      evolutionDebounceMs: 50, // Short debounce for testing
      maxEvolutionBatchSize: 2,
    });
  });

  afterEach(() => {
    router.dispose();
  });

  it('queues traces and auto-flushes evolution queue when batch threshold is reached', async () => {
    mockLLM.mockResponse = {
      content: `---
name: format_currency
version: "1.0.0"
description: "Formats number to USD"
capabilities: {}
---
\`\`\`javascript
export default async function run(args) { return { formatted: "$" + args.amount }; }
\`\`\`
`,
      tokensUsed: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
      model: 'mock',
    };

    let slowpathCompleted = false;
    router.on('slowpath:completed', () => {
      slowpathCompleted = true;
    });

    // Push 2 traces to reach maxEvolutionBatchSize = 2
    const trace1: EpisodicTrace = {
      id: 't-1',
      sessionId: 's-1',
      input: 'format money amount',
      output: '...',
      retrievedSkillIds: [],
      toolCalls: [],
      tokensUsed: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      latencyMs: 20,
      success: true,
      timestamp: Date.now(),
    };

    const trace2: EpisodicTrace = {
      id: 't-2',
      sessionId: 's-1',
      input: 'format money amount',
      output: '...',
      retrievedSkillIds: [],
      toolCalls: [],
      tokensUsed: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      latencyMs: 20,
      success: true,
      timestamp: Date.now(),
    };

    await router.processSlowPathEvolution(trace1);
    expect(router.getTraceQueueLength()).toBe(1);

    await router.processSlowPathEvolution(trace2);
    // After second trace, batch flushed immediately
    expect(slowpathCompleted).toBe(true);
    expect(router.getTraceQueueLength()).toBe(0);
  });
});
