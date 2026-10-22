export interface GatewayRequestPayload {
  sessionId?: string;
  input: string;
  history?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
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
}

export interface ServerlessEdgeConfig {
  apiKeyHeader?: string;
  expectedApiKey?: string;
}
