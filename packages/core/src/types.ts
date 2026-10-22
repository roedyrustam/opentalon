import { type ProceduralSkill, type SemanticFact, type IMemoryPort } from '@opentalon/memory';
export type { EpisodicTrace, ProceduralSkill, SemanticFact } from '@opentalon/memory';
import { type ISkillSandbox, type SkillSynthesizer } from '@opentalon/skill-engine';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
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

export interface LLMRequest {
  messages: ChatMessage[];
  systemInstruction?: string;
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  thinkingConfig?: ThinkingConfig;
  cachedContentId?: string;
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
}

export interface ILLMPort {
  generateContent(request: LLMRequest): Promise<LLMResponse>;
  createEmbedding(text: string): Promise<number[]>;
}

export interface FastPathOptions {
  sessionId: string;
  input: string;
  history?: ChatMessage[];
  topKSkills?: number;
  topKFacts?: number;
  maxTokensBudget?: number;
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
}

export interface RouterConfig {
  memory: IMemoryPort;
  sandbox: ISkillSandbox;
  llm: ILLMPort;
  synthesizer?: SkillSynthesizer;
  maxFastPathTokens?: number; // Default 1500
  enableAsyncEvolution?: boolean; // Default true
  evolutionDebounceMs?: number; // In-memory debounce buffer window (Default 5000ms)
  maxEvolutionBatchSize?: number; // Trigger threshold if buffer fills (Default 5 traces)
}
