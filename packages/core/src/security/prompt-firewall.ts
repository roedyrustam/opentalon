import crypto from 'node:crypto';

export type FirewallMode = 'block' | 'sanitize' | 'audit';

export type FirewallThreatCategory =
  | 'system_override'
  | 'jailbreak_persona'
  | 'delimiter_spoofing'
  | 'indirect_injection'
  | 'secret_exfiltration';

export interface FirewallThreat {
  ruleId: string;
  category: FirewallThreatCategory;
  severity: 'critical' | 'high' | 'medium';
  description: string;
  matchedSnippet: string;
}

export interface FirewallScanResult {
  safe: boolean;
  action: 'allow' | 'sanitized' | 'blocked';
  riskScore: number;
  originalLength: number;
  sanitizedText: string;
  threats: FirewallThreat[];
  secretsRedacted: number;
  timestamp: number;
}

export interface FirewallConfig {
  mode?: FirewallMode;
  redactSecrets?: boolean;
  maxAuditEvents?: number;
}

export interface FirewallAuditEvent {
  id: string;
  timestamp: number;
  action: FirewallScanResult['action'];
  riskScore: number;
  threatRuleIds: string[];
  secretsRedacted: number;
  inputPreview: string;
}

export interface FirewallStats {
  mode: FirewallMode;
  totalScanned: number;
  threatsDetected: number;
  blockedCount: number;
  sanitizedCount: number;
  secretsRedactedCount: number;
  recentEventsCount: number;
}

interface InjectionRule {
  ruleId: string;
  category: FirewallThreatCategory;
  severity: 'critical' | 'high' | 'medium';
  weight: number;
  description: string;
  pattern: RegExp;
}

const INJECTION_RULES: InjectionRule[] = [
  {
    ruleId: 'PI-001',
    category: 'system_override',
    severity: 'critical',
    weight: 60,
    description: 'Attempt to override or ignore prior system instructions and rules.',
    pattern:
      /\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above|system)\s+(?:instructions|prompts|rules|directives)\b/i,
  },
  {
    ruleId: 'PI-002',
    category: 'jailbreak_persona',
    severity: 'critical',
    weight: 60,
    description: 'Attempt to force an unrestricted or DAN jailbreak persona.',
    pattern:
      /\b(?:you\s+are\s+now\s+DAN|do\s+anything\s+now|enable\s+developer\s+mode|bypass\s+all\s+safety\s+(?:filters|guardrails)|act\s+as\s+an\s+unrestricted)\b/i,
  },
  {
    ruleId: 'PI-003',
    category: 'delimiter_spoofing',
    severity: 'high',
    weight: 45,
    description: 'Spoofed system prompt delimiter or chat template control token.',
    pattern:
      /(?:<\|im_start\|>\s*system|\[SYSTEM\s+INSTRUCTION\s+OVERRIDE\]|###\s*SYSTEM\s+OVERRIDE|<\/?system_prompt>)/i,
  },
  {
    ruleId: 'PI-004',
    category: 'indirect_injection',
    severity: 'high',
    weight: 45,
    description: 'Hidden HTML comment containing suspicious instruction override directives.',
    pattern: /<!--[\s\S]*?(?:ignore|system|override|execute)[\s\S]*?-->/i,
  },
  {
    ruleId: 'PI-005',
    category: 'secret_exfiltration',
    severity: 'high',
    weight: 50,
    description: 'Attempt to extract system prompts, environment variables, or cryptographic keys.',
    pattern:
      /\b(?:reveal|print|dump|exfiltrate|output)\s+(?:your\s+)?(?:system\s+prompt|private[_\s]?key|process\.env|api[_\s]?keys)\b/i,
  },
];

export class PromptInjectionFirewall {
  private mode: FirewallMode;
  private shouldRedactSecrets: boolean;
  private maxAuditEvents: number;

  private totalScanned = 0;
  private threatsDetected = 0;
  private blockedCount = 0;
  private sanitizedCount = 0;
  private secretsRedactedCount = 0;
  private auditEvents: FirewallAuditEvent[] = [];

  constructor(config: FirewallConfig = {}) {
    this.mode = config.mode ?? 'sanitize';
    this.shouldRedactSecrets = config.redactSecrets ?? true;
    this.maxAuditEvents = config.maxAuditEvents ?? 200;
  }

