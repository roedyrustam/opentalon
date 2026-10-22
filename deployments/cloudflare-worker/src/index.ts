import { DualBrainRouter, GeminiDriver } from '@opentalon/core';
import { LibSqlMemoryAdapter } from '@opentalon/memory';
import { SandboxedVmRunner } from '@opentalon/skill-engine';
import { ServerlessEdgeAdapter, SseStreamAdapter } from '@opentalon/gateway';

export interface Env {
  GEMINI_API_KEY: string;
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  TALON_API_KEY?: string;
  TALON_MODEL?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Initialize libSQL remote edge adapter (e.g., Turso / remote libSQL) or in-memory
    const memory = new LibSqlMemoryAdapter({
      url: env.TURSO_DATABASE_URL || ':memory:',
      authToken: env.TURSO_AUTH_TOKEN,
    });

    const sandbox = new SandboxedVmRunner();
    const llm = new GeminiDriver({
      apiKey: env.GEMINI_API_KEY,
      primaryModel: env.TALON_MODEL || 'gemini-2.5-flash',
      fallbackModel: 'gemini-2.5-flash',
    });

    const router = new DualBrainRouter({
      memory,
      sandbox,
      llm,
      maxFastPathTokens: 1500,
    });

    // Route 1: SSE Streaming Endpoint
    if (url.pathname === '/v1/stream') {
      const sseAdapter = new SseStreamAdapter(router);
      return await sseAdapter.handleStreamRequest(request);
    }

    // Route 2: Standard JSON Serverless Endpoint
    const edgeAdapter = new ServerlessEdgeAdapter(router, {
      expectedApiKey: env.TALON_API_KEY,
    });

    return await edgeAdapter.handleRequest(request);
  },
};
