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
  }>;
  errors: string[];
}

export class EvolutionEngine {
  private memory: IMemoryPort;
  private sandbox: ISkillSandbox;
  private llm: ILLMPort;
  private synthesizer: SkillSynthesizer;

  constructor(memory: IMemoryPort, sandbox: ISkillSandbox, llm: ILLMPort) {
    this.memory = memory;
    this.sandbox = sandbox;
    this.llm = llm;
    this.synthesizer = new SkillSynthesizer(this.sandbox);
  }

  /**
   * Executes a full Hermes-style slow-path evolution cycle:
   * 1. Inspects recent traces & errors.
   * 2. Extracts evolution opportunities.
   * 3. Uses LLM Reflection (System-2 Thinking) to synthesize or patch skills.
   * 4. Sandbox-tests candidates and commits to procedural memory.
   */
  public async runEvolutionCycle(traceLimit = 100): Promise<EvolutionReport> {
    const traces = await this.memory.getRecentTraces(traceLimit);
    const opportunities = HeuristicsExtractor.extractOpportunities(traces);

    const report: EvolutionReport = {
      timestamp: Date.now(),
      opportunitiesFound: opportunities.length,
      skillsSynthesized: [],
      errors: [],
    };

    for (const opp of opportunities) {
      try {
        const synthesizedSkill = await this.evolveOpportunity(opp);
        if (synthesizedSkill) {
          report.skillsSynthesized.push({
            name: synthesizedSkill.name,
            version: synthesizedSkill.version,
            type: opp.type,
            hash: synthesizedSkill.hash,
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        report.errors.push(`Failed to evolve opportunity [${opp.id}]: ${msg}`);
      }
    }

    return report;
  }

  /**
   * Evolves a single opportunity by asking the LLM to reflect and draft a verified SKILL.md.
   */
  public async evolveOpportunity(opp: EvolutionOpportunity): Promise<ProceduralSkill | null> {
    const reflectionPrompt = `
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

    const llmResponse = await this.llm.generateContent({
      systemInstruction: 'You are an autonomous code synthesizer. Output valid SKILL.md only.',
      messages: [{ role: 'user', content: reflectionPrompt }],
      thinkingConfig: {
        thinkingBudget: 16384, // System-2 Extended Reasoning
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

    // Commit to procedural memory
    await this.memory.saveSkill(skill);
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
