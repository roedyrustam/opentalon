import { type ILLMPort, type LLMRequest, type LLMResponse, type StreamChunk } from '../types.js';

export interface OpenAIDriverOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

export class OpenAIDriver implements ILLMPort {
  private apiKey: string;
  private baseURL: string;
  private model: string;

  constructor(options: OpenAIDriverOptions = {}) {
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY || '';
    this.baseURL = options.baseURL || 'https://api.openai.com/v1';
    this.model = options.model || 'gpt-4o-mini';
  }

  public async generateContent(request: LLMRequest): Promise<LLMResponse> {
    const url = `${this.baseURL}/chat/completions`;
    const messages = [...request.messages];

    if (request.systemInstruction) {
      messages.unshift({
        role: 'system',
        content: request.systemInstruction,
      });
    }

    const payload: Record<string, unknown> = {
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: request.temperature ?? 0.7,
    };

    if (request.tools && request.tools.length > 0) {
      payload.tools = request.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API Error (${response.status}): ${err}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{
            id: string;
            function: {
              name: string;
              arguments: string;
            };
          }>;
        };
      }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };

    const choice = data.choices?.[0]?.message;
    const toolCalls = choice?.tool_calls?.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      args: JSON.parse(tc.function.arguments || '{}'),
    }));

    return {
      content: choice?.content || '',
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      tokensUsed: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
      model: this.model,
    };
  }

  public async *streamContent(request: LLMRequest): AsyncIterable<StreamChunk> {
    const url = `${this.baseURL}/chat/completions`;
    const messages = [...request.messages];

    if (request.systemInstruction) {
      messages.unshift({ role: 'system', content: request.systemInstruction });
    }

    const payload: Record<string, unknown> = {
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: request.temperature ?? 0.7,
      stream: true,
      stream_options: { include_usage: true },
    };

    if (request.tools && request.tools.length > 0) {
      payload.tools = request.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.text();
      yield { type: 'error', error: `OpenAI Streaming Error (${response.status}): ${err}` };
      return;
    }

    if (!response.body) {
      yield { type: 'error', error: 'OpenAI streaming response has no body' };
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
            if (jsonStr === '[DONE]') continue;

            try {
              const chunk = JSON.parse(jsonStr) as {
                choices?: Array<{
                  delta?: {
                    content?: string;
                    tool_calls?: Array<{
                      index: number;
                      id?: string;
                      function?: { name?: string; arguments?: string };
                    }>;
                  };
                }>;
                usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
              };

              const delta = chunk.choices?.[0]?.delta;
              if (delta?.content) {
                yield { type: 'text_delta', textDelta: delta.content, model: this.model };
              }

              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  if (tc.id && tc.function?.name) {
                    yield {
                      type: 'tool_call',
                      toolCall: {
                        id: tc.id,
                        name: tc.function.name,
                        args: tc.function.arguments ? JSON.parse(tc.function.arguments) : {},
                      },
                      model: this.model,
                    };
                  }
                }
              }

              if (chunk.usage) {
                yield {
                  type: 'usage',
                  usage: {
                    promptTokens: chunk.usage.prompt_tokens,
                    completionTokens: chunk.usage.completion_tokens,
                    totalTokens: chunk.usage.total_tokens,
                  },
                  model: this.model,
                };
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
    const url = `${this.baseURL}/embeddings`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        input: text,
        model: 'text-embedding-3-small',
      }),
    });

    if (!response.ok) {
      return this.generateDeterministicVector(text, 1536);
    }

    const data = (await response.json()) as {
      data?: Array<{ embedding: number[] }>;
    };

    return data.data?.[0]?.embedding || this.generateDeterministicVector(text, 1536);
  }

  private generateDeterministicVector(text: string, dimensions = 1536): number[] {
    const vector = new Array(dimensions).fill(0);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      const index = (code * 37 + i) % dimensions;
      vector[index] += 1 / (1 + i);
    }
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return norm === 0 ? vector : vector.map((v) => v / norm);
  }
}
