import { type ILLMPort, type LLMRequest, type LLMResponse } from '../types.js';

export class MockLLMDriver implements ILLMPort {
  public mockResponse: LLMResponse = {
    content: 'Mock assistant response',
    tokensUsed: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
    model: 'mock-model',
  };

  public toolCallToTrigger?: {
    name: string;
    args: Record<string, unknown>;
  };

  public lastRequest?: LLMRequest;

  public async generateContent(request: LLMRequest): Promise<LLMResponse> {
    this.lastRequest = request;

    if (this.toolCallToTrigger) {
      const tc = this.toolCallToTrigger;
      this.toolCallToTrigger = undefined; // trigger once
      return {
        content: '',
        toolCalls: [
          {
            id: 'mock_call_1',
            name: tc.name,
            args: tc.args,
          },
        ],
        tokensUsed: { promptTokens: 40, completionTokens: 15, totalTokens: 55 },
        model: 'mock-model',
      };
    }

    return this.mockResponse;
  }

  public async createEmbedding(text: string): Promise<number[]> {
    const vector = new Array(768).fill(0);
    for (let i = 0; i < text.length; i++) {
      vector[i % 768] += (text.charCodeAt(i) % 10) / 10;
    }
    return vector;
  }
}
