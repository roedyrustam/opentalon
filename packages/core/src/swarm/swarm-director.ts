import { type ILLMPort, type LLMRequest } from '../types.js';
import {
  type SwarmTaskRequest,
  type SwarmTaskResult,
  type SubagentDefinition,
  type SubagentExecutionResult,
} from './types.js';

export class SwarmDirector {
  private llm: ILLMPort;

  constructor(llm: ILLMPort) {
    this.llm = llm;
  }

  /**
   * Dispatches a multi-agent swarm task using the requested 2026 execution topology.
   */
  public async executeSwarm(request: SwarmTaskRequest): Promise<SwarmTaskResult> {
    const start = Date.now();

    switch (request.topology) {
      case 'fan_out_fan_in':
        return await this.executeFanOutFanIn(request, start);
      case 'pipeline_saga':
        return await this.executePipelineSaga(request, start);
      case 'critic_validator_loop':
        return await this.executeCriticValidatorLoop(request, start);
      default:
        throw new Error(`Unsupported swarm topology: ${request.topology}`);
    }
  }

  /**
   * Topology 1: Fan-Out / Fan-In
   * Concurrently dispatches tasks to specialized subagents with selective context pruning,
   * then reconciles their outputs via a synthesis turn.
   */
  private async executeFanOutFanIn(
    request: SwarmTaskRequest,
    startTime: number
  ): Promise<SwarmTaskResult> {
    const subagentPromises = request.agents.map((agent) =>
      this.runSubagent(agent, request.task, request.contextSlice)
    );

    const settled = await Promise.allSettled(subagentPromises);
    const subagentResults: SubagentExecutionResult[] = settled.map((res, idx) => {
      if (res.status === 'fulfilled') {
        return res.value;
      }
      return {
        agentId: request.agents[idx].id,
        role: request.agents[idx].role,
        output: '',
        tokensUsed: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        durationMs: 0,
        success: false,
        error: res.reason instanceof Error ? res.reason.message : String(res.reason),
      };
    });

    // Synthesis Step: Assemble multi-perspective results into unified output
    const synthesisPrompt = `
You are the Swarm Director Synthesizer.
User Task: "${request.task}"

Specialized Subagent Drafts:
${subagentResults.map((r) => `=== [${r.role}] ===\n${r.output}\n`).join('\n')}

Synthesize the above specialized perspectives into a cohesive, production-grade final response.
`;

    const synthRes = await this.llm.generateContent({
      systemInstruction: 'You are a master technical synthesizer. Assemble cohesive multi-agent results.',
      messages: [{ role: 'user', content: synthesisPrompt }],
      thinkingConfig: { thinkingBudget: 8192 },
    });

    const totalTokens = this.accumulateTokens([
      ...subagentResults,
      { tokensUsed: synthRes.tokensUsed } as SubagentExecutionResult,
    ]);

    return {
      topology: 'fan_out_fan_in',
      finalOutput: synthRes.content,
      subagentResults,
      totalLatencyMs: Date.now() - startTime,
      totalTokens,
    };
  }

  /**
   * Topology 2: Pipeline Saga
   * Sequential dependent execution where Stage N output feeds into Stage N+1.
   */
  private async executePipelineSaga(
    request: SwarmTaskRequest,
    startTime: number
  ): Promise<SwarmTaskResult> {
    const subagentResults: SubagentExecutionResult[] = [];
    let currentInput = request.task;

    for (let i = 0; i < request.agents.length; i++) {
      const agent = request.agents[i];
      const stagePrompt = `
Original Task: "${request.task}"
Previous Stage Output:
${currentInput}

Your Role: ${agent.role}
Please perform your specialized stage execution on the input.
`;

      const result = await this.runSubagent(agent, stagePrompt, request.contextSlice);
      subagentResults.push(result);

      if (!result.success) {
        throw new Error(`Pipeline Saga failed at stage [${agent.role}]: ${result.error}`);
      }

      currentInput = result.output;
    }

    const totalTokens = this.accumulateTokens(subagentResults);

    return {
      topology: 'pipeline_saga',
      finalOutput: currentInput,
      subagentResults,
      totalLatencyMs: Date.now() - startTime,
      totalTokens,
    };
  }

