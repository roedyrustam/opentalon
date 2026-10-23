export interface SignedHeaders {
  agentId: string;
  publicKey: string;
  signature: string;
  timestamp: number;
  nonce: string;
}

export interface AgentCard {
  urn: string;
  name: string;
  version: string;
  publicKey: string;
  endpoints: {
    base: string;
    agentCard: string;
    negotiate: string;
    dispatch: string;
  };
  skills: Array<{
    name: string;
    description: string;
    version: string;
    capabilities: Record<string, unknown>;
  }>;
  activeModel?: string;
  status: 'online' | 'busy' | 'draining';
  uptimeSeconds: number;
}

export interface A2ANegotiateRequest {
  taskId: string;
  senderAgentId: string;
  requiredSkills: string[];
  taskDescription: string;
  delegationDepth: number;
  maxTokens?: number;
}

export interface A2ANegotiateResponse {
  canHandle: boolean;
  reason?: string;
  estimatedLatencyMs?: number;
  availableSkills: string[];
  assignedPeerId: string;
}

export interface A2ADispatchRequest {
  taskId: string;
  senderAgentId: string;
  task: string;
  contextSlice?: Record<string, unknown>;
  skillsFilter?: string[];
  delegationDepth: number;
  thinkingBudget?: number;
  tokenBudget?: number;
}

export interface A2ADispatchResponse {
  taskId: string;
  senderAgentId: string;
  executorPeerId: string;
  success: boolean;
  output: string;
  tokensUsed: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  durationMs: number;
  error?: string;
}

export interface VerificationResult {
  valid: boolean;
  error?: string;
  signerAgentId?: string;
}
