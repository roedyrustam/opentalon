import { type ILLMPort, type LLMRequest, type LLMResponse } from '../types.js';

export interface DeepSeekDriverOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  fallbackEmbeddingDriver?: ILLMPort;
}

export class DeepSeekDriver implements ILLMPort {
  private apiKey: string;
  private baseURL: string;
  private model: string;
  private fallbackEmbeddingDriver?: ILLMPort;

  constructor(options: DeepSeekDriverOptions = {}) {
    this.apiKey = options.apiKey || process.env.DEEPSEEK_API_KEY || '';
    this.baseURL = (options.baseURL || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
    this.model = options.model || process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    this.fallbackEmbeddingDriver = options.fallbackEmbeddingDriver;
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

    if (request.maxTokens) {
      payload.max_tokens = request.maxTokens;
    }

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
      throw new Error(`DeepSeek API Error (${response.status}): ${err}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          reasoning_content?: string; // DeepSeek R1 reasoning tokens
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
      thinkingContent: choice?.reasoning_content,
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      tokensUsed: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
      model: this.model,
    };
  }

  public async createEmbedding(text: string): Promise<number[]> {
    if (this.fallbackEmbeddingDriver) {
      return this.fallbackEmbeddingDriver.createEmbedding(text);
    }
    // Attempt standard OpenAI-compatible embeddings endpoint if available
    try {
      const url = `${this.baseURL}/embeddings`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-embed',
          input: text,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
        if (data.data?.[0]?.embedding) {
          return data.data[0].embedding;
        }
      }
    } catch {
      // Fallback
    }

    throw new Error('DeepSeek embeddings not available. Please configure a fallback embedding driver.');
  }
}
