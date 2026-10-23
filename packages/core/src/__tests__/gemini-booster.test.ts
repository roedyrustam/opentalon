import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ThinkingBudgetCalculator,
  TokenBudgeter,
  ContextCacheManager,
  DualBrainRouter,
  GeminiDriver,
  type ILLMPort,
  type LLMRequest,
  type LLMResponse,
  type ToolDefinition,
  type SemanticFact,
} from '../index.js';
import { LibSqlMemoryAdapter } from '@opentalon/memory';
import { SandboxedVmRunner } from '@opentalon/skill-engine';

describe('Gemini Agent Booster — v0.3.0 Engine Suite', () => {
  describe('1. ThinkingBudgetCalculator (O(1) Task Entropy Evaluator)', () => {
    it('allocates 0 thinking budget for trivial greetings or short fast-path queries', () => {
      const res = ThinkingBudgetCalculator.evaluate({
        input: 'Hello there!',
        toolCount: 0,
      });
      expect(res.tier).toBe('fast');
      expect(res.thinkingBudget).toBe(0);
      expect(res.mode).toBe('fast');
    });

    it('allocates 2048 budget when routing to tools on simple input', () => {
      const res = ThinkingBudgetCalculator.evaluate({
        input: 'Convert 100 USD to IDR',
        toolCount: 2,
      });
      expect(res.tier).toBe('fast');
      expect(res.thinkingBudget).toBe(2048);
    });

    it('allocates balanced budget (4096 - 8192) for analytical multi-tool queries', () => {
      const res = ThinkingBudgetCalculator.evaluate({
        input: 'Please analyze and compare the performance workflow across our pipeline stages.',
        toolCount: 4,
      });
      expect(res.tier).toBe('balanced');
      expect(res.thinkingBudget).toBeGreaterThanOrEqual(4096);
      expect(res.thinkingBudget).toBeLessThanOrEqual(8192);
    });

    it('allocates deep budget (16384 - 32768) for architectural, security, or code tasks', () => {
      const res = ThinkingBudgetCalculator.evaluate({
        input:
          'Refactor the distributed concurrency lock architecture and formally verify race condition invariants:\n```ts\nasync function acquireLock() {}\n```',
        toolCount: 2,
      });
      expect(res.tier).toBe('deep');
      expect(res.thinkingBudget).toBeGreaterThanOrEqual(16384);
      expect(res.mode).toBe('deep');
    });

    it('escalates budget on sandbox self-healing retry', () => {
      const initial = ThinkingBudgetCalculator.evaluate({
        input: 'Calculate stats for dataset',
        toolCount: 1,
        isRetry: false,
      });
      const escalated = ThinkingBudgetCalculator.evaluate({
        input: 'Calculate stats for dataset',
        toolCount: 1,
        isRetry: true,
      });
      expect(escalated.thinkingBudget).toBeGreaterThan(initial.thinkingBudget);
      expect(escalated.reasons).toContain('self_healing_retry_escalation');
    });

    it('honors explicit caller thinkingConfig overrides', () => {
      const res = ThinkingBudgetCalculator.evaluate({
        input: 'Hi',
        overrideConfig: { thinkingBudget: 32768, mode: 'deep' },
      });
      expect(res.thinkingBudget).toBe(32768);
      expect(res.tier).toBe('deep');
      expect(res.reasons).toContain('explicit_override');
    });
  });

  describe('2. TokenBudgeter Canonical KV-Cache Prefix Pinning', () => {
    it('produces byte-identical prefixHash regardless of input tool or fact ordering', () => {
      const toolsOrderA: ToolDefinition[] = [
        {
          name: 'zeta_tool',
          description: 'Zeta',
          parameters: { b: 2, a: 1 },
        },
        {
          name: 'alpha_tool',
          description: 'Alpha',
          parameters: { y: 'yes', x: 'no' },
        },
      ];

      const toolsOrderB: ToolDefinition[] = [
        {
          name: 'alpha_tool',
          description: 'Alpha',
          parameters: { x: 'no', y: 'yes' },
        },
        {
          name: 'zeta_tool',
          description: 'Zeta',
          parameters: { a: 1, b: 2 },
        },
      ];

      const factsOrderA: SemanticFact[] = [
        {
          id: 'f2',
          category: 'system_state',
          key: 'region',
          value: 'ap-southeast-1',
          confidence: 1,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'f1',
          category: 'domain_entity',
          key: 'currency',
          value: 'IDR',
          confidence: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      ];

      const factsOrderB: SemanticFact[] = [...factsOrderA].reverse();

      const resA = TokenBudgeter.buildCanonicalSystemPrompt(
        'Base system prompt',
        factsOrderA,
        toolsOrderA
      );
      const resB = TokenBudgeter.buildCanonicalSystemPrompt(
        'Base system prompt',
        factsOrderB,
        toolsOrderB
      );

      expect(resA.prefixHash).toBe(resB.prefixHash);
      expect(resA.systemPrompt).toBe(resB.systemPrompt);
      expect(JSON.stringify(resA.canonicalTools)).toBe(JSON.stringify(resB.canonicalTools));
      expect(resA.canonicalTools[0].name).toBe('alpha_tool');
    });
  });

  describe('3. ContextCacheManager Prefix Tracking, Eviction & Fallback', () => {
    it('tracks deterministic prefix hits and estimates saved tokens even below explicit cache threshold', async () => {
      const mgr = new ContextCacheManager({ minTokenThreshold: 32768, maxEntries: 5 });
      const prefix = 'You are OpenTalon. Verified Knowledge Context: user prefers dark mode.';

      const first = await mgr.trackPrefixAndResolveCache(prefix);
      expect(first.prefixHit).toBe(false);
      expect(first.cacheHit).toBe(false);
      expect(first.tokensSaved).toBe(0);

      const second = await mgr.trackPrefixAndResolveCache(prefix);
      expect(second.prefixHit).toBe(true);
      expect(second.prefixHash).toBe(first.prefixHash);
      expect(second.tokensSaved).toBeGreaterThan(0);

      const stats = mgr.getStats();
      expect(stats.prefixHits).toBe(1);
      expect(stats.estimatedTokensSaved).toBe(second.tokensSaved);
    });

    it('enforces maxEntries bound to prevent memory leaks on long-running daemons', async () => {
      const mgr = new ContextCacheManager({ maxEntries: 3 });
      await mgr.trackPrefixAndResolveCache('prefix_1');
      await mgr.trackPrefixAndResolveCache('prefix_2');
      await mgr.trackPrefixAndResolveCache('prefix_3');
      await mgr.trackPrefixAndResolveCache('prefix_4');

      expect(mgr.getStats().trackedPrefixes).toBeLessThanOrEqual(3);
    });

    it('creates explicit Gemini cache when threshold is met and falls back to Gemini 3.8 Flash on error', async () => {
      const driver = new GeminiDriver({
        apiKey: 'test-key',
        primaryModel: 'gemini-4-pro',
        fallbackModel: 'gemini-3.8-flash',
      });

      const createCacheSpy = vi
        .spyOn(driver, 'createCache')
        .mockRejectedValueOnce(new Error('429 RESOURCE_EXHAUSTED on gemini-4-pro'))
        .mockResolvedValueOnce({
          name: 'cachedContents/fallback_cache_123',
          expireTime: new Date(Date.now() + 3600000).toISOString(),
          model: 'models/gemini-3.8-flash',
        });

      const mgr = new ContextCacheManager({
        driver,
        minTokenThreshold: 10, // Low threshold for unit testing
      });

      const largePrompt = 'A'.repeat(200);
      const res1 = await mgr.trackPrefixAndResolveCache(largePrompt);
      expect(res1.cachedContentId).toBe('cachedContents/fallback_cache_123');
      expect(createCacheSpy).toHaveBeenCalledTimes(2);

      // Second call with identical content should hit active cache without calling API again
      const res2 = await mgr.trackPrefixAndResolveCache(largePrompt);
      expect(res2.cachedContentId).toBe('cachedContents/fallback_cache_123');
      expect(res2.cacheHit).toBe(true);
      expect(createCacheSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('4. DualBrainRouter Auto-Wiring Integration', () => {
    let memory: LibSqlMemoryAdapter;
    let sandbox: SandboxedVmRunner;

    beforeEach(async () => {
      memory = new LibSqlMemoryAdapter({ url: ':memory:' });
      await memory.initialize();
      sandbox = new SandboxedVmRunner();
    });

    it('automatically wires dynamic thinkingBudget, canonical prefix hash, and escalates on sandbox retry', async () => {
      const capturedRequests: LLMRequest[] = [];

      const mockLlm: ILLMPort = {
        createEmbedding: async () => new Array(768).fill(0.1),
        generateContent: async (req: LLMRequest): Promise<LLMResponse> => {
          capturedRequests.push(req);
          // On first call, invoke a failing skill to trigger self-correction retry
          if (capturedRequests.length === 1) {
            return {
              content: '',
              toolCalls: [{ id: 'tc_1', name: 'failing_skill', args: {} }],
              tokensUsed: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
              model: 'gemini-4-argon',
            };
          }
          return {
            content: 'Recovered gracefully after deep thinking analysis.',
            tokensUsed: { promptTokens: 60, completionTokens: 30, totalTokens: 90 },
            model: 'gemini-4-argon',
          };
        },
      };

      await memory.saveSkill({
        id: 'sk_fail',
        name: 'failing_skill',
        description: 'A skill that throws an error for testing retry escalation',
        capabilities: {},
        version: '1.0.0',
        code: 'export default async function run() { throw new Error("Simulated sandbox crash"); }',
        hash: 'hash_fail',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const router = new DualBrainRouter({
        memory,
        sandbox,
        llm: mockLlm,
        enableAsyncEvolution: false,
      });

      const res = await router.executeFastPath({
        sessionId: 'sess_booster',
        input: 'Run failing_skill and analyze the workflow',
      });

      expect(res.output).toContain('Recovered gracefully');
      expect(res.prefixHash).toBeDefined();
      expect(res.thinkingBudgetUsed).toBeGreaterThanOrEqual(16384); // Escalated on retry!
      expect(capturedRequests.length).toBe(2);
      // Verify second LLM call (repair turn) had higher thinkingBudget than initial call
      const initialBudget = capturedRequests[0].thinkingConfig?.thinkingBudget ?? 0;
      const retryBudget = capturedRequests[1].thinkingConfig?.thinkingBudget ?? 0;
      expect(retryBudget).toBeGreaterThan(initialBudget);

      // Verify second FastPath turn with same context registers a prefixHit
      const res2 = await router.executeFastPath({
        sessionId: 'sess_booster',
        input: 'Run failing_skill and analyze the workflow',
      });
      expect(res2.prefixHit).toBe(true);
      expect(router.getBoosterStats().prefixHits).toBeGreaterThanOrEqual(1);
    });
  });
});
