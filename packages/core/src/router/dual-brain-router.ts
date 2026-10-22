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
import { type ISkillSandbox, SkillSynthesizer, SkillMarkdownParser } from '@opentalon/skill-engine';
import { EvolutionEngine, type EvolutionReport } from '../evolution/evolution-engine.js';
import { TokenBudgeter } from '../token/budgeter.js';

export class DualBrainRouter extends EventEmitter {
  private memory: IMemoryPort;
  private sandbox: ISkillSandbox;
  private llm: ILLMPort;
  private synthesizer: SkillSynthesizer;
  private evolutionEngine: EvolutionEngine;
  private maxFastPathTokens: number;
  private enableAsyncEvolution: boolean;
  private evolutionDebounceMs: number;
  private maxEvolutionBatchSize: number;

  // In-memory debounced queue state
  private traceQueue: EpisodicTrace[] = [];
  private evolutionTimer: NodeJS.Timeout | null = null;
  private isEvolving = false;

  constructor(config: RouterConfig) {
    super();
    this.memory = config.memory;
    this.sandbox = config.sandbox;
    this.llm = config.llm;
    this.synthesizer = config.synthesizer ?? new SkillSynthesizer(this.sandbox);
    this.evolutionEngine = new EvolutionEngine(this.memory, this.sandbox, this.llm);
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

  public getTraceQueueLength(): number {
    return this.traceQueue.length;
  }

  public getIsEvolving(): boolean {
    return this.isEvolving;
  }

  /**
   * Fast Path: Frugal, low-latency execution loop (<1,500 tokens/turn).
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
    const retrievedSkills = searchResults.map((r) => r.item);

    // 2b. Retrieve relevant Semantic Facts (Knowledge & Preferences)
    const topKFacts = options.topKFacts ?? 3;
    const retrievedFacts = await this.memory.searchFacts(input, { topK: topKFacts });

    // 3. Convert retrieved skills to Tool Definitions
    const tools: ToolDefinition[] = retrievedSkills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'Numeric amount or value' },
          action: { type: 'string', description: 'Action name or sub-operation' },
          data: { description: 'Data input or payload' },
          query: { type: 'string', description: 'Search or filter query' },
          args: { type: 'object', description: 'General dictionary of arguments passed to skill' },
        },
      },
    }));

    // 4. Token Budget Compression (<1,500 tokens) with Prefix Pinning
    let systemPrompt =
      'You are OpenTalon, a precision autonomous agent. Use available tools when appropriate.';

    if (retrievedFacts.length > 0) {
      const factSnippets = retrievedFacts.map((f) => `• [${f.category}] ${f.key}: ${f.value}`).join('\n');
      systemPrompt += `\n\nVerified Knowledge Context:\n${factSnippets}`;
    }

    const incomingMessages: ChatMessage[] = options.history ? [...options.history] : [];
    incomingMessages.push({ role: 'user', content: input });

    const budgetedMessages = TokenBudgeter.fitWithinBudget(
      incomingMessages,
      systemPrompt,
      tools,
      tokenBudget
    );

    // 5. LLM Call
    const llmResponse = await this.llm.generateContent({
      systemInstruction: systemPrompt,
      messages: budgetedMessages,
      tools: tools.length > 0 ? tools : undefined,
    });

    const toolCallsMade: FastPathResult['toolCallsMade'] = [];
    let finalOutput = llmResponse.content;

    // 6. Execute tool calls inside Zero-Trust Sandbox if triggered
    if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
      for (const tc of llmResponse.toolCalls) {
        const matchingSkill = retrievedSkills.find((s) => s.name === tc.name);
        if (matchingSkill) {
          const callStart = Date.now();
          const rawArgs = (tc.args as Record<string, unknown>) || {};
          const skillArgs: Record<string, unknown> =
            rawArgs && typeof rawArgs === 'object' && 'args' in rawArgs && typeof rawArgs.args === 'object'
              ? { ...rawArgs, ...(rawArgs.args as Record<string, unknown>) }
              : { ...rawArgs };

          const sandboxedResult = await this.sandbox.execute({
            code: matchingSkill.code,
            args: skillArgs,
            capabilities: matchingSkill.capabilities,
            timeoutMs: 5000,
          });

          const durationMs = Date.now() - callStart;
          toolCallsMade.push({
            toolName: tc.name,
            args: skillArgs,
            result: sandboxedResult.data ?? sandboxedResult.error,
            durationMs,
          });

          // Adaptive Tool Error Self-Correction
          if (!sandboxedResult.success) {
            try {
              const repair = await this.llm.generateContent({
                systemInstruction: systemPrompt,
                messages: [
                  ...budgetedMessages,
                  { role: 'assistant', content: `Attempted tool ${tc.name}` },
                  {
                    role: 'user',
                    content: `[Sandbox Error] ${tc.name} execution failed: ${sandboxedResult.error}. Provide helpful resolution.`,
                  },
                ],
                maxTokens: 300,
              });
              finalOutput = repair.content || `Execution of ${tc.name} failed: ${sandboxedResult.error}`;
            } catch {
              finalOutput = `Execution of ${tc.name} failed: ${sandboxedResult.error}`;
            }
          } else if (sandboxedResult.success) {
            try {
              const followUp = await this.llm.generateContent({
                systemInstruction: systemPrompt,
                messages: [
                  ...budgetedMessages,
                  { role: 'assistant', content: `Invoked tool ${tc.name}` },
                  {
                    role: 'user',
                    content: `[Tool Result for ${tc.name}]: ${JSON.stringify(sandboxedResult.data)}. Synthesize a natural, helpful, and concise answer for the user based on this result.`,
                  },
                ],
                maxTokens: 500,
              });
              if (followUp.content) {
                finalOutput = followUp.content;
              } else if (!finalOutput) {
                finalOutput = `Executed ${tc.name}: ${JSON.stringify(sandboxedResult.data)}`;
              }
            } catch {
              if (!finalOutput) {
                finalOutput = `Executed ${tc.name}: ${JSON.stringify(sandboxedResult.data)}`;
              }
            }
          }
        }
      }
    }

    const latencyMs = Date.now() - startTime;

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
