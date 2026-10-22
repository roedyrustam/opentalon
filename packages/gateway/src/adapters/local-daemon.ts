import http from 'node:http';
import { DualBrainRouter } from '@opentalon/core';
import { type GatewayRequestPayload, type GatewayResponsePayload } from '../types.js';
import { getDashboardHtml } from '../dashboard/html.js';
import { SseStreamAdapter } from './sse-stream.js';

export interface LocalDaemonOptions {
  port?: number;
  host?: string;
  enableDashboard?: boolean;
}

export class LocalDaemonAdapter {
  private router: DualBrainRouter;
  private server?: http.Server;
  private port: number;
  private host: string;
  private sseAdapter: SseStreamAdapter;

  constructor(router: DualBrainRouter, options: LocalDaemonOptions = {}) {
    this.router = router;
    this.port = options.port ?? 3100;
    this.host = options.host ?? '127.0.0.1';
    this.sseAdapter = new SseStreamAdapter(router);
  }

  public start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', `http://${this.host}:${this.port}`);

        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        // 1. Healthcheck
        if (req.method === 'GET' && url.pathname === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', daemon: 'local' }));
          return;
        }

        // 2. Embedded Dashboard UI
        if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/dashboard')) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(getDashboardHtml());
          return;
        }

        // 3. Telemetry Stats Endpoint
        if (req.method === 'GET' && url.pathname === '/api/stats') {
          try {
            const memory = this.router.getMemory();
            const skills = await memory.listSkills();
            const traces = await memory.getRecentTraces(100);
            const avgLatency =
              traces.length > 0
                ? traces.reduce((acc, t) => acc + t.latencyMs, 0) / traces.length
                : 0;

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                skillsCount: skills.length,
                tracesCount: traces.length,
                avgLatencyMs: Math.round(avgLatency),
              })
            );
          } catch (err: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // 4. Traces API
        if (req.method === 'GET' && url.pathname === '/api/traces') {
          try {
            const traces = await this.router.getMemory().getRecentTraces(50);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(traces));
          } catch (err: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // 5. Skills API
        if (req.method === 'GET' && url.pathname === '/api/skills') {
          try {
            const skills = await this.router.getMemory().listSkills();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(skills));
          } catch (err: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // 6. Test Skill in Sandbox API
        if (req.method === 'POST' && url.pathname === '/api/skills/test') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body) as { name: string; args?: Record<string, unknown> };
              const skill = await this.router.getMemory().getSkill(payload.name);
              if (!skill) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Skill "${payload.name}" not found` }));
                return;
              }

              const result = await this.router.getSandbox().execute({
                code: skill.code,
                args: payload.args ?? {},
                capabilities: skill.capabilities,
                timeoutMs: 5000,
              });

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(result));
            } catch (err: unknown) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        // 7. SSE Streaming endpoint
        if (req.method === 'POST' && url.pathname === '/v1/stream') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const standardReq = new Request(`http://${this.host}:${this.port}/v1/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
              });

              const response = await this.sseAdapter.handleStreamRequest(standardReq);
              res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
              });

              const reader = response.body?.getReader();
              if (reader) {
                const decoder = new TextDecoder();
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  res.write(decoder.decode(value));
                }
              }
              res.end();
            } catch (err: unknown) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        // 8. Standard Chat Turn endpoint
        if (req.method === 'POST' && url.pathname === '/v1/chat') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });

          req.on('end', async () => {
            try {
              const payload = JSON.parse(body) as GatewayRequestPayload;
              if (!payload.input) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing "input" in request body' }));
                return;
              }

              const sessionId = payload.sessionId || `local_sess_${Date.now()}`;
              const result = await this.router.executeFastPath({
                sessionId,
                input: payload.input,
                history: payload.history,
              });

              const responsePayload: GatewayResponsePayload = {
                sessionId,
                output: result.output,
                latencyMs: result.latencyMs,
                tokensUsed: result.tokensUsed,
                retrievedSkills: result.retrievedSkills.map((s) => ({ id: s.id, name: s.name })),
              };

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(responsePayload));
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: msg }));
            }
          });
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      });

      this.server.on('error', (err) => reject(err));
      this.server.listen(this.port, this.host, () => {
        resolve(this.port);
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
