import { type ILLMPort, type LLMRequest, type LLMResponse, type StreamChunk } from '../types.js';

export interface GeminiDriverOptions {
  apiKey?: string;
  primaryModel?: string; // e.g. "gemini-4-pro" or "gemini-2.5-pro"
  fallbackModel?: string; // e.g. "gemini-3.8-flash" or "gemini-2.5-flash"
  apiEndpoint?: string;
}

export class GeminiDriver implements ILLMPort {
  private apiKey: string;
  private primaryModel: string;
  private fallbackModel: string;
  private apiEndpoint: string;

  constructor(options: GeminiDriverOptions = {}) {
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    this.primaryModel = options.primaryModel || process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    this.fallbackModel = options.fallbackModel || process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.8-flash';
    this.apiEndpoint = options.apiEndpoint || 'https://generativelanguage.googleapis.com/v1beta';
  }

  public async generateContent(request: LLMRequest): Promise<LLMResponse> {
    try {
      return await this.callModel(this.primaryModel, request);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // Invariant: Seamlessly degrade to fallback model on quota, rate limit, missing model, or high demand
      if (
        errMsg.includes('429') ||
        errMsg.includes('RESOURCE_EXHAUSTED') ||
        errMsg.includes('404') ||
        errMsg.includes('NOT_FOUND') ||
        errMsg.includes('503') ||
        errMsg.includes('high demand')
      ) {
        if (this.primaryModel !== this.fallbackModel) {
          return await this.callModel(this.fallbackModel, request);
        }
      }
      throw err;
    }
  }

  private async callModel(model: string, request: LLMRequest): Promise<LLMResponse> {
    const url = `${this.apiEndpoint}/models/${model}:generateContent?key=${this.apiKey}`;

    // Convert messages to Gemini contents format
    const contents = request.messages.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const bodyPayload: Record<string, unknown> = {
      contents,
    };

    if (request.systemInstruction) {
      bodyPayload.systemInstruction = {
        parts: [{ text: request.systemInstruction }],
      };
    }

    // Dynamic Thinking Budget Configuration
    if (request.thinkingConfig?.thinkingBudget) {
      bodyPayload.generationConfig = {
        thinkingConfig: {
          thinkingBudget: request.thinkingConfig.thinkingBudget,
        },
      };
    }

    // Native Context Caching Pinning
    if (request.cachedContentId) {
      bodyPayload.cachedContent = request.cachedContentId;
    }

    // Tool Declarations
    if (request.tools && request.tools.length > 0) {
      bodyPayload.tools = [
        {
          functionDeclarations: request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyPayload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API Error (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            thought?: string;
            functionCall?: {
              name: string;
              args: Record<string, unknown>;
            };
          }>;
        };
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };

    const firstCandidate = data.candidates?.[0];
    const parts = firstCandidate?.content?.parts || [];

    let textContent = '';
    let thinkingContent = '';
    const toolCalls: LLMResponse['toolCalls'] = [];

    for (const part of parts) {
      if (part.text) {
        textContent += part.text;
      }
      if (part.thought) {
        thinkingContent += part.thought;
      }
      if (part.functionCall) {
        toolCalls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: part.functionCall.name,
          args: part.functionCall.args,
        });
      }
    }

    return {
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      thinkingContent: thinkingContent || undefined,
      tokensUsed: {
        promptTokens: data.usageMetadata?.promptTokenCount || 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata?.totalTokenCount || 0,
      },
      model,
    };
  }

  public async *streamContent(request: LLMRequest): AsyncIterable<StreamChunk> {
    yield* this.streamModel(this.primaryModel, request);
  }

  private async *streamModel(model: string, request: LLMRequest): AsyncIterable<StreamChunk> {
    const url = `${this.apiEndpoint}/models/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    const contents = request.messages.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const bodyPayload: Record<string, unknown> = { contents };

    if (request.systemInstruction) {
      bodyPayload.systemInstruction = { parts: [{ text: request.systemInstruction }] };
    }

    if (request.thinkingConfig?.thinkingBudget) {
      bodyPayload.generationConfig = {
        thinkingConfig: { thinkingBudget: request.thinkingConfig.thinkingBudget },
      };
    }

    if (request.cachedContentId) {
      bodyPayload.cachedContent = request.cachedContentId;
    }

    if (request.tools && request.tools.length > 0) {
      bodyPayload.tools = [{
        functionDeclarations: request.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      }];
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
    });

    if (!response.ok) {
      const errText = await response.text();
      yield { type: 'error', error: `Gemini Streaming Error (${response.status}): ${errText}` };
      return;
    }

    if (!response.body) {
      yield { type: 'error', error: 'Gemini streaming response has no body' };
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
                candidates?: Array<{
                  content?: {
                    parts?: Array<{
                      text?: string;
                      thought?: string;
                      functionCall?: { name: string; args: Record<string, unknown> };
                    }>;
                  };
                }>;
                usageMetadata?: {
                  promptTokenCount?: number;
                  candidatesTokenCount?: number;
                  totalTokenCount?: number;
                };
              };

              const parts = chunk.candidates?.[0]?.content?.parts || [];
              for (const part of parts) {
                if (part.text) {
                  yield { type: 'text_delta', textDelta: part.text, model };
                }
                if (part.thought) {
                  yield { type: 'thinking_delta', thinkingDelta: part.thought, model };
                }
                if (part.functionCall) {
                  yield {
                    type: 'tool_call',
                    toolCall: {
                      id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                      name: part.functionCall.name,
                      args: part.functionCall.args,
                    },
                    model,
                  };
                }
              }

              if (chunk.usageMetadata) {
                yield {
                  type: 'usage',
                  usage: {
                    promptTokens: chunk.usageMetadata.promptTokenCount || 0,
                    completionTokens: chunk.usageMetadata.candidatesTokenCount || 0,
                    totalTokens: chunk.usageMetadata.totalTokenCount || 0,
                  },
                  model,
                };
              }
            } catch {
              // Skip malformed JSON chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: 'done', model };
  }

  public async createEmbedding(text: string): Promise<number[]> {
    const embedModel = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
    const url = `${this.apiEndpoint}/models/${embedModel}:embedContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${embedModel}`,
        content: { parts: [{ text }] },
      }),
    });

    if (!response.ok) {
      // Return deterministic fallback embedding vector if offline or API key missing
      return this.generateDeterministicVector(text, 768);
    }

    const data = (await response.json()) as {
      embedding?: { values?: number[] };
    };

    return data.embedding?.values || this.generateDeterministicVector(text, 768);
  }

  private generateDeterministicVector(text: string, dimensions = 768): number[] {
    const vector = new Array(dimensions).fill(0);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      const index = (code * 31 + i) % dimensions;
      vector[index] += 1 / (1 + i);
    }
    // Normalize
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return norm === 0 ? vector : vector.map((v) => v / norm);
  }
}
