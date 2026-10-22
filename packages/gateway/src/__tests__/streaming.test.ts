import { describe, it, expect, beforeEach } from 'vitest';
import { SseStreamAdapter } from '../adapters/sse-stream.js';
import { DualBrainRouter, MockLLMDriver } from '@opentalon/core';
import { LibSqlMemoryAdapter } from '@opentalon/memory';
import { SandboxedVmRunner } from '@opentalon/skill-engine';

describe('Gateway - SSE Streaming Adapter', () => {
  let router: DualBrainRouter;
  let sseAdapter: SseStreamAdapter;

  beforeEach(async () => {
    const memory = new LibSqlMemoryAdapter({ url: ':memory:' });
    await memory.initialize();
    const sandbox = new SandboxedVmRunner();
    const mockLLM = new MockLLMDriver();
    mockLLM.mockResponse = {
      content: 'Streaming chunk response',
      tokensUsed: { promptTokens: 30, completionTokens: 10, totalTokens: 40 },
      model: 'stream-mock',
    };

    router = new DualBrainRouter({ memory, sandbox, llm: mockLLM });
    sseAdapter = new SseStreamAdapter(router);
  });

  it('streams response as text/event-stream with event messages', async () => {
    const req = new Request('https://edge.opentalon.dev/v1/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'Stream this message', sessionId: 'stream-sess-1' }),
    });

    const res = await sseAdapter.handleStreamRequest(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');

    const reader = res.body?.getReader();
    expect(reader).toBeDefined();

    const decoder = new TextDecoder();
    let accumulatedText = '';
    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;
      accumulatedText += decoder.decode(value);
    }

    expect(accumulatedText).toContain('event: start');
    expect(accumulatedText).toContain('event: token');
    expect(accumulatedText).toContain('event: stats');
    expect(accumulatedText).toContain('event: done');
  });
});
