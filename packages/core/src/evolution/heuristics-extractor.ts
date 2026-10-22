import { type EpisodicTrace } from '@opentalon/memory';

export interface EvolutionOpportunity {
  id: string;
  type: 'heal_failure' | 'synthesize_new' | 'optimize_performance';
  reason: string;
  intent: string;
  failedToolName?: string;
  sampleInputs: string[];
  traces: EpisodicTrace[];
}

export class HeuristicsExtractor {
  /**
   * Analyzes episodic traces to detect evolution candidates:
   * 1. Repeated execution errors requiring self-healing.
   * 2. Repetitive queries without matching procedural skills.
   */
  public static extractOpportunities(traces: EpisodicTrace[]): EvolutionOpportunity[] {
    const opportunities: EvolutionOpportunity[] = [];
    const failureGroups = new Map<string, EpisodicTrace[]>();
    const missingSkillGroups = new Map<string, EpisodicTrace[]>();

    for (const trace of traces) {
      // 1. Group failed executions
      if (!trace.success || trace.errorMessage) {
        const key = trace.toolCalls.find((tc) => !tc.success)?.toolName || 'general_failure';
        const group = failureGroups.get(key) || [];
        group.push(trace);
        failureGroups.set(key, group);
        continue;
      }

      // 2. Group queries that had NO procedural skills retrieved
      if (trace.retrievedSkillIds.length === 0 && trace.input.length > 5) {
        // Simple normalized keyword signature (first 3 main words)
        const signature = trace.input
          .toLowerCase()
          .replace(/[^\w\s]/g, '')
          .split(/\s+/)
          .slice(0, 3)
          .join('_');

        const group = missingSkillGroups.get(signature) || [];
        group.push(trace);
        missingSkillGroups.set(signature, group);
      }
    }

    // Convert failure groups to healing opportunities
    for (const [toolName, group] of failureGroups.entries()) {
      opportunities.push({
        id: `opp_heal_${toolName}_${Date.now()}`,
        type: 'heal_failure',
        reason: `Detected ${group.length} failure(s) in tool execution: ${toolName}`,
        intent: group[0].input,
        failedToolName: toolName !== 'general_failure' ? toolName : undefined,
        sampleInputs: group.map((t) => t.input).slice(0, 3),
        traces: group,
      });
    }

    // Convert missing skill groups to synthesis opportunities
    for (const [sig, group] of missingSkillGroups.entries()) {
      if (group.length >= 1) {
        opportunities.push({
          id: `opp_synth_${sig}_${Date.now()}`,
          type: 'synthesize_new',
          reason: `Repeated user task without dedicated procedural skill: "${sig}"`,
          intent: group[0].input,
          sampleInputs: group.map((t) => t.input).slice(0, 3),
          traces: group,
        });
      }
    }

    return opportunities;
  }
}
