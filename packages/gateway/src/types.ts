export interface GatewayRequestPayload {
  sessionId?: string;
  input: string;
  attachments?: Array<import('@opentalon/core').MultimodalAttachment>;
  history?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    attachments?: Array<import('@opentalon/core').MultimodalAttachment>;
  }>;
  enableSearchGrounding?: boolean;
  autoSaveGroundedFacts?: boolean;
  thinkingConfig?: import('@opentalon/core').ThinkingConfig;
}

export interface GatewayResponsePayload {
  sessionId: string;
  output: string;
  latencyMs: number;
  tokensUsed: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  retrievedSkills: Array<{
    id: string;
    name: string;
  }>;
  groundingMetadata?: import('@opentalon/core').GroundingMetadata;
  groundedFactsSaved?: number;
  cachedContentUsed?: string;
  thinkingBudgetUsed?: number;
  thinkingTier?: 'fast' | 'balanced' | 'deep' | 'extreme';
  prefixHash?: string;
  prefixHit?: boolean;
  tokensSaved?: number;
}

export interface ServerlessEdgeConfig {
  apiKeyHeader?: string;
  expectedApiKey?: string;
}
