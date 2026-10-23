import EventEmitter from 'node:events';
import crypto from 'node:crypto';
import {
  type RouterConfig,
  type FastPathOptions,
  type FastPathResult,
  type ChatMessage,
  type ToolDefinition,
  type ILLMPort,
} from '../types.js';
import { type IMemoryPort, type ProceduralSkill, type EpisodicTrace } from '@opentalon/memory';
import {
  type ISkillSandbox,
  type SandboxExecutionResult,
  SkillSynthesizer,
  SkillMarkdownParser,
} from '@opentalon/skill-engine';
import { EvolutionEngine, type EvolutionReport } from '../evolution/evolution-engine.js';
import { TokenBudgeter } from '../token/budgeter.js';
import { ThinkingBudgetCalculator } from '../token/thinking-budget-calculator.js';
import { FinOpsBudgetTracker } from '../token/finops-tracker.js';
import { ContextCacheManager } from '../drivers/context-cache-manager.js';
import { GeminiDriver } from '../drivers/gemini-driver.js';
import { CascadingLLMDriver } from '../drivers/cascading-driver.js';

export class DualBrainRouter extends EventEmitter {
  private memory: IMemoryPort;
  private sandbox: ISkillSandbox;
  private llm: ILLMPort;
  private synthesizer: SkillSynthesizer;
  private evolutionEngine: EvolutionEngine;
  private cacheManager: ContextCacheManager;
  private finopsTracker: FinOpsBudgetTracker;
  private maxFastPathTokens: number;
  private enableAsyncEvolution: boolean;
  private evolutionDebounceMs: number;
  private maxEvolutionBatchSize: number;

  // In-memory debounced queue state
  private traceQueue: EpisodicTrace[] = [];
  private evolutionTimer: NodeJS.Timeout | null = null;
  private isEvolving = false;

  // Booster telemetry tracking
  private totalThinkingBudgetAllocated = 0;
  private fastPathTurnsCount = 0;

  constructor(config: RouterConfig) {
    super();
    this.memory = config.memory;
    this.sandbox = config.sandbox;
    this.llm = config.llm;
    this.synthesizer = config.synthesizer ?? new SkillSynthesizer(this.sandbox);
    this.evolutionEngine = new EvolutionEngine(this.memory, this.sandbox, this.llm);
    const resolvedGeminiDriver =
      this.llm instanceof GeminiDriver
        ? this.llm
        : this.llm instanceof CascadingLLMDriver
          ? this.llm.findDriver((d): d is GeminiDriver => d instanceof GeminiDriver)
          : undefined;

    this.cacheManager =
      config.cacheManager ??
      new ContextCacheManager({
        driver: resolvedGeminiDriver,
      });
    this.finopsTracker = config.finopsTracker ?? new FinOpsBudgetTracker();
    this.maxFastPathTokens = config.maxFastPathTokens ?? 1500;
    this.enableAsyncEvolution = config.enableAsyncEvolution ?? true;
    this.evolutionDebounceMs = config.evolutionDebounceMs ?? 5000;
    this.maxEvolutionBatchSize = config.maxEvolutionBatchSize ?? 5;

    // Register async Slow Path evolution event listener
    this.on('trace:emitted', (trace: EpisodicTrace) => {
      if (this.enableAsyncEvolution) {
        this.processSlowPathEvolution(trace).catch((err) => {
          this.emit('slowpath:error', err);
        });
      }
    });
  }

  public getMemory(): IMemoryPort {
    return this.memory;
  }

  public getSandbox(): ISkillSandbox {
    return this.sandbox;
  }

  public getLLM(): ILLMPort {
    return this.llm;
  }

  public getEvolutionEngine(): EvolutionEngine {
    return this.evolutionEngine;
  }

  public getCacheManager(): ContextCacheManager {
    return this.cacheManager;
  }

  public getFinOpsTracker(): FinOpsBudgetTracker {
    return this.finopsTracker;
  }

  public getBoosterStats() {
    const cacheStats = this.cacheManager.getStats();
    const finops = this.finopsTracker.getReport();
    return {
      ...cacheStats,
      fastPathTurnsCount: this.fastPathTurnsCount,
      avgThinkingBudget:
        this.fastPathTurnsCount > 0
          ? Math.round(this.totalThinkingBudgetAllocated / this.fastPathTurnsCount)
          : 0,
      finops,
    };
  }

