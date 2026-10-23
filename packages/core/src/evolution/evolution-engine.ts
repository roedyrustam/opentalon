import crypto from 'node:crypto';
import { type IMemoryPort, type ProceduralSkill } from '@opentalon/memory';
import { type ISkillSandbox, SkillSynthesizer, SkillMarkdownParser } from '@opentalon/skill-engine';
import { type ILLMPort } from '../types.js';
import { HeuristicsExtractor, type EvolutionOpportunity } from './heuristics-extractor.js';

export interface EvolutionReport {
  timestamp: number;
  opportunitiesFound: number;
  skillsSynthesized: Array<{
    name: string;
    version: string;
    type: string;
    hash: string;
    draftsEvaluated?: number;
    winningLatencyMs?: number;
  }>;
  skipped: Array<{
    opportunityId: string;
    reason: string;
  }>;
  errors: string[];
}

export interface EvolutionEngineOptions {
  maxRetriesPerOpportunity?: number; // Circuit breaker threshold (default: 2)
  maxSynthesesPerHour?: number;      // FinOps rate limit (default: 5)
  enableSelfHealingRetry?: boolean;  // Self-heal retry with sandbox error feedback (default: true)
  speculativeDraftCount?: number;    // Number of parallel speculative drafts (default: 1)
}

export interface EvolutionCycleOptions {
  traceLimit?: number;
  dryRun?: boolean;
  speculativeDraftCount?: number;
}

export interface SpeculativeDraftResult {
  skill: ProceduralSkill;
  temperature: number;
  benchmarkMs: number;
}

export class EvolutionEngine {
  private memory: IMemoryPort;
  private sandbox: ISkillSandbox;
  private llm: ILLMPort;
  private synthesizer: SkillSynthesizer;
  private maxRetriesPerOpportunity: number;
  private maxSynthesesPerHour: number;
  private enableSelfHealingRetry: boolean;
  private defaultSpeculativeDraftCount: number;

  // Circuit breaker state
  private failedAttempts: Map<string, number> = new Map();

  // FinOps history timestamps (ms)
  private synthesisTimestamps: number[] = [];

  constructor(
    memory: IMemoryPort,
    sandbox: ISkillSandbox,
    llm: ILLMPort,
    options?: EvolutionEngineOptions
  ) {
    this.memory = memory;
    this.sandbox = sandbox;
    this.llm = llm;
    this.synthesizer = new SkillSynthesizer(this.sandbox);
    this.maxRetriesPerOpportunity = options?.maxRetriesPerOpportunity ?? 2;
    this.maxSynthesesPerHour = options?.maxSynthesesPerHour ?? 5;
    this.enableSelfHealingRetry = options?.enableSelfHealingRetry ?? true;
    this.defaultSpeculativeDraftCount = options?.speculativeDraftCount ?? 1;
  }

  /**
   * Returns current count of syntheses executed within the sliding 1-hour window.
   */
  public getSynthesesInPastHour(): number {
    const oneHourAgo = Date.now() - 3600000;
    this.synthesisTimestamps = this.synthesisTimestamps.filter((ts) => ts > oneHourAgo);
    return this.synthesisTimestamps.length;
  }

  /**
   * Resets circuit breaker counters (useful for tests and manual operator resets).
   */
  public resetCircuitBreaker(): void {
    this.failedAttempts.clear();
  }

