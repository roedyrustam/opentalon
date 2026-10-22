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
import { TokenBudgeter } from '../token/budgeter.js';

export class DualBrainRouter extends EventEmitter {
  private memory: IMemoryPort;
  private sandbox: ISkillSandbox;
  private llm: ILLMPort;
  private synthesizer: SkillSynthesizer;
  private maxFastPathTokens: number;
  private enableAsyncEvolution: boolean;

  constructor(config: RouterConfig) {
    super();
    this.memory = config.memory;
    this.sandbox = config.sandbox;
    this.llm = config.llm;
    this.synthesizer = config.synthesizer ?? new SkillSynthesizer(this.sandbox);
    this.maxFastPathTokens = config.maxFastPathTokens ?? 1500;
    this.enableAsyncEvolution = config.enableAsyncEvolution ?? true;

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

    // 3. Convert retrieved skills to Tool Definitions
    const tools: ToolDefinition[] = retrievedSkills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      parameters: {
        type: 'object',
        properties: {
          args: { type: 'object', description: 'Arguments passed to skill' },
        },
      },
    }));

    // 4. Token Budget Compression (<1,500 tokens)
    const systemPrompt =
      'You are OpenTalon, a precision autonomous agent. Use available tools when appropriate.';
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
          const sandboxedResult = await this.sandbox.execute({
            code: matchingSkill.code,
            args: tc.args,
            capabilities: matchingSkill.capabilities,
            timeoutMs: 5000,
          });

          const durationMs = Date.now() - callStart;
          toolCallsMade.push({
            toolName: tc.name,
            args: tc.args,
            result: sandboxedResult.data ?? sandboxedResult.error,
            durationMs,
          });

          // If LLM returned empty content with tool call, format result
          if (!finalOutput) {
            finalOutput = sandboxedResult.success
              ? `Executed ${tc.name}: ${JSON.stringify(sandboxedResult.data)}`
              : `Execution of ${tc.name} failed: ${sandboxedResult.error}`;
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
      toolCallsMade,
      tokensUsed: llmResponse.tokensUsed,
      latencyMs,
    };
  }

  /**
   * Slow Path: Non-blocking background evolution and skill synthesis.
   */
  public async processSlowPathEvolution(trace: EpisodicTrace): Promise<void> {
    this.emit('slowpath:started', trace.id);

    // If execution was complex or had failures, evaluate for heuristic extraction
    const hasToolCalls = trace.toolCalls.length > 0;
    const isSuccess = trace.success;

    if (hasToolCalls && isSuccess) {
      // Evaluate if the tool call represents a reusable pattern
      // For demonstration and production stability, synthesis can refine existing skills
      this.emit('slowpath:evaluated', { traceId: trace.id, status: 'stable' });
      return;
    }

    this.emit('slowpath:completed', { traceId: trace.id });
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
    return skill;
  }
}
