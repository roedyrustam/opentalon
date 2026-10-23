import { type ThinkingConfig } from '../types.js';

export type ThinkingTier = 'fast' | 'balanced' | 'deep' | 'extreme';

export interface ThinkingEvaluationInput {
  input: string;
  toolCount?: number;
  attachmentCount?: number;
  isRetry?: boolean;
  isArchitectureOrEvolution?: boolean;
  overrideConfig?: ThinkingConfig;
}

export interface ThinkingEvaluationResult {
  entropyScore: number; // 0 to 100
  tier: ThinkingTier;
  thinkingBudget: number;
  mode: 'fast' | 'balanced' | 'deep';
  reasons: string[];
}

const DEEP_REASONING_PATTERN =
  /\b(architect\w*|refactor\w*|security|vulnerabilit\w*|exploit\w*|concurren\w*|race\s+condition|deadlock|formal\s+verif\w*|invariant|cryptograph\w*|post-quantum|optimize|bottleneck|benchmark|distributed|migration|schema\s+design|prove|theorem|root\s+cause|debug\w*)\b/i;

const ANALYTICAL_PATTERN =
  /\b(analyz\w*|analis\w*|compare|bandingkan|explain\w*|jelaskan|synthesiz\w*|evaluat\w*|design|rancang|implement\w*|pipeline|workflow|algorithm|algoritma|calculat\w*|hitung|audit|rekomendasi|recommend\w*)\b/i;

const CODE_SYNTAX_PATTERN = /```[\s\S]*?```|\b(function|class|interface|SELECT|CREATE\s+TABLE|async|await|import\s+|export\s+)\b/;

/**
 * Deterministic, zero-latency (O(1)) System-2 Thinking Budget Orchestrator
 * for Gemini 4 Pro, Gemini 4 Argon, and Gemini 3.8 Flash.
 */
export class ThinkingBudgetCalculator {
  /**
   * Evaluates task entropy and returns the optimal thinking budget and reasoning tier.
   */
  public static evaluate(params: ThinkingEvaluationInput): ThinkingEvaluationResult {
    const reasons: string[] = [];

    // 1. Honor explicit caller override if provided
    if (params.overrideConfig?.thinkingBudget !== undefined) {
      const budget = params.overrideConfig.thinkingBudget;
      const mode =
        params.overrideConfig.mode ??
        (budget >= 16384 ? 'deep' : budget >= 4096 ? 'balanced' : 'fast');
      const tier: ThinkingTier =
        budget >= 65536 ? 'extreme' : budget >= 16384 ? 'deep' : budget >= 4096 ? 'balanced' : 'fast';

      return {
        entropyScore: Math.min(100, Math.round((budget / 32768) * 100)),
        tier,
        thinkingBudget: budget,
        mode,
        reasons: ['explicit_override'],
      };
    }

    const text = (params.input || '').trim();
    let score = 0;

    // 2. Lexical length & multi-constraint density
    if (text.length > 1200) {
      score += 25;
      reasons.push('long_context_input');
    } else if (text.length > 350) {
      score += 15;
      reasons.push('moderate_length_input');
    } else if (text.length > 100) {
      score += 5;
    }

    // 3. Code block or formal query syntax presence
    if (CODE_SYNTAX_PATTERN.test(text)) {
      score += 20;
      reasons.push('code_or_formal_syntax');
    }

    // 4. Deep architectural / security / concurrency keywords
    if (DEEP_REASONING_PATTERN.test(text)) {
      score += 35;
      reasons.push('deep_reasoning_keywords');
    } else if (ANALYTICAL_PATTERN.test(text)) {
      score += 15;
      reasons.push('analytical_keywords');
    }

    // 5. Tool orchestration complexity
    const toolCount = params.toolCount ?? 0;
    if (toolCount >= 4) {
      score += 20;
      reasons.push(`multi_tool_orchestration(${toolCount})`);
    } else if (toolCount >= 1) {
      score += 10;
      reasons.push(`tool_routing(${toolCount})`);
    }

    // 5b. Multimodal Vision / Document Grounding Complexity
    const attachmentCount = params.attachmentCount ?? 0;
    if (attachmentCount > 0) {
      score += 20;
      reasons.push(`multimodal_grounding(${attachmentCount})`);
    }

    // 6. Architecture / Slow-Path Evolution flag
    if (params.isArchitectureOrEvolution) {
      score += 35;
      reasons.push('architecture_or_evolution_task');
    }

    // 7. Self-healing / Sandbox Retry Escalation
    if (params.isRetry) {
      score += 40;
      reasons.push('self_healing_retry_escalation');
    }

    // Honor explicit mode override if budget wasn't explicitly set
    if (params.overrideConfig?.mode === 'deep' && score < 65) {
      score = 65;
      reasons.push('mode_override_deep');
    } else if (params.overrideConfig?.mode === 'balanced' && score < 30) {
      score = 30;
      reasons.push('mode_override_balanced');
    } else if (params.overrideConfig?.mode === 'fast') {
      score = Math.min(score, 20);
      reasons.push('mode_override_fast');
    }

    const clampedScore = Math.min(100, Math.max(0, score));

    // Map entropy score (0..100) to canonical Gemini 4 / 3.8 thinking budgets
    if (clampedScore >= 90) {
      return {
        entropyScore: clampedScore,
        tier: 'extreme',
        thinkingBudget: 65536,
        mode: 'deep',
        reasons,
      };
    }

    if (clampedScore >= 75) {
      return {
        entropyScore: clampedScore,
        tier: 'deep',
        thinkingBudget: 32768,
        mode: 'deep',
        reasons,
      };
    }

    if (clampedScore >= 55) {
      return {
        entropyScore: clampedScore,
        tier: 'deep',
        thinkingBudget: 16384,
        mode: 'deep',
        reasons,
      };
    }

    if (clampedScore >= 35) {
      return {
        entropyScore: clampedScore,
        tier: 'balanced',
        thinkingBudget: 8192,
        mode: 'balanced',
        reasons,
      };
    }

    if (clampedScore >= 20) {
      return {
        entropyScore: clampedScore,
        tier: 'balanced',
        thinkingBudget: 4096,
        mode: 'balanced',
        reasons,
      };
    }

    if (clampedScore >= 10) {
      return {
        entropyScore: clampedScore,
        tier: 'fast',
        thinkingBudget: 2048,
        mode: 'fast',
        reasons,
      };
    }

    return {
      entropyScore: clampedScore,
      tier: 'fast',
      thinkingBudget: 0,
      mode: 'fast',
      reasons: reasons.length > 0 ? reasons : ['trivial_fast_path'],
    };
  }
}
