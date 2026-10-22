import { SkillMarkdownParser } from '../parser/skill-markdown.js';
import { SkillSynthesizer } from '../synthesizer/skill-synthesizer.js';
import { type CapabilityGrant } from '../types.js';

export interface SkillInstallOptions {
  overwrite?: boolean;
  force?: boolean;
  timeoutMs?: number;
}

export interface SecurityAuditReport {
  isSafe: boolean;
  warnings: string[];
  capabilities: CapabilityGrant;
}

export interface SkillInstallResult {
  success: boolean;
  skillName: string;
  version: string;
  description: string;
  sourceUrl: string;
  hash?: string;
  audit: SecurityAuditReport;
  error?: string;
}

export class RemoteSkillInstaller {
  /**
   * Normalizes shorthand targets into direct raw downloadable URLs.
   * Supports:
   * - Full URL: https://example.com/skill.md
   * - GitHub Blob: https://github.com/owner/repo/blob/branch/path/to/skill.md -> https://raw.githubusercontent.com/owner/repo/branch/path/to/skill.md
   * - GitHub Shorthand: github:owner/repo/path/to/skill.md -> https://raw.githubusercontent.com/owner/repo/main/path/to/skill.md
   * - GitHub Shorthand with branch: github:owner/repo@dev/path/to/skill.md -> https://raw.githubusercontent.com/owner/repo/dev/path/to/skill.md
   * - Gist: gist:gistId/skill.md -> https://gist.githubusercontent.com/raw/gistId/skill.md
   */
  public static normalizeUrl(target: string): string {
    const trimmed = target.trim();

    // 1. GitHub shorthand: github:owner/repo@branch/path or github:owner/repo/path
    if (trimmed.startsWith('github:')) {
      const rest = trimmed.slice(7); // owner/repo/path or owner/repo@branch/path
      const atIdx = rest.indexOf('@');
      if (atIdx !== -1) {
        const repoPart = rest.slice(0, atIdx);
        const afterAt = rest.slice(atIdx + 1);
        const slashIdx = afterAt.indexOf('/');
        const branch = slashIdx !== -1 ? afterAt.slice(0, slashIdx) : 'main';
        const filePath = slashIdx !== -1 ? afterAt.slice(slashIdx + 1) : '';
        return `https://raw.githubusercontent.com/${repoPart}/${branch}/${filePath}`;
      } else {
        const parts = rest.split('/');
        if (parts.length >= 3) {
          const owner = parts[0];
          const repo = parts[1];
          const filePath = parts.slice(2).join('/');
          return `https://raw.githubusercontent.com/${owner}/${repo}/main/${filePath}`;
        }
      }
    }

    // 2. Gist shorthand: gist:gistId/skill.md or gist:gistId
    if (trimmed.startsWith('gist:')) {
      const rest = trimmed.slice(5);
      return `https://gist.githubusercontent.com/raw/${rest}`;
    }

    // 3. GitHub Web URL: https://github.com/owner/repo/blob/branch/...
    const githubBlobMatch = trimmed.match(
      /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/
    );
    if (githubBlobMatch) {
      const [, owner, repo, branch, filePath] = githubBlobMatch;
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
    }

    // Standard HTTP/HTTPS URL
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }

