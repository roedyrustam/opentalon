import crypto from 'node:crypto';
import { type ChatMessage, type ToolDefinition, type SemanticFact } from '../types.js';

export class TokenBudgeter {
  /**
   * Fast, reliable token estimation without heavy external native dependencies.
   * Standard heuristic: ~4 characters per token in English / code.
   */
  public static estimateTokens(text: string): number {
    if (!text || text.length === 0) return 0;
    // Base 4 chars/token, adjusted for punctuation & whitespace
    return Math.ceil(text.length / 3.8);
  }

  public static estimateMessagesTokens(messages: ChatMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      total += 4; // per-message overhead
      total += this.estimateTokens(msg.content);
      if (msg.toolCalls) {
        total += this.estimateTokens(JSON.stringify(msg.toolCalls));
      }
      if (msg.toolResults) {
        total += this.estimateTokens(JSON.stringify(msg.toolResults));
      }
    }
    return total;
  }

  public static estimateToolsTokens(tools?: ToolDefinition[]): number {
    if (!tools || tools.length === 0) return 0;
    return this.estimateTokens(JSON.stringify(tools));
  }

  /**
   * Deterministically sorts ToolDefinitions by name and recursively sorts parameter keys
   * so that KV-Cache prefixes remain 100% byte-identical across turns.
   */
  public static canonicalizeTools(tools: ToolDefinition[]): ToolDefinition[] {
    if (!tools || tools.length === 0) return [];
    return [...tools]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: this.canonicalizeObject(tool.parameters) as Record<string, unknown>,
      }));
  }

  /**
   * Deterministically sorts SemanticFacts by category and key to preserve prefix stability.
   */
  public static canonicalizeFacts(facts: SemanticFact[]): SemanticFact[] {
    if (!facts || facts.length === 0) return [];
    return [...facts].sort((a, b) => {
      const catCmp = a.category.localeCompare(b.category);
      if (catCmp !== 0) return catCmp;
      return a.key.localeCompare(b.key);
    });
  }

  /**
   * Builds a canonically ordered system prompt prefix and returns its deterministic SHA-256 fingerprint.
   */
  public static buildCanonicalSystemPrompt(
    baseInstruction: string,
    facts: SemanticFact[],
    tools?: ToolDefinition[]
  ): { systemPrompt: string; canonicalTools: ToolDefinition[]; prefixHash: string } {
    const sortedFacts = this.canonicalizeFacts(facts);
    const canonicalTools = tools ? this.canonicalizeTools(tools) : [];

    let systemPrompt = baseInstruction.trim();

    if (sortedFacts.length > 0) {
      const factSnippets = sortedFacts
        .map((f) => `• [${f.category}] ${f.key}: ${f.value}`)
        .join('\n');
      systemPrompt += `\n\nVerified Knowledge Context:\n${factSnippets}`;
    }

    const prefixPayload = JSON.stringify({
      systemPrompt,
      tools: canonicalTools,
    });

    const prefixHash = crypto.createHash('sha256').update(prefixPayload).digest('hex');

    return {
      systemPrompt,
      canonicalTools,
      prefixHash,
    };
  }

  private static canonicalizeObject(val: unknown): unknown {
    if (Array.isArray(val)) {
      return val.map((item) => this.canonicalizeObject(item));
    }
    if (val !== null && typeof val === 'object') {
      const sortedKeys = Object.keys(val as Record<string, unknown>).sort();
      const result: Record<string, unknown> = {};
      for (const k of sortedKeys) {
        result[k] = this.canonicalizeObject((val as Record<string, unknown>)[k]);
      }
      return result;
    }
    return val;
  }

  /**
   * Prunes and compresses conversation messages from the oldest turns
   * so that (systemPrompt + tools + messages) strictly stays below tokenBudget.
   */
  public static fitWithinBudget(
    messages: ChatMessage[],
    systemPrompt: string,
    tools: ToolDefinition[] | undefined,
    tokenBudget = 1500
  ): ChatMessage[] {
    const systemTokens = this.estimateTokens(systemPrompt);
    const toolsTokens = this.estimateToolsTokens(tools);
    const availableForMessages = tokenBudget - (systemTokens + toolsTokens);

    if (availableForMessages <= 100) {
      // Keep only the most recent message
      return messages.slice(-1);
    }

    const result: ChatMessage[] = [];
    let currentTokens = 0;

    // Scan backwards from most recent message
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const msgTokens = this.estimateTokens(msg.content) + 4;
      if (currentTokens + msgTokens > availableForMessages) {
        break;
      }
      currentTokens += msgTokens;
      result.unshift(msg);
    }

    // Always ensure at least the last user message is present
    if (result.length === 0 && messages.length > 0) {
      result.push(messages[messages.length - 1]);
    }

    return result;
  }
}
