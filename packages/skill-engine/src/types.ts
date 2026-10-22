import { z } from 'zod';

export const CapabilityGrantSchema = z.object({
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
  skills: z
    .object({
      allowedSkills: z.array(z.string()).default([]),
      maxChainDepth: z.number().default(3),
    })
    .optional(),
});

export const SkillCapabilitiesSchema = CapabilityGrantSchema;

export type CapabilityGrant = z.infer<typeof CapabilityGrantSchema>;
export type SkillCapabilities = CapabilityGrant;

export interface SkillMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  capabilities: CapabilityGrant;
  createdAt: number;
  updatedAt: number;
}

export interface ParsedSkillDocument {
  metadata: SkillMetadata;
  documentation: string;
  executableCode: string;
  testCases?: string;
}

export interface SandboxExecutionOptions {
  code: string;
  entrypoint?: string;
  args?: Record<string, unknown>;
  capabilities: CapabilityGrant;
  timeoutMs?: number;
  memoryLimitBytes?: number;
  chainDepth?: number;
  callSkill?: (skillName: string, args: Record<string, unknown>, currentDepth: number) => Promise<unknown>;
}

export interface SandboxExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  logs: string[];
  durationMs: number;
}

export interface ISkillSandbox {
  execute(options: SandboxExecutionOptions): Promise<SandboxExecutionResult>;
}

export interface SkillVersionCommit {
  version: string;
  hash: string;
  timestamp: number;
  changelog: string;
  code: string;
}

export interface SkillRollbackResult {
  success: boolean;
  previousVersion?: string;
  currentVersion: string;
  reason: string;
}
