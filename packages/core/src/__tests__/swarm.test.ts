import { describe, it, expect, beforeEach } from 'vitest';
import { SwarmDirector } from '../swarm/swarm-director.js';
import { MockLLMDriver } from '../drivers/mock-driver.js';
import { type LLMRequest, type LLMResponse } from '../types.js';

describe('Multi-Agent Swarm Orchestrator - Topologies', () => {
  let mockLLM: MockLLMDriver;
  let director: SwarmDirector;

  beforeEach(() => {
    mockLLM = new MockLLMDriver();
    director = new SwarmDirector(mockLLM);
  });

  it('executes Fan-Out / Fan-In topology with parallel subagents and synthesis', async () => {
    // Override generateContent to return role-specific output based on system instruction
    mockLLM.generateContent = async (req: LLMRequest): Promise<LLMResponse> => {
      const instruction = req.systemInstruction || '';
      let content = 'Default output';

      if (instruction.toLowerCase().includes('frontend')) {
        content = 'Frontend UI: Tailwind v4 components rendered';
      } else if (instruction.toLowerCase().includes('backend')) {
        content = 'Backend API: Hono endpoints with libSQL client';
      } else if (instruction.toLowerCase().includes('synthesizer')) {
        content = 'Final System: Fullstack application synthesized';
      }

      return {
        content,
        tokensUsed: { promptTokens: 30, completionTokens: 15, totalTokens: 45 },
        model: 'mock-model',
      };
    };

    const result = await director.executeSwarm({
      topology: 'fan_out_fan_in',
      task: 'Build a payments checkout widget',
      contextSlice: { schema: 'Order { id, total, currency }' },
      agents: [
        {
          id: 'agent-fe',
          role: 'Frontend Specialist',
          systemInstruction: 'You are the Frontend Specialist.',
        },
        {
          id: 'agent-be',
          role: 'Backend Specialist',
          systemInstruction: 'You are the Backend Specialist.',
        },
      ],
    });

    expect(result.topology).toBe('fan_out_fan_in');
    expect(result.subagentResults).toHaveLength(2);
    expect(result.subagentResults[0].output).toContain('Frontend UI');
    expect(result.subagentResults[1].output).toContain('Backend API');
    expect(result.finalOutput).toBe('Final System: Fullstack application synthesized');
  });

  it('executes Pipeline Saga with sequential dependent execution', async () => {
    let callIndex = 0;
    mockLLM.generateContent = async (req: LLMRequest): Promise<LLMResponse> => {
      callIndex++;
      const userContent = req.messages[0].content;
      return {
        content: `Stage ${callIndex} completed based on: ${userContent.slice(0, 30)}`,
        tokensUsed: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
        model: 'mock-model',
      };
    };

    const result = await director.executeSwarm({
      topology: 'pipeline_saga',
      task: 'Database Migration Pipeline',
      agents: [
        { id: 'stage-1', role: 'Discovery', systemInstruction: 'Discovery agent' },
        { id: 'stage-2', role: 'DDL Generator', systemInstruction: 'DDL generator' },
        { id: 'stage-3', role: 'Validator', systemInstruction: 'Migration validator' },
      ],
    });

    expect(result.topology).toBe('pipeline_saga');
    expect(result.subagentResults).toHaveLength(3);
    expect(result.finalOutput).toContain('Stage 3 completed');
  });

  it('executes Critic-Validator Loop with iterative self-healing', async () => {
    let turnCount = 0;
    mockLLM.generateContent = async (): Promise<LLMResponse> => {
      turnCount++;

      // Turn 1: Implementer draft with bug
      if (turnCount === 1) {
        return {
          content: 'export function add(a, b) { return a - b; } // Buggy implementation',
          tokensUsed: { promptTokens: 30, completionTokens: 15, totalTokens: 45 },
          model: 'implementer',
        };
      }

      // Turn 2: Critic rejects draft
      if (turnCount === 2) {
        return {
          content: 'FAIL: Addition operator is minus instead of plus.',
          tokensUsed: { promptTokens: 40, completionTokens: 10, totalTokens: 50 },
          model: 'critic',
        };
      }

      // Turn 3: Implementer heals code
      if (turnCount === 3) {
        return {
          content: 'export function add(a, b) { return a + b; } // Patched',
          tokensUsed: { promptTokens: 30, completionTokens: 15, totalTokens: 45 },
          model: 'implementer',
        };
      }

      // Turn 4: Critic approves
      return {
        content: 'APPROVED: Code verified and type-safe.',
        tokensUsed: { promptTokens: 40, completionTokens: 10, totalTokens: 50 },
        model: 'critic',
      };
    };

    const result = await director.executeSwarm({
      topology: 'critic_validator_loop',
      task: 'Implement type-safe addition utility',
      agents: [
        { id: 'worker-1', role: 'Implementer', systemInstruction: 'Implementer Agent' },
        { id: 'auditor-1', role: 'Security & Quality Critic', systemInstruction: 'Critic Agent' },
      ],
      criticConfig: { maxRetries: 3 },
    });

    expect(result.topology).toBe('critic_validator_loop');
    expect(result.criticIterations).toBe(2);
    expect(result.finalOutput).toContain('return a + b;');
  });
});