  public getTraceQueueLength(): number {
    return this.traceQueue.length;
  }

  public getIsEvolving(): boolean {
    return this.isEvolving;
  }

  /**
   * Fast Path: Frugal, low-latency execution loop (<1,500 tokens/turn)
   * with Canonical KV-Cache Prefix Pinning & Dynamic System-2 Thinking Budget.
   */
  public async executeFastPath(options: FastPathOptions): Promise<FastPathResult> {
    const startTime = Date.now();
    const sessionId = options.sessionId;
    const input = options.input;
    const topK = options.topKSkills ?? 3;
    const tokenBudget = options.maxTokensBudget ?? this.maxFastPathTokens;

    // 1. Generate lightweight query embedding for hybrid retrieval
    let queryEmbedding: number[] | undefined;
    try {
      queryEmbedding = await this.llm.createEmbedding(input);
    } catch {
      // Graceful fallback to FTS5 keyword match
    }

    // 2. Hybrid Search for top-K procedural skills in Memory
    const searchResults = await this.memory.searchSkillsHybrid(input, queryEmbedding, topK);
    let retrievedSkills = searchResults.map((r) => r.item);
    if (options.skillsFilter && options.skillsFilter.length > 0) {
      const allowed = new Set(options.skillsFilter);
      retrievedSkills = retrievedSkills.filter((s) => allowed.has(s.name));
    }

    // 2b. Retrieve relevant Semantic Facts (Knowledge & Preferences)
    const topKFacts = options.topKFacts ?? 3;
    const retrievedFacts = await this.memory.searchFacts(input, { topK: topKFacts });

    // 3. Convert retrieved skills to raw Tool Definitions
    const rawTools: ToolDefinition[] = retrievedSkills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'Action name or sub-operation' },
          amount: { type: 'number', description: 'Numeric amount or value' },
          args: { type: 'object', description: 'General dictionary of arguments passed to skill' },
          data: { description: 'Data input or payload' },
          query: { type: 'string', description: 'Search or filter query' },
        },
      },
    }));

    // 4. Deterministic KV-Cache Prefix Pinning (Canonical Sorting of Tools & Facts)
    const baseSystemInstruction =
      'You are OpenTalon, a precision autonomous agent. Use available tools when appropriate.';

    const { systemPrompt, canonicalTools, prefixHash } = TokenBudgeter.buildCanonicalSystemPrompt(
      baseSystemInstruction,
      retrievedFacts,
      rawTools
    );

    // 4b. Track Prefix Reuse & Resolve Explicit Gemini Context Cache if >= Threshold
    const cacheResolution = await this.cacheManager.trackPrefixAndResolveCache(systemPrompt, {
      prefixHash,
      systemInstruction: baseSystemInstruction,
    });

    // 4c. Dynamic System-2 Thinking Budget Calculation (with FinOps Frugal Throttle Guard)
    let thinkingEval = ThinkingBudgetCalculator.evaluate({
      input,
      toolCount: canonicalTools.length,
      attachmentCount: options.attachments?.length ?? 0,
      overrideConfig: options.thinkingConfig,
    });

    if (
      this.finopsTracker.isFrugalThrottleActive() &&
      options.thinkingConfig?.thinkingBudget === undefined &&
      thinkingEval.thinkingBudget > 2048
    ) {
      thinkingEval = {
        ...thinkingEval,
        tier: 'fast',
        mode: 'fast',
        thinkingBudget: 2048,
        reasons: [...thinkingEval.reasons, 'finops_frugal_throttle_cap'],
      };
    }

    this.fastPathTurnsCount += 1;
    this.totalThinkingBudgetAllocated += thinkingEval.thinkingBudget;

    const incomingMessages: ChatMessage[] = options.history ? [...options.history] : [];
    incomingMessages.push({
      role: 'user',
      content: input,
      attachments: options.attachments,
    });

    const budgetedMessages = TokenBudgeter.fitWithinBudget(
      incomingMessages,
      systemPrompt,
      canonicalTools,
      tokenBudget
    );

    // 5. LLM Call with Dynamic Thinking Budget & KV-Cache Pinning
    const llmResponse = await this.llm.generateContent({
      systemInstruction: systemPrompt,
      messages: budgetedMessages,
      tools: canonicalTools.length > 0 ? canonicalTools : undefined,
      enableSearchGrounding: options.enableSearchGrounding,
      cachedContentId: cacheResolution.cachedContentId,
      thinkingConfig:
        thinkingEval.thinkingBudget > 0
          ? { thinkingBudget: thinkingEval.thinkingBudget, mode: thinkingEval.mode }
          : undefined,
    });

    const toolCallsMade: FastPathResult['toolCallsMade'] = [];
    let finalOutput = llmResponse.content;
    let finalThinkingBudgetUsed = thinkingEval.thinkingBudget;
    let finalThinkingTier = thinkingEval.tier;

    // 6. Execute tool calls inside Zero-Trust Sandbox (Concurrent Agentic MoE Dispatch)
    if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
      const executeSkillWithMesh = async (
        skill: ProceduralSkill,
        args: Record<string, unknown>,
        currentDepth = 0
      ): Promise<SandboxExecutionResult> => {
        return await this.sandbox.execute({
          code: skill.code,
          args,
          capabilities: skill.capabilities,
          timeoutMs: 5000,
          chainDepth: currentDepth,
          callSkill: async (targetSkillName, targetArgs, depth) => {
            const childSkill = await this.memory.getSkill(targetSkillName);
            if (!childSkill) {
              throw new Error(`Chained skill "${targetSkillName}" not found in procedural memory.`);
            }
            const childResult = await executeSkillWithMesh(childSkill, targetArgs, depth);
            if (!childResult.success) {
              throw new Error(`Chained skill "${targetSkillName}" failed: ${childResult.error}`);
            }
            return childResult.data;
          },
        });
      };

      const toolPromises = llmResponse.toolCalls.map(async (tc) => {
        const matchingSkill = retrievedSkills.find((s) => s.name === tc.name);
        if (!matchingSkill) return null;

        const callStart = Date.now();
        const rawArgs = (tc.args as Record<string, unknown>) || {};
        const skillArgs: Record<string, unknown> =
          rawArgs && typeof rawArgs === 'object' && 'args' in rawArgs && typeof rawArgs.args === 'object'
            ? { ...rawArgs, ...(rawArgs.args as Record<string, unknown>) }
            : { ...rawArgs };

        const sandboxedResult = await executeSkillWithMesh(matchingSkill, skillArgs, 0);
        const durationMs = Date.now() - callStart;

        return {
          tc,
          skillArgs,
          sandboxedResult,
          durationMs,
        };
      });

      const settled = await Promise.allSettled(toolPromises);
      const successfulResults: Array<{ name: string; data: unknown }> = [];
      const failedResults: Array<{ name: string; error: string }> = [];

      for (const res of settled) {
        if (res.status === 'fulfilled' && res.value) {
          const { tc, skillArgs, sandboxedResult, durationMs } = res.value;
          toolCallsMade.push({
            toolName: tc.name,
            args: skillArgs,
            result: sandboxedResult.data ?? sandboxedResult.error,
            durationMs,
          });

          if (sandboxedResult.success) {
            successfulResults.push({ name: tc.name, data: sandboxedResult.data });
          } else {
            failedResults.push({ name: tc.name, error: sandboxedResult.error || 'Execution failed' });
          }
        }
      }

      // Adaptive Tool Self-Correction with System-2 Thinking Escalation
      if (failedResults.length > 0 && successfulResults.length === 0) {
        const retryThinkingEval = ThinkingBudgetCalculator.evaluate({
          input,
          toolCount: canonicalTools.length,
          isRetry: true,
        });
        finalThinkingBudgetUsed = retryThinkingEval.thinkingBudget;
        finalThinkingTier = retryThinkingEval.tier;

        try {
          const repair = await this.llm.generateContent({
            systemInstruction: systemPrompt,
            messages: [
              ...budgetedMessages,
              { role: 'assistant', content: `Attempted tools: ${failedResults.map((f) => f.name).join(', ')}` },
              {
                role: 'user',
                content: `[Sandbox Error] Execution failed: ${failedResults.map((f) => `${f.name}: ${f.error}`).join('; ')}. Provide helpful resolution.`,
              },
            ],
            maxTokens: 300,
            cachedContentId: cacheResolution.cachedContentId,
            thinkingConfig: {
              thinkingBudget: retryThinkingEval.thinkingBudget,
              mode: retryThinkingEval.mode,
            },
          });
          finalOutput = repair.content || `Execution failed: ${failedResults.map((f) => `${f.name}: ${f.error}`).join('; ')}`;
        } catch {
          finalOutput = `Execution failed: ${failedResults.map((f) => `${f.name}: ${f.error}`).join('; ')}`;
        }
      } else if (successfulResults.length > 0) {
        try {
          const resultsSummary = successfulResults
            .map((s) => `[Tool Result for ${s.name}]: ${JSON.stringify(s.data)}`)
            .join('\n');

          const followUp = await this.llm.generateContent({
            systemInstruction: systemPrompt,
            messages: [
              ...budgetedMessages,
              { role: 'assistant', content: `Invoked tools: ${successfulResults.map((s) => s.name).join(', ')}` },
              {
                role: 'user',
                content: `${resultsSummary}\nSynthesize a natural, helpful, and concise answer for the user based on these results.`,
              },
            ],
            maxTokens: 500,
            cachedContentId: cacheResolution.cachedContentId,
          });
          if (followUp.content) {
            finalOutput = followUp.content;
          } else if (!finalOutput) {
            finalOutput = resultsSummary;
          }
        } catch {
          if (!finalOutput) {
            finalOutput = successfulResults
              .map((s) => `Executed ${s.name}: ${JSON.stringify(s.data)}`)
              .join('\n');
          }
        }
      }
    }

    // 6b. Autonomous Grounded Research Memory Persistence
    let groundedFactsSaved = 0;
    if (
      options.enableSearchGrounding &&
      options.autoSaveGroundedFacts !== false &&
      llmResponse.groundingMetadata?.sources &&
      llmResponse.groundingMetadata.sources.length > 0
    ) {
      const now = Date.now();
      for (const src of llmResponse.groundingMetadata.sources.slice(0, 5)) {
        if (!src.url) continue;
        const factKey = `source:${crypto.createHash('sha256').update(src.url).digest('hex').slice(0, 12)}`;
        const factValue = `${src.title || 'Verified Web Source'} (${src.url})${src.snippet ? ` — ${src.snippet}` : ''}`;
        try {
          await this.memory.saveFact({
            id: `fact_gnd_${now}_${Math.random().toString(36).slice(2, 7)}`,
            sessionId,
            category: 'grounded_research',
            key: factKey,
            value: factValue,
            confidence: 0.95,
            createdAt: now,
            updatedAt: now,
          });
          groundedFactsSaved += 1;
        } catch {
          // Non-blocking if fact persistence fails
        }
      }
    }

    const latencyMs = Date.now() - startTime;

    // 6c. Record Turn in Sovereign FinOps Ledger
    const ledgerEntry = this.finopsTracker.recordTurn({
      model: llmResponse.model || 'gemini-3.8-flash',
      promptTokens: llmResponse.tokensUsed.promptTokens,
      completionTokens: llmResponse.tokensUsed.completionTokens,
      thinkingBudgetUsed: finalThinkingBudgetUsed,
      tokensSaved: cacheResolution.tokensSaved,
    });

    // 7. Assemble Episodic Trace
    const trace: EpisodicTrace = {
      id: `trace_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      sessionId,
      input,
      output: finalOutput,
      retrievedSkillIds: retrievedSkills.map((s) => s.id),
      toolCalls: toolCallsMade.map((t) => ({
        toolName: t.toolName,
        args: t.args,
        result: t.result,
        success: !String(t.result).includes('failed'),
        durationMs: t.durationMs,
      })),
      tokensUsed: llmResponse.tokensUsed,
      latencyMs,
      success: true,
      timestamp: Date.now(),
    };

    // Save trace synchronously to memory
    await this.memory.saveTrace(trace);

    // Emit event asynchronously to trigger Slow Path evolution loop (non-blocking)
    setImmediate(() => {
      this.emit('trace:emitted', trace);
    });

    return {
      output: finalOutput,
      retrievedSkills,
      retrievedFacts,
      toolCallsMade,
      tokensUsed: llmResponse.tokensUsed,
      latencyMs,
      groundingMetadata: llmResponse.groundingMetadata,
      groundedFactsSaved: groundedFactsSaved > 0 ? groundedFactsSaved : undefined,
      cachedContentUsed: llmResponse.cachedContentUsed ?? cacheResolution.cachedContentId,
      thinkingBudgetUsed: finalThinkingBudgetUsed,
      thinkingTier: finalThinkingTier,
      prefixHash: cacheResolution.prefixHash,
      prefixHit: cacheResolution.prefixHit,
      tokensSaved: cacheResolution.tokensSaved,
      estimatedCostUsd: ledgerEntry.estimatedCostUsd,
      estimatedSavingsUsd: ledgerEntry.estimatedSavingsUsd,
    };
  }

  /**
   * Slow Path: Queues trace into in-memory buffer and schedules debounced evolution flush.
   */
  public async processSlowPathEvolution(trace: EpisodicTrace): Promise<void> {
    this.emit('slowpath:queued', trace.id);
    this.traceQueue.push(trace);

    // If batch size threshold reached, flush immediately
    if (this.traceQueue.length >= this.maxEvolutionBatchSize) {
      if (this.evolutionTimer) {
        clearTimeout(this.evolutionTimer);
        this.evolutionTimer = null;
      }
      await this.flushEvolutionQueue();
      return;
    }

    // Debounce timer for accumulating traces
    if (this.evolutionTimer) {
      clearTimeout(this.evolutionTimer);
    }
    this.evolutionTimer = setTimeout(() => {
      this.flushEvolutionQueue().catch((err) => {
        this.emit('slowpath:error', err);
      });
    }, this.evolutionDebounceMs);
  }

  /**
   * Flushes the queued traces and triggers a Hermes-style evolution cycle.
   */
  public async flushEvolutionQueue(): Promise<EvolutionReport | null> {
    if (this.isEvolving || this.traceQueue.length === 0) {
      return null;
    }

    if (this.evolutionTimer) {
      clearTimeout(this.evolutionTimer);
      this.evolutionTimer = null;
    }

    this.isEvolving = true;
    const batchSize = this.traceQueue.length;
    this.traceQueue = [];

    this.emit('slowpath:started', { batchSize });

    try {
      const report = await this.evolutionEngine.runEvolutionCycle(50);
      this.emit('slowpath:completed', report);
      return report;
    } catch (err) {
      this.emit('slowpath:error', err);
      throw err;
    } finally {
      this.isEvolving = false;
      // If new traces arrived while evolving, schedule next flush
      if (this.traceQueue.length > 0 && !this.evolutionTimer) {
        this.evolutionTimer = setTimeout(() => {
          this.flushEvolutionQueue().catch((err) => this.emit('slowpath:error', err));
        }, this.evolutionDebounceMs);
      }
    }
  }

  /**
   * Disposes timers and active queue listeners on shutdown.
   */
  public dispose(): void {
    if (this.evolutionTimer) {
      clearTimeout(this.evolutionTimer);
      this.evolutionTimer = null;
    }
    this.traceQueue = [];
  }

  /**
   * Manually triggers autonomous synthesis and commits a new skill into Memory.
   */
  public async synthesizeAndRegisterSkill(markdownContent: string): Promise<ProceduralSkill> {
    const parsed = SkillMarkdownParser.parse(markdownContent);
    const synthResult = await this.synthesizer.synthesize({
      name: parsed.metadata.name,
      description: parsed.metadata.description,
      code: parsed.executableCode,
      capabilities: parsed.metadata.capabilities,
    });

    if (!synthResult.success || !synthResult.skillDocument) {
      throw new Error(`Skill synthesis failed: ${synthResult.error}`);
    }

    let embedding: number[] | undefined;
    try {
      embedding = await this.llm.createEmbedding(
        `${parsed.metadata.name} ${parsed.metadata.description}`
      );
    } catch {
      // Fallback
    }

    const skill: ProceduralSkill = {
      id: synthResult.skillDocument.metadata.id,
      name: synthResult.skillDocument.metadata.name,
      description: synthResult.skillDocument.metadata.description,
      capabilities: synthResult.skillDocument.metadata.capabilities,
      version: synthResult.skillDocument.metadata.version,
      code: synthResult.skillDocument.executableCode,
      testCases: synthResult.skillDocument.testCases,
      hash: crypto.createHash('sha256').update(synthResult.skillDocument.executableCode).digest('hex'),
      embedding,
      createdAt: synthResult.skillDocument.metadata.createdAt,
      updatedAt: Date.now(),
    };

    await this.memory.saveSkill(skill);
    this.emit('skill:registered', skill);
    return skill;
  }
}
