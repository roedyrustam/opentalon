import { type ILLMPort, type LLMRequest, type LLMResponse, type StreamChunk } from '../types.js';

export interface AnthropicDriverOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  maxTokens?: number;
  anthropicVersion?: string;
  fallbackEmbeddingDriver?: ILLMPort;
}

export class AnthropicDriver implements ILLMPort {
  private apiKey: string;
  private baseURL: string;
  private model: string;
  private maxTokens: number;
  private anthropicVersion: string;
  private fallbackEmbeddingDriver?: ILLMPort;

  constructor(options: AnthropicDriverOptions = {}) {
    this.apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY || '';
    this.baseURL = (options.baseURL || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
    this.model = options.model || process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219';
    this.maxTokens = options.maxTokens || 4096;
    this.anthropicVersion = options.anthropicVersion || '2023-06-01';
    this.fallbackEmbeddingDriver = options.fallbackEmbeddingDriver;
  }

  public async generateContent(request: LLMRequest): Promise<LLMResponse> {
    const url = `${this.baseURL}/messages`;

    // Map messages into Anthropic format
    const messages: Array<{
      role: 'user' | 'assistant';
      content: string | Array<Record<string, unknown>>;
    }> = [];

    for (const m of request.messages) {
      if (m.role === 'system') continue; // Handled via top-level system parameter

      if (m.toolResults && m.toolResults.length > 0) {
        messages.push({
          role: 'user',
          content: m.toolResults.map((tr) => ({
            type: 'tool_result',
            tool_use_id: tr.toolCallId,
            content: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result),
          })),
        });
      } else if (m.toolCalls && m.toolCalls.length > 0) {
        const blocks: Array<Record<string, unknown>> = [];
        if (m.content) {
          blocks.push({ type: 'text', text: m.content });
        }
        for (const tc of m.toolCalls) {
          blocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.args,
          });
        }
        messages.push({
          role: 'assistant',
          content: blocks,
        });
      } else {
        messages.push({
          role: m.role,
          content: m.content,
        });
      }
    }

    // Ensure at least one message exists
    if (messages.length === 0) {
      messages.push({ role: 'user', content: 'Hello' });
    }

    const payload: Record<string, unknown> = {
      model: this.model,
      messages,
      max_tokens: request.maxTokens || this.maxTokens,
      temperature: request.temperature ?? 0.7,
    };

    if (request.systemInstruction) {
      payload.system = request.systemInstruction;
    }

    if (request.tools && request.tools.length > 0) {
      payload.tools = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    // Thinking mode support (Claude 3.7)
    if (request.thinkingConfig?.mode === 'deep' || request.thinkingConfig?.thinkingBudget) {
      payload.thinking = {
        type: 'enabled',
        budget_tokens: request.thinkingConfig.thinkingBudget || 2048,
      };
      // When thinking is enabled, temperature must be 1.0 per Anthropic spec
      payload.temperature = 1.0;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.anthropicVersion,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API Error (${response.status}): ${err}`);
    }

    const data = (await response.json()) as {
      content?: Array<{
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: Record<string, unknown>;
        thinking?: string;
      }>;
      usage?: {
        input_tokens: number;
        output_tokens: number;
      };
    };

    let textContent = '';
    let thinkingContent: string | undefined;
    const toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];

    if (Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block.type === 'text' && block.text) {
          textContent += block.text;
        } else if (block.type === 'tool_use' && block.name && block.input) {
          toolCalls.push({
            id: block.id || `call_${Math.random().toString(36).substring(2, 9)}`,
            name: block.name,
            args: block.input,
          });
        } else if (block.type === 'thinking' && block.thinking) {
          thinkingContent = block.thinking;
        }
      }
    }

    const inputTokens = data.usage?.input_tokens || 0;
    const outputTokens = data.usage?.output_tokens || 0;

    return {
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      thinkingContent,
      tokensUsed: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      model: this.model,
    };
  }

  public async *streamContent(request: LLMRequest): AsyncIterable<StreamChunk> {
    const url = `${this.baseURL}/messages`;

    const messages: Array<{ role: 'user' | 'assistant'; content: string | Array<Record<string, unknown>> }> = [];
    for (const m of request.messages) {
      if (m.role === 'system') continue;
      messages.push({ role: m.role as 'user' | 'assistant', content: m.content });
    }
    if (messages.length === 0) {
      messages.push({ role: 'user', content: 'Hello' });
    }

    const payload: Record<string, unknown> = {
      model: this.model,
      messages,
      max_tokens: request.maxTokens || this.maxTokens,
      temperature: request.temperature ?? 0.7,
      stream: true,
    };

    if (request.systemInstruction) {
      payload.system = request.systemInstruction;
    }

    if (request.tools && request.tools.length > 0) {
      payload.tools = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.anthropicVersion,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.text();
      yield { type: 'error', error: `Anthropic Streaming Error (${response.status}): ${err}` };
      return;
    }

    if (!response.body) {
      yield { type: 'error', error: 'Anthropic streaming response has no body' };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6);
            try {
              const event = JSON.parse(jsonStr) as {
                type: string;
                delta?: { type?: string; text?: string; thinking?: string };
                content_block?: { type?: string; id?: string; name?: string };
                usage?: { input_tokens?: number; output_tokens?: number };
              };

              if (event.type === 'content_block_delta') {
                if (event.delta?.type === 'text_delta' && event.delta.text) {
                  yield { type: 'text_delta', textDelta: event.delta.text, model: this.model };
                } else if (event.delta?.type === 'thinking_delta' && event.delta.thinking) {
                  yield { type: 'thinking_delta', thinkingDelta: event.delta.thinking, model: this.model };
                }
              } else if (event.type === 'message_delta' && event.usage) {
                yield {
                  type: 'usage',
                  usage: {
                    promptTokens: event.usage.input_tokens || 0,
                    completionTokens: event.usage.output_tokens || 0,
                    totalTokens: (event.usage.input_tokens || 0) + (event.usage.output_tokens || 0),
                  },
                  model: this.model,
                };
              } else if (event.type === 'message_stop') {
                // Final event
              }
            } catch {
              // Skip malformed chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: 'done', model: this.model };
  }

  public async createEmbedding(text: string): Promise<number[]> {
    if (this.fallbackEmbeddingDriver) {
      return this.fallbackEmbeddingDriver.createEmbedding(text);
    }
    throw new Error('Anthropic does not offer native embeddings. Please configure a fallback embedding driver (e.g. Gemini, OpenAI, or Ollama).');
  }
}
