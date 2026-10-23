import { DualBrainRouter } from '@opentalon/core';
import { type GatewayRequestPayload } from '../types.js';

export class SseStreamAdapter {
  private router: DualBrainRouter;

  constructor(router: DualBrainRouter) {
    this.router = router;
  }

  /**
   * Handles an incoming request and returns a real-time Server-Sent Events (SSE) stream Response.
   */
  public async handleStreamRequest(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    let payload: GatewayRequestPayload;
    try {
      payload = (await request.json()) as GatewayRequestPayload;
    } catch {
      return new Response('Invalid JSON payload', { status: 400 });
    }

    if (!payload.input) {
      return new Response('Missing "input" field', { status: 400 });
    }

    const sessionId = payload.sessionId || `sse_${Date.now()}`;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start: async (controller) => {
        const sendEvent = (event: string, data: unknown) => {
          const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        try {
          sendEvent('start', { sessionId, timestamp: Date.now() });

          const result = await this.router.executeFastPath({
            sessionId,
            input: payload.input,
            attachments: payload.attachments,
            history: payload.history,
            enableSearchGrounding: payload.enableSearchGrounding,
            autoSaveGroundedFacts: payload.autoSaveGroundedFacts,
            thinkingConfig: payload.thinkingConfig,
          });

          // Stream Grounding Citations if present
          if (result.groundingMetadata) {
            sendEvent('grounding', {
              ...result.groundingMetadata,
              groundedFactsSaved: result.groundedFactsSaved ?? 0,
            });
          }

          // Stream Cache Hit or Canonical Prefix Hit event if present
          if (result.cachedContentUsed || result.prefixHit) {
            sendEvent('cache_hit', {
              cacheId: result.cachedContentUsed || `prefix_${(result.prefixHash || '').slice(0, 10)}`,
              explicitCache: Boolean(result.cachedContentUsed),
              prefixHit: Boolean(result.prefixHit),
              tokensSaved: result.tokensSaved ?? 0,
            });
          }

          // Stream Booster Thinking Telemetry
          sendEvent('booster', {
            thinkingBudgetUsed: result.thinkingBudgetUsed ?? 0,
            thinkingTier: result.thinkingTier ?? 'fast',
            prefixHash: result.prefixHash,
            prefixHit: Boolean(result.prefixHit),
            tokensSaved: result.tokensSaved ?? 0,
          });

          // Stream retrieved skills
          if (result.retrievedSkills.length > 0) {
            sendEvent('skills', {
              skills: result.retrievedSkills.map((s) => ({ id: s.id, name: s.name })),
            });
          }

          // Stream tool executions
          for (const tc of result.toolCallsMade) {
            sendEvent('tool_call', tc);
          }

          // Stream content chunks (simulating streaming token delivery)
          const words = result.output.split(/(\s+)/);
          for (const chunk of words) {
            sendEvent('token', { chunk });
          }

          // Stream final telemetry stats
          sendEvent('stats', {
            latencyMs: result.latencyMs,
            tokensUsed: result.tokensUsed,
            thinkingBudgetUsed: result.thinkingBudgetUsed ?? 0,
            thinkingTier: result.thinkingTier ?? 'fast',
            tokensSaved: result.tokensSaved ?? 0,
          });

          sendEvent('done', { ok: true });
          controller.close();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          sendEvent('error', { message: msg });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  }
}
