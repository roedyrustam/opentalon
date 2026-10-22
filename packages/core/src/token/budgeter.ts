import { type ChatMessage, type ToolDefinition } from '../types.js';

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