  /**
   * Topology 3: Critic-Validator Loop
   * Zero-tolerance quality gate: Implementer agent drafts code/solution,
   * Auditor/Critic agent inspects invariants. Loops until approved or maxRetries reached.
   */
  private async executeCriticValidatorLoop(
    request: SwarmTaskRequest,
    startTime: number
  ): Promise<SwarmTaskResult> {
    if (request.agents.length < 2) {
      throw new Error('Critic-Validator Loop requires at least 2 agents: [Implementer, Critic]');
    }

    const implementer = request.agents[0];
    const critic = request.agents[1];
    const maxRetries = request.criticConfig?.maxRetries ?? 3;
    const approvalCriteria =
      request.criticConfig?.approvalCriteria ||
      'Verify strict typing, zero placeholder // TODO, and security compliance.';

    const subagentResults: SubagentExecutionResult[] = [];
    let currentDraft = '';
    let criticFeedback = '';
    let iterations = 0;
    let isApproved = false;

    while (iterations < maxRetries && !isApproved) {
      iterations++;

      // 1. Implementer Draft Turn
      const draftPrompt = iterations === 1
        ? request.task
        : `Previous Draft:\n${currentDraft}\n\nCritic Feedback to Resolve:\n${criticFeedback}\n\nPlease revise the solution completely.`;

      const draftResult = await this.runSubagent(implementer, draftPrompt, request.contextSlice);
      subagentResults.push(draftResult);
      currentDraft = draftResult.output;

      // 2. Critic Audit Turn
      const auditPrompt = `
Task: "${request.task}"
Approval Criteria: ${approvalCriteria}

Candidate Draft to Audit:
${currentDraft}

If the draft fully passes all criteria, respond with the single word: "APPROVED".
Otherwise, provide specific, actionable critique for what needs to be fixed.
`;

      const criticResult = await this.runSubagent(critic, auditPrompt, request.contextSlice);
      subagentResults.push(criticResult);

      if (criticResult.output.trim().toUpperCase().startsWith('APPROVED')) {
        isApproved = true;
      } else {
        criticFeedback = criticResult.output;
      }
    }

    const totalTokens = this.accumulateTokens(subagentResults);

    return {
      topology: 'critic_validator_loop',
      finalOutput: currentDraft,
      subagentResults,
      criticIterations: iterations,
      totalLatencyMs: Date.now() - startTime,
      totalTokens,
    };
  }

  private async runSubagent(
    agent: SubagentDefinition,
    prompt: string,
    contextSlice?: Record<string, unknown>
  ): Promise<SubagentExecutionResult> {
    const start = Date.now();
    try {
      let finalPrompt = prompt;
      if (contextSlice && Object.keys(contextSlice).length > 0) {
        finalPrompt = `Context Slice:\n${JSON.stringify(contextSlice, null, 2)}\n\nUser Task:\n${prompt}`;
      }

      const req: LLMRequest = {
        systemInstruction: agent.systemInstruction,
        messages: [{ role: 'user', content: finalPrompt }],
      };

      if (agent.thinkingBudget) {
        req.thinkingConfig = { thinkingBudget: agent.thinkingBudget };
      }

      const res = await this.llm.generateContent(req);

      return {
        agentId: agent.id,
        role: agent.role,
        output: res.content,
        tokensUsed: res.tokensUsed,
        durationMs: Date.now() - start,
        success: true,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        agentId: agent.id,
        role: agent.role,
        output: '',
        tokensUsed: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        durationMs: Date.now() - start,
        success: false,
        error: msg,
      };
    }
  }

  private accumulateTokens(
    results: Array<{ tokensUsed: { promptTokens: number; completionTokens: number; totalTokens: number } }>
  ): { promptTokens: number; completionTokens: number; totalTokens: number } {
    let prompt = 0;
    let completion = 0;
    let total = 0;
    for (const r of results) {
      prompt += r.tokensUsed.promptTokens;
      completion += r.tokensUsed.completionTokens;
      total += r.tokensUsed.totalTokens;
    }
    return { promptTokens: prompt, completionTokens: completion, totalTokens: total };
  }
}