  public getMode(): FirewallMode {
    return this.mode;
  }

  public setMode(mode: FirewallMode): void {
    this.mode = mode;
  }

  /**
   * Redacts common API keys and PEM cryptographic private keys from untrusted text.
   */
  public redactSecrets(text: string): { text: string; redactedCount: number } {
    let redactedCount = 0;
    let output = text;

    const secretPatterns: Array<{ regex: RegExp; placeholder: string }> = [
      {
        regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
        placeholder: '[REDACTED_API_KEY]',
      },
      {
        regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
        placeholder: '[REDACTED_GEMINI_KEY]',
      },
      {
        regex:
          /-----BEGIN\s+(?:(?:RSA|EC|OPENSSH)\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:(?:RSA|EC|OPENSSH)\s+)?PRIVATE\s+KEY-----/g,
        placeholder: '[REDACTED_PRIVATE_KEY]',
      },
    ];

    for (const { regex, placeholder } of secretPatterns) {
      output = output.replace(regex, () => {
        redactedCount += 1;
        return placeholder;
      });
    }

    return { text: output, redactedCount };
  }

  /**
   * Scans an inbound prompt, webhook body, or tool output for prompt injections and leaked secrets.
   */
  public scan(input: string, overrideMode?: FirewallMode): FirewallScanResult {
    const activeMode = overrideMode ?? this.mode;
    const timestamp = Date.now();
    this.totalScanned += 1;

    const threats: FirewallThreat[] = [];
    let riskScore = 0;
    let workingText = input;

    for (const rule of INJECTION_RULES) {
      const match = workingText.match(rule.pattern);
      if (match) {
        threats.push({
          ruleId: rule.ruleId,
          category: rule.category,
          severity: rule.severity,
          description: rule.description,
          matchedSnippet: match[0].slice(0, 120),
        });
        riskScore += rule.weight;

        if (activeMode === 'sanitize') {
          const globalPattern = new RegExp(rule.pattern.source, 'gi');
          workingText = workingText.replace(globalPattern, '[NEUTRALIZED_INJECTION]');
        }
      }
    }

    riskScore = Math.min(100, riskScore);

    let secretsRedacted = 0;
    if (this.shouldRedactSecrets) {
      const redaction = this.redactSecrets(workingText);
      workingText = redaction.text;
      secretsRedacted = redaction.redactedCount;
    }

    let action: FirewallScanResult['action'] = 'allow';
    const safe = threats.length === 0;

    if (activeMode === 'block' && riskScore >= 45) {
      action = 'blocked';
      this.blockedCount += 1;
    } else if (
      (activeMode === 'sanitize' && (threats.length > 0 || secretsRedacted > 0)) ||
      secretsRedacted > 0
    ) {
      action = 'sanitized';
      this.sanitizedCount += 1;
    }

    if (threats.length > 0) {
      this.threatsDetected += threats.length;
    }
    if (secretsRedacted > 0) {
      this.secretsRedactedCount += secretsRedacted;
    }

    if (threats.length > 0 || secretsRedacted > 0) {
      this.recordAuditEvent({
        id: `fw_${timestamp}_${crypto.randomBytes(3).toString('hex')}`,
        timestamp,
        action,
        riskScore,
        threatRuleIds: threats.map((t) => t.ruleId),
        secretsRedacted,
        inputPreview: workingText.slice(0, 140),
      });
    }

    return {
      safe,
      action,
      riskScore,
      originalLength: input.length,
      sanitizedText: workingText,
      threats,
      secretsRedacted,
      timestamp,
    };
  }

  public getStats(): FirewallStats {
    return {
      mode: this.mode,
      totalScanned: this.totalScanned,
      threatsDetected: this.threatsDetected,
      blockedCount: this.blockedCount,
      sanitizedCount: this.sanitizedCount,
      secretsRedactedCount: this.secretsRedactedCount,
      recentEventsCount: this.auditEvents.length,
    };
  }

  public getRecentEvents(limit = 50): FirewallAuditEvent[] {
    return this.auditEvents.slice(0, Math.max(0, limit));
  }

  private recordAuditEvent(evt: FirewallAuditEvent): void {
    this.auditEvents.unshift(evt);
    if (this.auditEvents.length > this.maxAuditEvents) {
      this.auditEvents.length = this.maxAuditEvents;
    }
  }
}
