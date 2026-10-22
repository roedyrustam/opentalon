import crypto from 'node:crypto';
import { type SkillVersionCommit, type SkillRollbackResult } from '../types.js';

export class SkillVersionManager {
  private history: Map<string, SkillVersionCommit[]> = new Map();

  /**
   * Computes deterministic SHA-256 hash of the skill source code.
   */
  public static computeHash(code: string): string {
    return crypto.createHash('sha256').update(code.trim()).digest('hex');
  }

  /**
   * Records a new version commit for a skill.
   */
  public commit(
    skillId: string,
    version: string,
    code: string,
    changelog: string
  ): SkillVersionCommit {
    const hash = SkillVersionManager.computeHash(code);
    const commit: SkillVersionCommit = {
      version,
      hash,
      timestamp: Date.now(),
      changelog,
      code,
    };

    const commits = this.history.get(skillId) ?? [];
    commits.push(commit);
    this.history.set(skillId, commits);
    return commit;
  }

  /**
   * Retrieves full commit history for a skill.
   */
  public getHistory(skillId: string): SkillVersionCommit[] {
    return this.history.get(skillId) ?? [];
  }

  /**
   * Rolls back a skill to its immediate previous working version.
   */
  public rollback(skillId: string, reason: string): SkillRollbackResult {
    const commits = this.history.get(skillId);
    if (!commits || commits.length <= 1) {
      return {
        success: false,
        currentVersion: commits?.[0]?.version ?? 'none',
        reason: 'No previous version available to roll back to',
      };
    }

    // Pop the bad version
    const badCommit = commits.pop()!;
    const previousCommit = commits[commits.length - 1];

    return {
      success: true,
      previousVersion: badCommit.version,
      currentVersion: previousCommit.version,
      reason,
    };
  }

  /**
   * Increments patch version (e.g. "1.0.0" -> "1.0.1")
   */
  public static incrementPatch(version: string): string {
    const parts = version.split('.').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
      return '1.0.1';
    }
    return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  }
}
