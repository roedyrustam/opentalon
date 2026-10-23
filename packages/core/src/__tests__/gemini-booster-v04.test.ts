import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ThinkingBudgetCalculator,
  DualBrainRouter,
  GeminiDriver,
  EvolutionEngine,
  type ILLMPort,
  type LLMRequest,
  type LLMResponse,
} from '../index.js';
import { LibSqlMemoryAdapter } from '@opentalon/memory';
import { SandboxedVmRunner } from '@opentalon/skill-engine';

describe('Gemini Agent Booster v0.4.0 — Multimodal, Grounded Memory & Speculative Evolution', () => {
  describe('1. Native Multimodal Vision & Document Ingestion', () => {
    it('escalates ThinkingBudgetCalculator score when multimodal attachments are present', () => {
      const textOnly = ThinkingBudgetCalculator.evaluate({
        input: 'Check this invoice',
        attachmentCount: 0,
      });
      const withVision = ThinkingBudgetCalculator.evaluate({
        input: 'Check this invoice',
        attachmentCount: 2,
      });

      expect(withVision.entropyScore).toBeGreaterThan(textOnly.entropyScore);
      expect(withVision.thinkingBudget).toBeGreaterThan(textOnly.thinkingBudget);
      expect(withVision.reasons).toContain('multimodal_grounding(2)');
    });

    it('serializes MultimodalAttachment into Gemini inlineData parts cleanly', async () => {
      const driver = new GeminiDriver({
        apiKey: 'mock-key',
        primaryModel: 'gemini-4-pro',
      });

      let capturedBody: Record<string, unknown> | null = null;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
        capturedBody = JSON.parse(String(init?.body || '{}'));
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'Parsed invoice total: $450.00' }] } }],
            usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 15, totalTokenCount: 135 },
          }),
          { status: 200 }
        );
      });

      try {
        const res = await driver.generateContent({
          messages: [
            {
              role: 'user',
              content: 'Extract total from this receipt',
              attachments: [
                {
                  mimeType: 'image/png',
                  data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA',
                  name: 'receipt.png',
                },
              ],
            },
          ],
        });

        expect(res.content).toContain('$450.00');
        expect(capturedBody).not.toBeNull();
        const contents = (capturedBody as any).contents;
        expect(contents[0].parts).toHaveLength(2);
        expect(contents[0].parts[0]).toEqual({ text: 'Extract total from this receipt' });
        expect(contents[0].parts[1]).toEqual({
          inlineData: {
            mimeType: 'image/png',
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAUA', // Stripped data:image/png;base64, prefix
          },
        });
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe('2. Autonomous Grounded Research Memory Persistence', () => {
    let memory: LibSqlMemoryAdapter;
    let sandbox: SandboxedVmRunner;

    beforeEach(async () => {
      memory = new LibSqlMemoryAdapter({ url: ':memory:' });
      await memory.initialize();
      sandbox = new SandboxedVmRunner();
    });

    it('automatically saves verified Google Search Grounding citations into semantic_facts', async () => {
      const mockLlm: ILLMPort = {
        createEmbedding: async () => new Array(768).fill(0.05),
        generateContent: async (): Promise<LLMResponse> => ({
          content: 'Node.js 24 LTS introduces updated V8 and native permission models.',
          tokensUsed: { promptTokens: 40, completionTokens: 25, totalTokens: 65 },
          model: 'gemini-4-pro',
          groundingMetadata: {
            webSearchQueries: ['Node.js 24 LTS release features'],
            sources: [
              {
                title: 'Node.js Official Release Blog',
                url: 'https://nodejs.org/en/blog/release/v24.0.0',
                snippet: 'Node.js 24 brings V8 13.x and performance improvements.',
              },
              {
                title: 'V8 Engine Changelog',
                url: 'https://v8.dev/blog/v8-release-13',
              },
            ],
          },
        }),
      };

      const router = new DualBrainRouter({
        memory,
        sandbox,
        llm: mockLlm,
        enableAsyncEvolution: false,
      });

      const res = await router.executeFastPath({
        sessionId: 'sess_research',
        input: 'What is new in Node.js 24 LTS?',
        enableSearchGrounding: true,
      });

      expect(res.groundedFactsSaved).toBe(2);

      const savedFacts = await memory.listFacts({ category: 'grounded_research' });
      expect(savedFacts).toHaveLength(2);
      expect(savedFacts.some((f) => f.value.includes('nodejs.org/en/blog/release/v24.0.0'))).toBe(
        true
      );
    });
  });

  describe('3. Speculative Multi-Draft Skill Evolution (Parallel Sandbox Benchmarking)', () => {
    let memory: LibSqlMemoryAdapter;
    let sandbox: SandboxedVmRunner;

    beforeEach(async () => {
      memory = new LibSqlMemoryAdapter({ url: ':memory:' });
      await memory.initialize();
      sandbox = new SandboxedVmRunner();
    });

    it('synthesizes multiple speculative candidate drafts in parallel and commits the fastest passing winner', async () => {
      const seenTemperatures: Array<number | undefined> = [];

      const mockLlm: ILLMPort = {
        createEmbedding: async () => new Array(768).fill(0.1),
        generateContent: async (req: LLMRequest): Promise<LLMResponse> => {
          seenTemperatures.push(req.temperature);

          // Draft 1 (temp 0.1): Verbose implementation
          if (req.temperature === 0.1) {
            return {
              content: `---
name: array_sum_fast
version: "1.0.0"
description: "Computes sum of numeric array"
capabilities: {"net": {"allowedHosts": [], "allowHttp": false}, "fs": {"readPaths": [], "writePaths": []}, "env": []}
---
\`\`\`javascript
export default async function run(args) {
  const nums = Array.isArray(args.numbers) ? args.numbers : [1, 2, 3];
  let total = 0;
  for (let i = 0; i < nums.length; i++) {
    total = total + Number(nums[i]);
  }
  return { sum: total };
}
\`\`\`
\`\`\`json
[{"args": {"numbers": [10, 20, 30]}, "expected": {"sum": 60}}]
\`\`\``,
              tokensUsed: { promptTokens: 100, completionTokens: 80, totalTokens: 180 },
              model: 'gemini-4-pro',
            };
          }

          // Draft 2 (temp 0.35): Concise fast implementation
          return {
            content: `---
name: array_sum_fast
version: "1.0.0"
description: "Computes sum of numeric array"
capabilities: {"net": {"allowedHosts": [], "allowHttp": false}, "fs": {"readPaths": [], "writePaths": []}, "env": []}
---
\`\`\`javascript
export default async function run(args) {
  const nums = args.numbers || [1, 2, 3];
  return { sum: nums.reduce((a, b) => a + b, 0) };
}
\`\`\`
\`\`\`json
[{"args": {"numbers": [10, 20, 30]}, "expected": {"sum": 60}}]
\`\`\``,
            tokensUsed: { promptTokens: 100, completionTokens: 60, totalTokens: 160 },
            model: 'gemini-4-pro',
          };
        },
      };

      // Seed failed traces to trigger an evolution opportunity
      for (let i = 0; i < 3; i++) {
        await memory.saveTrace({
          id: `tr_fail_${i}`,
          sessionId: 's1',
          input: 'Calculate sum of numbers [10, 20, 30]',
          output: 'Failed',
          retrievedSkillIds: [],
          toolCalls: [],
          tokensUsed: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
          latencyMs: 10,
          success: false,
          errorMessage: 'No skill found for array sum',
          timestamp: Date.now(),
        });
      }

      const engine = new EvolutionEngine(memory, sandbox, mockLlm, {
        speculativeDraftCount: 3,
      });

      const report = await engine.runEvolutionCycle({ speculativeDraftCount: 3 });

      expect(report.opportunitiesFound).toBeGreaterThanOrEqual(1);
      expect(report.skillsSynthesized).toHaveLength(1);
      expect(report.skillsSynthesized[0].name).toBe('array_sum_fast');
      expect(report.skillsSynthesized[0].draftsEvaluated).toBe(3);
      expect(seenTemperatures).toEqual([0.1, 0.35, 0.6]);

      const savedSkill = await memory.getSkill('array_sum_fast');
      expect(savedSkill).not.toBeNull();
    });
  });

  describe('4. Sovereign FinOps Cost Envelope & Frugal Throttle Guard', () => {
    let memory: LibSqlMemoryAdapter;
    let sandbox: SandboxedVmRunner;

    beforeEach(async () => {
      memory = new LibSqlMemoryAdapter({ url: ':memory:' });
      await memory.initialize();
      sandbox = new SandboxedVmRunner();
    });

    it('tracks per-model USD cost, KV-cache USD savings, and activates frugal throttle at >=80% budget', async () => {
      const capturedBudgets: Array<number | undefined> = [];

      const mockLlm: ILLMPort = {
        createEmbedding: async () => new Array(768).fill(0.1),
        generateContent: async (req: LLMRequest): Promise<LLMResponse> => {
          capturedBudgets.push(req.thinkingConfig?.thinkingBudget);
          return {
            content: 'Architecture verified.',
            tokensUsed: { promptTokens: 500, completionTokens: 400, totalTokens: 900 },
            model: 'gemini-4-pro',
          };
        },
      };

      const { FinOpsBudgetTracker } = await import('../index.js');
      // Set a low daily token ceiling (1000 tokens) so after turn 1 (900 tokens = 90% > 80%), frugal throttle activates!
      const finopsTracker = new FinOpsBudgetTracker({
        dailyTokenCeiling: 1000,
        dailyCostCeilingUsd: 1.0,
        throttleThresholdPct: 80,
      });

      const router = new DualBrainRouter({
        memory,
        sandbox,
        llm: mockLlm,
        finopsTracker,
        enableAsyncEvolution: false,
      });

      // Turn 1: Before throttle — architectural query gets >= 8192 thinkingBudget
      const turn1 = await router.executeFastPath({
        sessionId: 'sess_finops',
        input: 'Refactor distributed concurrency architecture and formally verify race conditions',
      });
      expect(turn1.thinkingBudgetUsed).toBeGreaterThanOrEqual(8192);
      expect(finopsTracker.isFrugalThrottleActive()).toBe(true); // 900 / 1000 = 90% >= 80%

      // Turn 2: With frugal throttle active, same deep query is automatically capped to 2048!
      const turn2 = await router.executeFastPath({
        sessionId: 'sess_finops',
        input: 'Refactor distributed concurrency architecture and formally verify race conditions',
      });
      expect(turn2.thinkingBudgetUsed).toBe(2048);
      expect(turn2.thinkingTier).toBe('fast');

      const report = finopsTracker.getReport();
      expect(report.totalCalls).toBe(2);
      expect(report.totalEstimatedCostUsd).toBeGreaterThan(0);
      expect(report.totalEstimatedSavingsUsd).toBeGreaterThan(0); // Turn 2 hit canonical prefix!
      expect(report.frugalThrottleActive).toBe(true);
    });
  });
});
