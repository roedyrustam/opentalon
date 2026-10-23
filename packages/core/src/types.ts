import { type ProceduralSkill, type SemanticFact, type IMemoryPort } from '@opentalon/memory';
export type { EpisodicTrace, ProceduralSkill, SemanticFact } from '@opentalon/memory';
import { type ISkillSandbox, type SkillSynthesizer } from '@opentalon/skill-engine';
import { type ContextCacheManager } from './drivers/context-cache-manager.js';
import { type FinOpsBudgetTracker } from './token/finops-tracker.js';

export interface MultimodalAttachment {
  mimeType: string; // e.g. 'image/png', 'image/jpeg', 'application/pdf', 'audio/mp3'
  data: string;     // Base64-encoded payload (without data:...;base64, prefix)
  name?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: MultimodalAttachment[];
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  toolResults?: Array<{
    toolCallId: string;
    result: unknown;
  }>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface ThinkingConfig {
  thinkingBudget?: number; // e.g. 2048 to 65536
  mode?: 'fast' | 'balanced' | 'deep';
}

export interface GroundingSource {
  title: string;
  url: string;
  snippet?: string;
}

export interface GroundingMetadata {
  webSearchQueries?: string[];
  sources?: GroundingSource[];
  groundingSupports?: Array<{
    segment: string;
    sourceIndices: number[];
  }>;
}

export interface LLMRequest {
  messages: ChatMessage[];
  systemInstruction?: string;
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  thinkingConfig?: ThinkingConfig;
  cachedContentId?: string;
  enableSearchGrounding?: boolean;
}

export interface LLMResponse {
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  tokensUsed: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  thinkingContent?: string;
  groundingMetadata?: GroundingMetadata;
  cachedContentUsed?: string;
}

export interface StreamChunk {
  type: 'text_delta' | 'thinking_delta' | 'tool_call' | 'usage' | 'error' | 'done';
  textDelta?: string;
  thinkingDelta?: string;
  toolCall?: {
    id: string;
    name: string;
    args: Record<string, unknown>;
  };
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model?: string;
  error?: string;
  groundingMetadata?: GroundingMetadata;
  cachedContentUsed?: string;
}

export interface ILLMPort {
  generateContent(request: LLMRequest): Promise<LLMResponse>;
  createEmbedding(text: string): Promise<number[]>;
  /** Real token-by-token streaming. Optional — drivers that don't support it return undefined. */
  streamContent?(request: LLMRequest): AsyncIterable<StreamChunk>;
}

export interface FastPathOptions {
  sessionId: string;
  input: string;
  attachments?: MultimodalAttachment[];
  history?: ChatMessage[];
  topKSkills?: number;
  topKFacts?: number;
  maxTokensBudget?: number;
  enableSearchGrounding?: boolean;
  autoSaveGroundedFacts?: boolean; // Default true when enableSearchGrounding is active
  thinkingConfig?: ThinkingConfig;
}

export interface FastPathResult {
  output: string;
  retrievedSkills: ProceduralSkill[];
  retrievedFacts?: SemanticFact[];
  toolCallsMade: Array<{
    toolName: string;
    args: Record<string, unknown>;
    result: unknown;
    durationMs: number;
  }>;
  tokensUsed: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  groundingMetadata?: GroundingMetadata;
  groundedFactsSaved?: number;
  cachedContentUsed?: string;
  thinkingBudgetUsed?: number;
  thinkingTier?: 'fast' | 'balanced' | 'deep' | 'extreme';
  prefixHash?: string;
  prefixHit?: boolean;
  tokensSaved?: number;
  estimatedCostUsd?: number;
  estimatedSavingsUsd?: number;
}

export interface RouterConfig {
  memory: IMemoryPort;
  sandbox: ISkillSandbox;
  llm: ILLMPort;
  synthesizer?: SkillSynthesizer;
  cacheManager?: ContextCacheManager;
  finopsTracker?: FinOpsBudgetTracker;
  maxFastPathTokens?: number; // Default 1500
  enableAsyncEvolution?: boolean; // Default true
  evolutionDebounceMs?: number; // In-memory debounce buffer window (Default 5000ms)
  maxEvolutionBatchSize?: number; // Trigger threshold if buffer fills (Default 5 traces)
}
