import { describe, it, expect, beforeEach } from 'vitest';
import { EvolutionEngine } from '../evolution/evolution-engine.js';
import { HeuristicsExtractor } from '../evolution/heuristics-extractor.js';
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

  beforeEach(async () => {
    memory = new LibSqlMemoryAdapter({ url: ':memory:' });
    await memory.initialize();
    sandbox = new SandboxedVmRunner();
    mockLLM = new MockLLMDriver();
    engine = new EvolutionEngine(memory, sandbox, mockLLM);
  });

  it('runs complete evolution cycle and commits verified skill to memory', async () => {
    // 1. Seed a missing-skill trace into memory
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

    // 2. Configure Mock LLM to return a valid SKILL.md for semver parsing
    mockLLM.mockResponse = {
      content: `---
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
`,
      tokensUsed: { promptTokens: 120, completionTokens: 80, totalTokens: 200 },
      model: 'gemini-reflection-mock',
    };

    // 3. Run Evolution Cycle
    const report = await engine.runEvolutionCycle();
    expect(report.opportunitiesFound).toBeGreaterThan(0);
    expect(report.skillsSynthesized).toHaveLength(1);
    expect(report.skillsSynthesized[0].name).toBe('parse_semver');

    // 4. Verify skill is now committed in procedural memory
    const savedSkill = await memory.getSkill('parse_semver');
    expect(savedSkill).not.toBeNull();
    expect(savedSkill?.name).toBe('parse_semver');
    expect(savedSkill?.hash).toBeDefined();
  });
});