  /**
   * Executes a full Hermes-style slow-path evolution cycle:
   * 1. Inspects recent traces & errors.
   * 2. Extracts evolution opportunities via HeuristicsExtractor.
   * 3. Applies FinOps throttling & Circuit Breaker checks.
   * 4. Uses LLM Reflection (System-2 Thinking) or Speculative Multi-Drafting to synthesize skills.
   * 5. Sandbox-tests candidates with optional self-healing retry.
   * 6. Commits verified skills to procedural memory.
   */
  public async runEvolutionCycle(
    optionsOrLimit?: number | EvolutionCycleOptions
  ): Promise<EvolutionReport> {
    const traceLimit =
      typeof optionsOrLimit === 'number'
        ? optionsOrLimit
        : optionsOrLimit?.traceLimit ?? 100;
    const dryRun =
      typeof optionsOrLimit === 'object' ? Boolean(optionsOrLimit.dryRun) : false;
    const draftCount =
      typeof optionsOrLimit === 'object' && optionsOrLimit.speculativeDraftCount !== undefined
        ? optionsOrLimit.speculativeDraftCount
        : this.defaultSpeculativeDraftCount;

    const traces = await this.memory.getRecentTraces(traceLimit);
    const opportunities = HeuristicsExtractor.extractOpportunities(traces);

    const report: EvolutionReport = {
      timestamp: Date.now(),
      opportunitiesFound: opportunities.length,
      skillsSynthesized: [],
      skipped: [],
      errors: [],
    };

    for (const opp of opportunities) {
      // 1. Check Circuit Breaker
      const attempts = this.failedAttempts.get(opp.id) || 0;
      if (attempts >= this.maxRetriesPerOpportunity) {
        report.skipped.push({
          opportunityId: opp.id,
          reason: `Circuit breaker tripped: exceeded ${this.maxRetriesPerOpportunity} failed attempts`,
        });
        continue;
      }

      // 2. Check FinOps Rate Throttle
      if (this.getSynthesesInPastHour() >= this.maxSynthesesPerHour) {
        report.skipped.push({
          opportunityId: opp.id,
          reason: `FinOps rate limit reached: maximum ${this.maxSynthesesPerHour} syntheses per hour`,
        });
        continue;
      }

      try {
        if (draftCount > 1) {
          const specRes = await this.evolveOpportunitySpeculative(opp, {
            draftCount,
            dryRun,
          });
          if (specRes) {
            report.skillsSynthesized.push({
              name: specRes.winner.skill.name,
              version: specRes.winner.skill.version,
              type: opp.type,
              hash: specRes.winner.skill.hash,
              draftsEvaluated: specRes.validDraftsCount,
              winningLatencyMs: specRes.winner.benchmarkMs,
            });
            this.synthesisTimestamps.push(Date.now());
            this.failedAttempts.delete(opp.id);
          }
        } else {
          const synthesizedSkill = await this.evolveOpportunity(opp, { dryRun });
          if (synthesizedSkill) {
            report.skillsSynthesized.push({
              name: synthesizedSkill.name,
              version: synthesizedSkill.version,
              type: opp.type,
              hash: synthesizedSkill.hash,
              draftsEvaluated: 1,
            });
            this.synthesisTimestamps.push(Date.now());
            this.failedAttempts.delete(opp.id);
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.failedAttempts.set(opp.id, attempts + 1);
        report.errors.push(`Failed to evolve opportunity [${opp.id}]: ${msg}`);
      }
    }

    return report;
  }

  /**
   * Speculative Multi-Draft Synthesizer:
   * Concurrently generates N candidate SKILL.md implementations across varied temperatures,
   * verifies and benchmarks each candidate in the Zero-Trust Sandbox, and commits the fastest passing winner.
   */
  public async evolveOpportunitySpeculative(
    opp: EvolutionOpportunity,
    options?: { draftCount?: number; dryRun?: boolean }
  ): Promise<{ winner: SpeculativeDraftResult; validDraftsCount: number } | null> {
    const count = Math.max(2, Math.min(5, options?.draftCount ?? 3));
    const temperatures = [0.1, 0.35, 0.6, 0.8, 0.9].slice(0, count);

    const draftPromises = temperatures.map(async (temp): Promise<SpeculativeDraftResult | null> => {
      const benchStart = Date.now();
      const skill = await this.evolveOpportunity(
        opp,
        { dryRun: true, temperature: temp },
        undefined
      );
      if (!skill) return null;
      const benchmarkMs = Math.max(1, Date.now() - benchStart);
      return {
        skill,
        temperature: temp,
        benchmarkMs,
      };
    });

    const settled = await Promise.allSettled(draftPromises);
    const validDrafts: SpeculativeDraftResult[] = [];

    for (const res of settled) {
      if (res.status === 'fulfilled' && res.value) {
        validDrafts.push(res.value);
      }
    }

    if (validDrafts.length === 0) {
      throw new Error(`All ${count} speculative drafts failed sandbox verification.`);
    }

    // Sort by fastest sandbox verification benchmark, then by concise code length
    validDrafts.sort((a, b) => {
      if (a.benchmarkMs !== b.benchmarkMs) {
        return a.benchmarkMs - b.benchmarkMs;
      }
      return a.skill.code.length - b.skill.code.length;
    });

    const winner = validDrafts[0];

    if (!options?.dryRun) {
      await this.memory.saveSkill(winner.skill);
    }

    return {
      winner,
      validDraftsCount: validDrafts.length,
    };
  }

  /**
   * Evolves a single opportunity by asking the LLM to reflect and draft a verified SKILL.md.
   * Supports an automatic self-healing retry if sandbox verification fails on first attempt.
   */
  public async evolveOpportunity(
    opp: EvolutionOpportunity,
    options?: { dryRun?: boolean; temperature?: number },
    retryState?: { isRetry: boolean; previousError: string }
  ): Promise<ProceduralSkill | null> {
    let reflectionPrompt = `
You are the Hermes-Style Autonomous Evolution Brain of OpenTalon.
Analyze the following execution pattern and synthesize an immutable, production-grade procedural skill in clean SKILL.md format.

OPPORTUNITY TYPE: ${opp.type}
REASON: ${opp.reason}
SAMPLE USER INPUTS:
${opp.sampleInputs.map((i) => ` - "${i}"`).join('\n')}

REQUIREMENTS:
1. Output MUST be a complete SKILL.md with YAML frontmatter containing:
   name: <lowercase_snake_case_name>
   version: "1.0.0"
   description: "<concise explanation>"
   capabilities: {"net": {"allowedHosts": [], "allowHttp": false}, "fs": {"readPaths": [], "writePaths": []}, "env": []}
2. The code block must be valid sandboxed JavaScript (export default async function run(args) { ... }).
3. Include clean JSON test cases in a \`\`\`json block.
4. DO NOT provide placeholder code or commentary outside the markdown.
`;

    if (retryState?.isRetry) {
      reflectionPrompt += `
CRITICAL FIX REQUIRED:
Your previous synthesis attempt failed sandbox verification with error:
"${retryState.previousError}"
Please fix the code logic, parameters, or test cases to ensure strict sandbox pass.
`;
    }

    const thinkingBudget = retryState?.isRetry ? 32768 : 16384;

    const llmResponse = await this.llm.generateContent({
      systemInstruction: 'You are an autonomous code synthesizer. Output valid SKILL.md only.',
      messages: [{ role: 'user', content: reflectionPrompt }],
      temperature: options?.temperature,
      thinkingConfig: {
        thinkingBudget, // System-2 Adaptive Extended Reasoning (escalates to 32k on retry)
        mode: 'deep',
      },
    });

    const rawMarkdown = this.cleanMarkdownOutput(llmResponse.content);
    if (!rawMarkdown || !rawMarkdown.includes('---')) {
      return null;
    }

    // Parse and validate candidate
    const parsed = SkillMarkdownParser.parse(rawMarkdown);

    // Parse test cases if provided in markdown
    let testCases: Array<{ args: Record<string, unknown>; expected: unknown }> | undefined;
    if (parsed.testCases) {
      try {
        testCases = JSON.parse(parsed.testCases);
      } catch {
        // Fallback to dry-run
      }
    }

    // Synthesize & Sandbox-verify the candidate
    const synthResult = await this.synthesizer.synthesize({
      name: parsed.metadata.name,
      description: parsed.metadata.description,
      code: parsed.executableCode,
      capabilities: parsed.metadata.capabilities,
      testCases,
    });

    if (!synthResult.success || !synthResult.skillDocument) {
      // Self-healing retry if not already retrying
      if (this.enableSelfHealingRetry && !retryState?.isRetry) {
        return this.evolveOpportunity(opp, options, {
          isRetry: true,
          previousError: synthResult.error || 'Unknown sandbox failure',
        });
      }
      throw new Error(`Sandbox verification failed: ${synthResult.error}`);
    }

    // Generate vector embedding for hybrid memory
    let embedding: number[] | undefined;
    try {
      embedding = await this.llm.createEmbedding(
        `${parsed.metadata.name} ${parsed.metadata.description}`
      );
    } catch {
      // Fallback
    }

    const doc = synthResult.skillDocument;
    const skill: ProceduralSkill = {
      id: doc.metadata.id,
      name: doc.metadata.name,
      description: doc.metadata.description,
      capabilities: doc.metadata.capabilities,
      version: doc.metadata.version,
      code: doc.executableCode,
      testCases: doc.testCases,
      hash: crypto.createHash('sha256').update(doc.executableCode).digest('hex'),
      embedding,
      createdAt: doc.metadata.createdAt,
      updatedAt: Date.now(),
    };

    // If dryRun, do not commit to memory
    if (!options?.dryRun) {
      await this.memory.saveSkill(skill);
    }

    return skill;
  }

  private cleanMarkdownOutput(text: string): string {
    let clean = text.trim();
    // Strip leading ```markdown if wrapped
    if (clean.startsWith('```markdown')) {
      clean = clean.replace(/^```markdown\r?\n/, '').replace(/\r?\n```$/, '');
    } else if (clean.startsWith('```') && !clean.startsWith('---')) {
      clean = clean.replace(/^```\w*\r?\n/, '').replace(/\r?\n```$/, '');
    }
    return clean.trim();
  }
}