    throw new Error(
      `Unsupported skill source format: "${target}". Provide a valid HTTP(S) URL, "github:owner/repo/path", or "gist:id".`
    );
  }

  /**
   * Performs static security auditing on skill capabilities before installation.
   */
  public static auditCapabilities(capabilities: CapabilityGrant, force = false): SecurityAuditReport {
    const warnings: string[] = [];

    // Check Network permissions
    if (capabilities.net?.allowedHosts) {
      if (capabilities.net.allowedHosts.includes('*')) {
        warnings.push('Unrestricted wildcard network access (allowedHosts: ["*"]) requested.');
      }
      if (capabilities.net.allowHttp) {
        warnings.push('Insecure plain HTTP network communication allowed.');
      }
    }

    // Check Filesystem permissions
    if (capabilities.fs?.writePaths) {
      for (const p of capabilities.fs.writePaths) {
        if (p === '/' || p === 'C:\\' || p === '.' || p.startsWith('..')) {
          warnings.push(`Broad root/parent filesystem write permission requested: "${p}".`);
        }
      }
    }

    // Check Environment variable permissions
    if (capabilities.env && capabilities.env.length > 5) {
      warnings.push(`High number of environment variables (${capabilities.env.length}) requested.`);
    }

    const isSafe = warnings.length === 0 || force;
    return { isSafe, warnings, capabilities };
  }

  /**
   * Fetches the raw markdown document from the normalized URL.
   */
  public static async fetchDocument(url: string, timeoutMs = 10000): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'OpenTalon-Skill-Installer/0.1.0 (https://github.com/roedyrustam/opentalon)',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to download skill (HTTP ${response.status}): ${response.statusText}`);
      }

      return await response.text();
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Download timed out after ${timeoutMs}ms from: ${url}`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Downloads, audits, tests in sandbox, and commits skill into procedural memory.
   */
  public static async install(
    targetUrlOrShorthand: string,
    memory: any, // IMemoryPort
    synthesizer?: SkillSynthesizer,
    options: SkillInstallOptions = {}
  ): Promise<SkillInstallResult> {
    const normalizedUrl = this.normalizeUrl(targetUrlOrShorthand);
    const rawMarkdown = await this.fetchDocument(normalizedUrl, options.timeoutMs);

    // 1. Parse markdown & frontmatter
    const parsed = SkillMarkdownParser.parse(rawMarkdown);
    const { metadata, executableCode, testCases } = parsed;

    // 2. Perform security audit
    const audit = this.auditCapabilities(metadata.capabilities, options.force);
    if (!audit.isSafe && !options.force) {
      return {
        success: false,
        skillName: metadata.name,
        version: metadata.version,
        description: metadata.description,
        sourceUrl: normalizedUrl,
        audit,
        error: `Security Audit Warning: Skill requests high-risk capabilities: ${audit.warnings.join(' ')}. Use --force to proceed.`,
      };
    }

    // 3. Test and synthesize candidate in Zero-Trust Sandbox isolate
    const syn = synthesizer ?? new SkillSynthesizer();
    let parsedTestCases: Array<{ args: Record<string, unknown>; expected: unknown }> | undefined;

    if (testCases) {
      try {
        parsedTestCases = JSON.parse(testCases);
      } catch {
        // Fallback to dry-run
      }
    }

    const synthResult = await syn.synthesize({
      name: metadata.name,
      description: metadata.description,
      code: executableCode,
      capabilities: metadata.capabilities,
      testCases: parsedTestCases,
    });

    if (!synthResult.success || !synthResult.skillDocument) {
      return {
        success: false,
        skillName: metadata.name,
        version: metadata.version,
        description: metadata.description,
        sourceUrl: normalizedUrl,
        audit,
        error: `Skill Sandbox Verification Failed: ${synthResult.error}`,
      };
    }

    // 4. Check if skill exists and overwrite policy
    const existing = await memory.getSkill(metadata.name);
    if (existing && !options.overwrite) {
      return {
        success: false,
        skillName: metadata.name,
        version: metadata.version,
        description: metadata.description,
        sourceUrl: normalizedUrl,
        audit,
        error: `Skill "${metadata.name}" is already registered (v${existing.version}). Use --overwrite to replace.`,
      };
    }

    // 5. Commit to procedural memory database
    const finalSkill = {
      id: existing?.id || `skill_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      name: metadata.name,
      description: metadata.description,
      capabilities: metadata.capabilities,
      version: metadata.version,
      code: executableCode,
      testCases,
      hash: synthResult.skillDocument.metadata.id || `hash_${Date.now()}`,
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    await memory.saveSkill(finalSkill);

    return {
      success: true,
      skillName: finalSkill.name,
      version: finalSkill.version,
      description: finalSkill.description,
      sourceUrl: normalizedUrl,
      hash: finalSkill.hash,
      audit,
    };
  }
}
