import { describe, it, expect, beforeEach } from 'vitest';
import { DualBrainRouter } from '../router/dual-brain-router.js';
import { TokenBudgeter } from '../token/budgeter.js';
import { MockLLMDriver } from '../drivers/mock-driver.js';
import { LibSqlMemoryAdapter } from '@opentalon/memory';
import { SandboxedVmRunner } from '@opentalon/skill-engine';

describe('Core Package - Token Budgeter', () => {
  it('estimates token counts for text and messages accurately', () => {
    const text = 'Hello world, this is OpenTalon!';
    const count = TokenBudgeter.estimateTokens(text);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(text.length);
  });

  it('prunes older messages when exceeding budget', () => {
    const messages = [
      { role: 'user' as const, content: 'Old question 1' },
      { role: 'assistant' as const, content: 'Old answer 1' },
      { role: 'user' as const, content: 'Recent question 2' },
    ];

    const budgeted = TokenBudgeter.fitWithinBudget(
      messages,
      'System prompt',
      undefined,
      30 // very tight budget
    );

    expect(budgeted.length).toBeLessThan(messages.length);
    expect(budgeted[budgeted.length - 1].content).toBe('Recent question 2');
  });
});

describe('Core Package - DualBrainRouter Fast Path & Slow Path', () => {
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
      maxFastPathTokens: 1500,
    });
  });

  it('executes Fast Path and persists trace in memory', async () => {
    mockLLM.mockResponse = {
      content: 'Here is the answer to your calculation.',
      tokensUsed: { promptTokens: 60, completionTokens: 25, totalTokens: 85 },
      model: 'mock-model',
    };

    const result = await router.executeFastPath({
      sessionId: 'session-123',
      input: 'Calculate monthly ROI',
    });

    expect(result.output).toBe('Here is the answer to your calculation.');
    expect(result.tokensUsed.totalTokens).toBe(85);

    // Verify trace in episodic memory
    const traces = await memory.getTracesBySession('session-123');
    expect(traces).toHaveLength(1);
    expect(traces[0].input).toBe('Calculate monthly ROI');
  });

  it('executes tool call through sandbox when triggered by LLM', async () => {
    // Register a procedural skill in memory first
    await memory.saveSkill({
      id: 'skill-cube',
      name: 'cube_number',
      description: 'Calculates the cube of a number',
      capabilities: {},
      version: '1.0.0',
      code: 'export default async function run(args) { return { cube: args.n * args.n * args.n }; }',
      hash: 'sha-cube',
      embedding: [0.5, 0.5, 0.5],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Configure mock LLM to trigger the tool call
    mockLLM.toolCallToTrigger = {
      name: 'cube_number',
      args: { n: 4 },
    };

    const result = await router.executeFastPath({
      sessionId: 'session-tool',
      input: 'What is cube of 4?',
    });

    expect(result.toolCallsMade).toHaveLength(1);
    expect(result.toolCallsMade[0].toolName).toBe('cube_number');
    expect(result.toolCallsMade[0].result).toEqual({ cube: 64 });
  });

  it('synthesizes and registers a skill from SKILL.md format', async () => {
    const rawSkillMd = `---
name: multiply_numbers
version: 1.0.0
description: "Multiplies two numbers together"
capabilities: {}
---

# multiply_numbers
Multiplies two numbers.

## Implementation

\`\`\`javascript
export default async function run(args) {
  return { product: args.a * args.b };
}
\`\`\`
`;

    const skill = await router.synthesizeAndRegisterSkill(rawSkillMd);
    expect(skill.name).toBe('multiply_numbers');

    const inDb = await memory.getSkill('multiply_numbers');
    expect(inDb).not.toBeNull();
    expect(inDb?.name).toBe('multiply_numbers');
  });

  it('retrieves relevant semantic facts and includes them in fast path output', async () => {
    // Seed a semantic fact in memory
    await memory.saveFact({
      id: 'fact-pref-1',
      category: 'user_preference',
      key: 'preferred_currency',
      value: 'IDR',
      confidence: 1.0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    mockLLM.mockResponse = {
      content: 'Using default currency IDR for conversion.',
      tokensUsed: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
      model: 'mock-model',
    };

    const result = await router.executeFastPath({
      sessionId: 'session-facts',
      input: 'Convert currency amount',
    });

    expect(result.retrievedFacts).toBeDefined();
    expect(result.retrievedFacts?.length).toBeGreaterThan(0);
    expect(result.retrievedFacts?.[0].key).toBe('preferred_currency');
    expect(result.retrievedFacts?.[0].value).toBe('IDR');
  });
});

