import { DualBrainRouter } from '@opentalon/core';
import { SecurityGate, type CapabilityGrant } from '@opentalon/skill-engine';
import { type GatewayRequestPayload, type GatewayResponsePayload, type ServerlessEdgeConfig } from '../types.js';
import {
  getPrivacyPolicyHtml,
  getTermsHtml,
  getDataDeletionHtml,
} from '../dashboard/legal-pages.js';
import { SlidingWindowRateLimiter } from '../security/rate-limiter.js';

export class ServerlessEdgeAdapter {
  private router: DualBrainRouter;
  private config: ServerlessEdgeConfig;
  private rateLimiter?: SlidingWindowRateLimiter;

  constructor(router: DualBrainRouter, config: ServerlessEdgeConfig = {}) {
    this.router = router;
    this.config = config;
    if (config.rateLimit) {
      this.rateLimiter = new SlidingWindowRateLimiter(config.rateLimit);
    }
  }

  private jsonResponse(
    payload: unknown,
    status: number,
    extraHeaders: Record<string, string> = {}
  ): Response {
    return new Response(JSON.stringify(payload), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
    });
  }

  private htmlResponse(
    html: string,
    status = 200,
    extraHeaders: Record<string, string> = {}
  ): Response {
    return new Response(html, {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        ...extraHeaders,
      },
    });
  }

  /**
   * Universal Web Standard Fetch handler for Cloudflare Workers / Edge Runtimes.
   */
  public async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Optional Sliding-Window Rate Limiting
    let rateLimitHeaders: Record<string, string> = {};
    if (this.rateLimiter) {
      const clientKey =
        request.headers.get('cf-connecting-ip') ||
        request.headers.get('x-forwarded-for') ||
        'anonymous';
      const rl = this.rateLimiter.check(clientKey);
      rateLimitHeaders = this.rateLimiter.toHeaders(rl);
      if (!rl.allowed) {
        return this.jsonResponse(
          {
            error: 'Too Many Requests: Rate limit exceeded',
            retryAfterSeconds: rl.retryAfterSeconds,
          },
          429,
          rateLimitHeaders
        );
      }
    }

    // Public GET Routes (before API key verification)
    if (request.method === 'GET') {
      if (url.pathname === '/health' || url.pathname === '/health/ready' || url.pathname === '/healthz') {
        return this.jsonResponse(
          { status: 'ok', runtime: 'edge-worker', version: '1.0.0' },
          200,
          rateLimitHeaders
        );
      }

      if (url.pathname === '/privacy' || url.pathname === '/privacy-policy') {
        return this.htmlResponse(getPrivacyPolicyHtml(), 200, rateLimitHeaders);
      }

      if (url.pathname === '/terms' || url.pathname === '/terms-and-conditions') {
        return this.htmlResponse(getTermsHtml(), 200, rateLimitHeaders);
      }

      if (url.pathname === '/delete-account' || url.pathname === '/data-deletion') {
        return this.htmlResponse(getDataDeletionHtml(), 200, rateLimitHeaders);
      }
    }

    // Optional API Key Verification
    if (this.config.expectedApiKey) {
      const headerName = this.config.apiKeyHeader ?? 'authorization';
      const authHeader = request.headers.get(headerName);
      const cleanKey = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : '';
      if (cleanKey !== this.config.expectedApiKey) {
        return this.jsonResponse(
          { error: 'Unauthorized: Invalid API key' },
          401,
          rateLimitHeaders
        );
      }
    }

    try {
      // Authenticated Edge API GET Routes
      if (request.method === 'GET') {
        if (url.pathname === '/api/security/report') {
          const skills = await this.router.getMemory().listSkills();
          const skillsAudit = skills.map((s) => ({
            name: s.name,
            version: s.version,
            ...SecurityGate.auditSkillCode(s.code, s.capabilities),
          }));
          const firewall = this.router.getFirewall().getStats();
          const recentEvents = this.router.getFirewall().getRecentEvents(30);
          return this.jsonResponse({ firewall, recentEvents, skillsAudit }, 200, rateLimitHeaders);
        }

        if (url.pathname === '/api/finops/report') {
          return this.jsonResponse(
            this.router.getFinOpsTracker().getReport(),
            200,
            rateLimitHeaders
          );
        }

        if (url.pathname === '/api/booster/stats') {
          return this.jsonResponse(this.router.getBoosterStats(), 200, rateLimitHeaders);
        }

        return this.jsonResponse({ error: 'Method not allowed' }, 405, rateLimitHeaders);
      }

      if (request.method !== 'POST') {
        return this.jsonResponse({ error: 'Method not allowed' }, 405, rateLimitHeaders);
      }

      // Authenticated Edge API POST Routes
      if (url.pathname === '/api/privacy/delete-data') {
        const rawBody = await request.text();
        const payload = (rawBody ? JSON.parse(rawBody) : {}) as { sessionId?: string };
        const targetSessionId = payload.sessionId || '*';
        const deleted = await this.router.getMemory().deleteSessionData(targetSessionId);
        return this.jsonResponse(
          {
            success: true,
            sessionId: targetSessionId,
            deletedTraces: deleted.deletedTraces,
            deletedFacts: deleted.deletedFacts,
            compliance: ['UU-PDP-No-27-2022', 'GDPR-Art-17'],
          },
          200,
          rateLimitHeaders
        );
      }

      if (url.pathname === '/api/security/audit') {
        const rawBody = await request.text();
        const payload = (rawBody ? JSON.parse(rawBody) : {}) as {
          prompt?: string;
          code?: string;
          capabilities?: CapabilityGrant;
          mode?: 'block' | 'sanitize' | 'audit';
        };
        const promptScan =
          typeof payload.prompt === 'string'
            ? this.router.getFirewall().scan(payload.prompt, payload.mode)
            : undefined;
        const codeAudit =
          typeof payload.code === 'string'
            ? SecurityGate.auditSkillCode(payload.code, payload.capabilities)
            : undefined;
        return this.jsonResponse({ promptScan, codeAudit }, 200, rateLimitHeaders);
      }

      // Default POST Fast Path Handler
      const body = (await request.json()) as GatewayRequestPayload;
      if (!body.input || typeof body.input !== 'string') {
        return this.jsonResponse(
          { error: 'Invalid payload: "input" is required' },
          400,
          rateLimitHeaders
        );
      }

      const sessionId = body.sessionId || `sess_${Date.now()}`;
      const result = await this.router.executeFastPath({
        sessionId,
        input: body.input,
        attachments: body.attachments,
        history: body.history,
        enableSearchGrounding: body.enableSearchGrounding,
        autoSaveGroundedFacts: body.autoSaveGroundedFacts,
        thinkingConfig: body.thinkingConfig,
      });

      const responsePayload: GatewayResponsePayload = {
        sessionId,
        output: result.output,
        latencyMs: result.latencyMs,
        tokensUsed: result.tokensUsed,
        retrievedSkills: result.retrievedSkills.map((s) => ({ id: s.id, name: s.name })),
        groundingMetadata: result.groundingMetadata,
        groundedFactsSaved: result.groundedFactsSaved,
        cachedContentUsed: result.cachedContentUsed,
        thinkingBudgetUsed: result.thinkingBudgetUsed,
        thinkingTier: result.thinkingTier,
        prefixHash: result.prefixHash,
        prefixHit: result.prefixHit,
        tokensSaved: result.tokensSaved,
      };

      return this.jsonResponse(responsePayload, 200, rateLimitHeaders);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return this.jsonResponse({ error: `Internal Server Error: ${msg}` }, 500, rateLimitHeaders);
    }
  }
}
