import { type ILLMPort, type LLMRequest, type LLMResponse } from '../types.js';

export interface OllamaDriverOptions {
  baseURL?: string;
  model?: string;
  embeddingModel?: string;
  apiKey?: string; // Optional if proxy requires Bearer token
}

export class OllamaDriver implements ILLMPort {
  private baseURL: string;
  private model: string;
  private embeddingModel: string;
  private apiKey?: string;

  constructor(options: OllamaDriverOptions = {}) {
    this.baseURL = (options.baseURL || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    this.model = options.model || process.env.OLLAMA_MODEL || 'qwen2.5:7b';
    this.embeddingModel = options.embeddingModel || process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
    this.apiKey = options.apiKey || process.env.OLLAMA_API_KEY;
  }

  public async generateContent(request: LLMRequest): Promise<LLMResponse> {
    const url = `${this.baseURL}/v1/chat/completions`;
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
      stream: false,
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

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Ollama Local API Error (${response.status}): ${err}`);
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

  public async createEmbedding(text: string): Promise<number[]> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    // Try native Ollama /api/embeddings first
    try {
      const url = `${this.baseURL}/api/embeddings`;
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.embeddingModel,
          prompt: text,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { embedding?: number[] };
        if (data.embedding && Array.isArray(data.embedding)) {
          return data.embedding;
        }
      }
    } catch {
      // Fall through to /v1/embeddings
    }

    // Try OpenAI-compatible /v1/embeddings
    const v1Url = `${this.baseURL}/v1/embeddings`;
    const res = await fetch(v1Url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.embeddingModel,
        input: text,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama Embedding Error (${res.status}): ${err}`);
    }

    const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
    if (data.data?.[0]?.embedding) {
      return data.data[0].embedding;
    }

    throw new Error('Failed to retrieve embeddings from Ollama');
  }
}
