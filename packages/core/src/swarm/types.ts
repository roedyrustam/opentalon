export interface SubagentDefinition {
  id: string;
  role: string;
  systemInstruction: string;
  skillsFilter?: string[];
  thinkingBudget?: number;
  tokenBudget?: number;
  workerLLM?: import('../types.js').ILLMPort;
}

export type SwarmTopology = 'fan_out_fan_in' | 'pipeline_saga' | 'critic_validator_loop';

export interface SwarmTaskRequest {
  topology: SwarmTopology;
  task: string;
  contextSlice?: Record<string, unknown>;
  agents: SubagentDefinition[];
  criticConfig?: {
    maxRetries?: number; // default 3
    approvalCriteria?: string;
  };
}

export interface SubagentExecutionResult {
  agentId: string;
  role: string;
  output: string;
  tokensUsed: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  durationMs: number;
  success: boolean;
  error?: string;
}

export interface SwarmTaskResult {
  topology: SwarmTopology;
  finalOutput: string;
  subagentResults: SubagentExecutionResult[];
  criticIterations?: number;
  totalLatencyMs: number;
  totalTokens: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
