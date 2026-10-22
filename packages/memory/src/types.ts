import { z } from 'zod';

export const SkillCapabilitiesSchema = z.object({
  net: z
    .object({
      allowedHosts: z.array(z.string()).default([]),
      allowHttp: z.boolean().default(false),
    })
    .optional(),
  fs: z
    .object({
      readPaths: z.array(z.string()).default([]),
      writePaths: z.array(z.string()).default([]),
    })
    .optional(),
  env: z.array(z.string()).optional(),
});

export type SkillCapabilities = z.infer<typeof SkillCapabilitiesSchema>;

export interface ProceduralSkill {
  id: string;
  name: string;
  description: string;
  capabilities: SkillCapabilities;
  version: string;
  code: string;
  testCases?: string;
  hash: string;
  embedding?: number[];
  createdAt: number;
  updatedAt: number;
}

export interface ToolCallTrace {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  success: boolean;
  durationMs: number;
}

export interface EpisodicTrace {
  id: string;
  sessionId: string;
  input: string;
  output: string;
  retrievedSkillIds: string[];
  toolCalls: ToolCallTrace[];
  tokensUsed: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
  timestamp: number;
}

export interface SemanticFact {
  id: string;
  sessionId?: string;
  category: string; // e.g. "user_preference", "domain_entity", "system_state"
  key: string;
  value: string;
  confidence: number;
  embedding?: number[];
  createdAt: number;
  updatedAt: number;
}

export interface HybridSearchResult<T> {
  item: T;
  score: number;
  ftsRank?: number;
  vectorRank?: number;
  rrfScore: number;
}

export interface MemoryConfig {
  url: string; // e.g. "file:opentalon.db" or ":memory:" or "libsql://..."
  authToken?: string;
  vectorDimensions?: number;
  rrfK?: number;
}

export interface IMemoryPort {
  initialize(): Promise<void>;
  close(): Promise<void>;
  
  // Episodic Memory (Traces)
  saveTrace(trace: EpisodicTrace): Promise<void>;
  getTracesBySession(sessionId: string, limit?: number): Promise<EpisodicTrace[]>;
  getRecentTraces(limit?: number): Promise<EpisodicTrace[]>;
  getFailedTraces(limit?: number): Promise<EpisodicTrace[]>;

  // Semantic Memory (Facts & Knowledge)
  saveFact(fact: SemanticFact): Promise<void>;
  getFact(key: string, category?: string): Promise<SemanticFact | null>;
  listFacts(options?: { category?: string; sessionId?: string; limit?: number }): Promise<SemanticFact[]>;
  searchFacts(query: string, options?: { category?: string; topK?: number }): Promise<SemanticFact[]>;
  deleteFact(id: string): Promise<boolean>;

  // Procedural Memory (Skills)
  saveSkill(skill: ProceduralSkill): Promise<void>;
  getSkill(idOrName: string): Promise<ProceduralSkill | null>;
  listSkills(): Promise<ProceduralSkill[]>;
  searchSkillsHybrid(
    query: string,
    queryEmbedding?: number[],
    topK?: number
  ): Promise<HybridSearchResult<ProceduralSkill>[]>;
  deleteSkill(id: string): Promise<boolean>;
  getSkillRevisions(name: string): Promise<SkillRevision[]>;
  rollbackSkill(name: string, targetVersionOrHash: string): Promise<ProceduralSkill>;

  // Snapshot Migration & Backup
  exportSnapshot(options?: { includeTraces?: boolean }): Promise<MemorySnapshot>;
  importSnapshot(snapshot: MemorySnapshot, options?: { overwrite?: boolean }): Promise<ImportSnapshotResult>;
}

export interface SkillRevision {
  id: string;
  skillId: string;
  name: string;
  version: string;
  description: string;
  capabilities: SkillCapabilities;
  code: string;
  testCases?: string;
  hash: string;
  timestamp: number;
}

export interface MemorySnapshot {
  version: string;
  exportedAt: number;
  skills: ProceduralSkill[];
  facts: SemanticFact[];
  traces?: EpisodicTrace[];
}

export interface ImportSnapshotResult {
  importedSkills: number;
  importedFacts: number;
  importedTraces: number;
}
