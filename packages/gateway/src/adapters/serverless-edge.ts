import { DualBrainRouter } from '@opentalon/core';
import { type GatewayRequestPayload, type GatewayResponsePayload, type ServerlessEdgeConfig } from '../types.js';

export class ServerlessEdgeAdapter {
  private router: DualBrainRouter;
  private config: ServerlessEdgeConfig;

  constructor(router: DualBrainRouter, config: ServerlessEdgeConfig = {}) {
    this.router = router;
    this.config = config;
  }

  /**
   * Universal Web Standard Fetch handler for Cloudflare Workers / Edge Runtimes.
   */
  public async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Healthcheck endpoint
    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', runtime: 'edge-worker' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Optional API Key Verification
    if (this.config.expectedApiKey) {
      const headerName = this.config.apiKeyHeader ?? 'authorization';
      const authHeader = request.headers.get(headerName);
      const cleanKey = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : '';
      if (cleanKey !== this.config.expectedApiKey) {
        return new Response(JSON.stringify({ error: 'Unauthorized: Invalid API key' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    try {
      const body = (await request.json()) as GatewayRequestPayload;
      if (!body.input || typeof body.input !== 'string') {
        return new Response(JSON.stringify({ error: 'Invalid payload: "input" is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const sessionId = body.sessionId || `sess_${Date.now()}`;
      const result = await this.router.executeFastPath({
        sessionId,
        input: body.input,
        history: body.history,
      });

      const responsePayload: GatewayResponsePayload = {
        sessionId,
        output: result.output,
        latencyMs: result.latencyMs,
        tokensUsed: result.tokensUsed,
        retrievedSkills: result.retrievedSkills.map((s) => ({ id: s.id, name: s.name })),
      };

      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ error: `Internal Server Error: ${msg}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
}
