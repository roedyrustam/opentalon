import { type CapabilityGrant } from '../types.js';

export interface SecurityViolation {
  ruleId: string;
  severity: 'critical' | 'high' | 'medium';
  title: string;
  description: string;
  matchedSnippet?: string;
}

export interface SkillSecurityAuditReport {
  passed: boolean;
  score: number;
  violations: SecurityViolation[];
  scannedAt: number;
}

interface StaticCodeRule {
  ruleId: string;
  severity: 'critical' | 'high' | 'medium';
  title: string;
  description: string;
  patterns: RegExp[];
}

const STATIC_CODE_RULES: StaticCodeRule[] = [
  {
    ruleId: 'SEC-001',
    severity: 'critical',
    title: 'Prototype Pollution / Constructor Escape',
    description: 'Detected attempt to access __proto__, constructor chain, or mutate Object prototype.',
    patterns: [
      /__proto__/,
      /prototype\s*\[\s*['"`]constructor/,
      /constructor\s*\.\s*constructor/,
      /Object\.setPrototypeOf/,
    ],
  },
  {
    ruleId: 'SEC-002',
    severity: 'critical',
    title: 'Dynamic Code Evaluation',
    description: 'Detected eval(), Function() constructor, or string-evaluated timers inside skill code.',
    patterns: [
      /\beval\s*\(/,
      /new\s+Function\s*\(/,
      /setTimeout\s*\(\s*['"`]/,
      /setInterval\s*\(\s*['"`]/,
    ],
  },
  {
    ruleId: 'SEC-003',
    severity: 'critical',
    title: 'Host Process / Native Module Escape',
    description: 'Detected direct reference to Node.js process internals or restricted built-in modules.',
    patterns: [
      /process\.binding/,
      /process\.dlopen/,
      /process\.mainModule/,
      /globalThis\.process/,
      /require\s*\(\s*['"`](?:child_process|fs|net|os|cluster|worker_threads|vm|v8)['"`]/,
    ],
  },
  {
    ruleId: 'SEC-004',
    severity: 'critical',
    title: 'SSRF Cloud Metadata Target',
    description: 'Detected reference to cloud instance metadata or link-local SSRF endpoint.',
    patterns: [
      /169\.254\.169\.254/,
      /metadata\.google\.internal/i,
      /100\.100\.100\.200/,
      /fd00:ec2::254/i,
    ],
  },
  {
    ruleId: 'SEC-007',
    severity: 'high',
    title: 'Unbounded Synchronous Infinite Loop',
    description: 'Detected unbounded while(true) or for(;;) loop without break, return, or throw.',
    patterns: [
      /while\s*\(\s*true\s*\)\s*\{(?![\s\S]*?\b(?:break|return|throw)\b)[\s\S]*?\}/,
      /for\s*\(\s*;\s*;\s*\)\s*\{(?![\s\S]*?\b(?:break|return|throw)\b)[\s\S]*?\}/,
    ],
  },
  {
    ruleId: 'SEC-009',
    severity: 'medium',
    title: 'Unsafe Raw Memory Allocation',
    description: 'Detected Buffer.allocUnsafe or Buffer.allocUnsafeSlow which can leak uninitialized memory.',
    patterns: [
      /Buffer\.allocUnsafe\s*\(/,
      /Buffer\.allocUnsafeSlow\s*\(/,
    ],
  },
  {
    ruleId: 'SEC-011',
    severity: 'medium',
    title: 'Hardcoded Private Key or API Token Literal',
    description: 'Detected embedded cryptographic private key block or live Google/Gemini API key literal.',
    patterns: [
      /-----BEGIN\s+(?:RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/,
      /AIza[0-9A-Za-z_-]{35}/,
    ],
  },
  {
    ruleId: 'SEC-012',
    severity: 'medium',
    title: 'Exponential ReDoS Regex Literal',
    description: 'Detected nested quantifier regex pattern susceptible to catastrophic backtracking.',
    patterns: [
      /\/[^/\n]*\(\.[+*]\)\+[^/\n]*\//,
      /\(\.\+\)\+/,
      /\(\.\*\)\+/,
    ],
  },
];

export class SecurityGate {
  private static readonly FORBIDDEN_ENV_KEYS = new Set([
    '*',
    'PRIVATE_KEY',
    'AWS_SECRET_ACCESS_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]);

  /**
   * Executes a deterministic 12-rule Zero-Trust static security audit across skill source code
   * and declared capability grants.
   */
  public static auditSkillCode(
    code: string,
    capabilities?: CapabilityGrant
  ): SkillSecurityAuditReport {
    const violations: SecurityViolation[] = [];

    // 1. Static Code Rules (SEC-001..004, SEC-007, SEC-009, SEC-011, SEC-012)
    for (const rule of STATIC_CODE_RULES) {
      for (const pattern of rule.patterns) {
        const match = code.match(pattern);
        if (match) {
          violations.push({
            ruleId: rule.ruleId,
            severity: rule.severity,
            title: rule.title,
            description: rule.description,
            matchedSnippet: match[0].slice(0, 100),
          });
          break;
        }
      }
    }

    // 2. Capability-based SSRF metadata host check (SEC-004 supplement)
    if (capabilities?.net?.allowedHosts) {
      const metadataMatch = capabilities.net.allowedHosts.find((h) =>
        /169\.254\.169\.254|metadata\.google\.internal|100\.100\.100\.200|fd00:ec2::254/i.test(h)
      );
      if (metadataMatch && !violations.some((v) => v.ruleId === 'SEC-004')) {
        violations.push({
          ruleId: 'SEC-004',
          severity: 'critical',
          title: 'SSRF Cloud Metadata Target',
          description: 'Capabilities declare forbidden cloud metadata host.',
          matchedSnippet: metadataMatch,
        });
      }

      // SEC-005: Wildcard network capability
      if (capabilities.net.allowedHosts.some((h) => h.trim() === '*')) {
        violations.push({
          ruleId: 'SEC-005',
          severity: 'high',
          title: 'Wildcard Network Capability',
          description: 'Wildcard "*" host grant violates Zero-Trust egress allowlisting.',
          matchedSnippet: '*',
        });
      }
    }

    // SEC-006: Path traversal or root escape in FS capabilities
    const fsPaths = [
      ...(capabilities?.fs?.readPaths ?? []),
      ...(capabilities?.fs?.writePaths ?? []),
    ];
    const badFsPath = fsPaths.find((p) => {
      const norm = p.replace(/\\/g, '/').toLowerCase();
      return (
        norm.includes('..') ||
        norm === '/etc' ||
        norm.startsWith('/etc/') ||
        norm === '/root' ||
        norm.startsWith('/root/') ||
        norm.startsWith('c:/windows')
      );
    });
    if (badFsPath) {
      violations.push({
        ruleId: 'SEC-006',
        severity: 'high',
        title: 'Filesystem Path Traversal / Root Escape',
        description: 'Declared filesystem path attempts parent traversal or sensitive OS directory access.',
        matchedSnippet: badFsPath,
      });
    }

    // SEC-008: Forbidden master secret env access
    if (capabilities?.env) {
      const badEnv = capabilities.env.find((k) => this.FORBIDDEN_ENV_KEYS.has(k.trim()));
      if (badEnv) {
        violations.push({
          ruleId: 'SEC-008',
          severity: 'high',
          title: 'Forbidden Master Secret Environment Access',
          description: 'Skill requests unrestricted or master secret environment variable access.',
          matchedSnippet: badEnv,
        });
      }
    }

    // SEC-010: Excessive skill chaining depth or wildcard chaining
    if (capabilities?.skills) {
      const maxChainDepth = capabilities.skills.maxChainDepth ?? 3;
      if (maxChainDepth > 10) {
        violations.push({
          ruleId: 'SEC-010',
          severity: 'high',
          title: 'Excessive Skill Chaining Depth',
          description: `maxChainDepth (${maxChainDepth}) exceeds safe recursion ceiling of 10.`,
          matchedSnippet: `maxChainDepth=${maxChainDepth}`,
        });
      } else if (capabilities.skills.allowedSkills?.some((s) => s.trim() === '*')) {
        violations.push({
          ruleId: 'SEC-010',
          severity: 'medium',
          title: 'Wildcard Skill Chaining Permission',
          description: 'Skill declares wildcard "*" in skills.allowedSkills.',
          matchedSnippet: 'allowedSkills=["*"]',
        });
      }
    }

    // Compute security score (100 base; critical=-40, high=-20, medium=-10)
    let penalty = 0;
    for (const v of violations) {
      if (v.severity === 'critical') penalty += 40;
      else if (v.severity === 'high') penalty += 20;
      else penalty += 10;
    }

    const score = Math.max(0, Math.min(100, 100 - penalty));
    const passed = violations.every((v) => v.severity !== 'critical' && v.severity !== 'high');

    return {
      passed,
      score,
      violations,
      scannedAt: Date.now(),
    };
  }
}
