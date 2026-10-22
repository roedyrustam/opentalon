import {
  type CapabilityGrant,
  type ParsedSkillDocument,
  type ISkillSandbox,
} from '../types.js';
import { SandboxedVmRunner } from '../sandbox/quickjs-sandbox.js';
import { SkillMarkdownParser } from '../parser/skill-markdown.js';
import { SkillVersionManager } from '../versioning/skill-version-manager.js';

export interface SynthesisCandidate {
  name: string;
  description: string;
  code: string;
  capabilities: CapabilityGrant;
  testCases?: Array<{
    args: Record<string, unknown>;
    expected: unknown;
  }>;
}

export interface SynthesisResult {
  success: boolean;
  skillDocument?: ParsedSkillDocument;
  markdown?: string;
  error?: string;
  version: string;
}

export class SkillSynthesizer {
  private sandbox: ISkillSandbox;
  private versionManager: SkillVersionManager;
  private callSkillResolver?: (name: string, args: Record<string, unknown>) => Promise<unknown>;

  constructor(
    sandbox?: ISkillSandbox,
    versionManager?: SkillVersionManager,
    callSkillResolver?: (name: string, args: Record<string, unknown>) => Promise<unknown>
  ) {
    this.sandbox = sandbox ?? new SandboxedVmRunner();
    this.versionManager = versionManager ?? new SkillVersionManager();
    this.callSkillResolver = callSkillResolver;
  }

  /**
   * Synthesizes and tests a skill candidate in the sandbox before committing.
   */
  public async synthesize(
    candidate: SynthesisCandidate,
    baseVersion = '1.0.0'
  ): Promise<SynthesisResult> {
    const defaultDryRunCallSkill =
      this.callSkillResolver ??
      (async (targetSkillName, targetArgs) => ({
        mocked: true,
        skill: targetSkillName,
        args: targetArgs,
        converted: { EUR: 92, IDR: 1580000 },
      }));

    // 1. Verify candidate code in Zero-Trust Sandbox
    if (candidate.testCases && candidate.testCases.length > 0) {
      for (const tc of candidate.testCases) {
        const execResult = await this.sandbox.execute({
          code: candidate.code,
          args: tc.args,
          capabilities: candidate.capabilities,
          timeoutMs: 3000,
          callSkill: defaultDryRunCallSkill,
        });

        if (!execResult.success) {
          return {
            success: false,
            error: `Sandbox test failed for args ${JSON.stringify(tc.args)}: ${execResult.error}`,
            version: baseVersion,
          };
        }

        // Compare expected value if specified
        if (tc.expected !== undefined) {
          const actualStr = JSON.stringify(execResult.data);
          const expectedStr = JSON.stringify(tc.expected);
          if (actualStr !== expectedStr) {
            return {
              success: false,
              error: `Assertion mismatch: expected ${expectedStr}, got ${actualStr}`,
              version: baseVersion,
            };
          }
        }
      }
    } else {
      // Basic syntax/instantiation dry-run
      const dryRun = await this.sandbox.execute({
        code: candidate.code,
        args: {},
        capabilities: candidate.capabilities,
        timeoutMs: 3000,
        callSkill: defaultDryRunCallSkill,
      });

      if (!dryRun.success) {
        return {
          success: false,
          error: `Dry-run execution failed: ${dryRun.error}`,
          version: baseVersion,
        };
      }
    }

    // 2. Commit Version
    this.versionManager.commit(
      candidate.name,
      baseVersion,
      candidate.code,
      `Autonomous synthesis of ${candidate.name}`
    );

    // 3. Assemble ParsedSkillDocument
    const skillDocument: ParsedSkillDocument = {
      metadata: {
        id: `skill-${candidate.name}`,
        name: candidate.name,
        version: baseVersion,
        description: candidate.description,
        capabilities: candidate.capabilities,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      documentation: candidate.description,
      executableCode: candidate.code,
      testCases: candidate.testCases ? JSON.stringify(candidate.testCases, null, 2) : undefined,
    };

    const markdown = SkillMarkdownParser.serialize(skillDocument);

    return {
      success: true,
      skillDocument,
      markdown,
      version: baseVersion,
    };
  }
}
