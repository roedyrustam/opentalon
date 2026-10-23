import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  DualBrainRouter,
  McpServer,
  McpClientAdapter,
  McpToolBridge,
  SwarmDirector,
  CronScheduler,
  AgentIdentityManager,
  type AgentCard,
  type SignedHeaders,
  type A2ANegotiateRequest,
  type A2ANegotiateResponse,
  type A2ADispatchRequest,
  type A2ADispatchResponse,
} from '@opentalon/core';
import { type FederatedPeer } from '@opentalon/memory';
import { type GatewayRequestPayload, type GatewayResponsePayload } from '../types.js';
import { getDashboardHtml } from '../dashboard/html.js';
import { SseStreamAdapter } from './sse-stream.js';
import { RemoteSkillInstaller } from '@opentalon/skill-engine';

export interface LocalDaemonOptions {
  port?: number;
  host?: string;
  enableDashboard?: boolean;
  scheduler?: CronScheduler;
  webhookSecret?: string;
}

export class LocalDaemonAdapter {
  private router: DualBrainRouter;
  private server?: http.Server;
  private port: number;
  private host: string;
  private sseAdapter: SseStreamAdapter;
  private mcpServer: McpServer;
  private swarmDirector: SwarmDirector;
  private scheduler: CronScheduler;
  private webhookSecret?: string;
  private identityManager: AgentIdentityManager;

  constructor(router: DualBrainRouter, options: LocalDaemonOptions = {}) {
    this.router = router;
    this.port = options.port ?? 3100;
    this.host = options.host ?? '127.0.0.1';
    this.sseAdapter = new SseStreamAdapter(router);
    this.mcpServer = new McpServer(router.getMemory(), router.getSandbox());
    this.swarmDirector = new SwarmDirector(router.getLLM());
    this.webhookSecret = options.webhookSecret ?? process.env.TALON_WEBHOOK_SECRET;
    this.identityManager = new AgentIdentityManager(router.getMemory());

    this.scheduler =
      options.scheduler ||
      new CronScheduler({
        memory: router.getMemory(),
        router,
        sandbox: router.getSandbox(),
        onNotification: (evt) => {
          this.router.emit('cron:notification', evt);
        },
      });
  }

  public getScheduler(): CronScheduler {
    return this.scheduler;
  }

  public getIdentityManager(): AgentIdentityManager {
    return this.identityManager;
  }

  public start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', `http://${this.host}:${this.port}`);

        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, DELETE');
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, X-Talon-Signature, X-Talon-Agent-Id, X-Talon-Public-Key, X-Talon-Timestamp, X-Talon-Nonce'
        );

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

        // 2b. 3D Logo & Holographic Core Showcase
        if (req.method === 'GET' && (url.pathname === '/showcase' || url.pathname === '/3d')) {
          const showcaseCandidates = [
            path.resolve(process.cwd(), 'assets', '3d-logo-showcase.html'),
            path.resolve(process.cwd(), '..', '..', 'assets', '3d-logo-showcase.html'),
          ];
          const foundPath = showcaseCandidates.find((p) => fs.existsSync(p));
          if (foundPath) {
            const html = fs.readFileSync(foundPath, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
            return;
          }
        }

        // 3. Telemetry Stats Endpoint
        if (req.method === 'GET' && url.pathname === '/api/stats') {
          try {
            const memory = this.router.getMemory();
            const skills = await memory.listSkills();
            const traces = await memory.getRecentTraces(100);
            const facts = await memory.listFacts({ limit: 1000 });
            const avgLatency =
              traces.length > 0
                ? traces.reduce((acc, t) => acc + t.latencyMs, 0) / traces.length
                : 0;
            const booster = this.router.getBoosterStats();

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                skillsCount: skills.length,
                tracesCount: traces.length,
                factsCount: facts.length,
                avgLatencyMs: Math.round(avgLatency),
                booster,
              })
            );
          } catch (err: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // 3b. Gemini Agent Booster & KV-Cache Stats Endpoint
        if (req.method === 'GET' && url.pathname === '/api/booster/stats') {
          try {
            const booster = this.router.getBoosterStats();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(booster));
          } catch (err: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // 3c. Sovereign FinOps Cost Envelope & Token Ledger Endpoint
        if (req.method === 'GET' && url.pathname === '/api/finops/report') {
          try {
            const report = this.router.getFinOpsTracker().getReport();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(report));
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

        // 5a-1. Register / Synthesize Skill API
        if (req.method === 'POST' && url.pathname === '/api/skills') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body) as { markdown?: string; skill?: any };
              if (payload.markdown) {
                const skill = await this.router.synthesizeAndRegisterSkill(payload.markdown);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, skill }));
                return;
              }
              if (payload.skill) {
                await this.router.getMemory().saveSkill(payload.skill);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, skill: payload.skill }));
                return;
              }
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing "markdown" or "skill" in request body' }));
            } catch (err: unknown) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        // 5a-2. Delete Skill API
        if (req.method === 'DELETE' && url.pathname === '/api/skills') {
          try {
            let id = url.searchParams.get('id');
            const name = url.searchParams.get('name');
            if (!id && name) {
              const skill = await this.router.getMemory().getSkill(name);
              id = skill?.id ?? null;
            }
            if (!id) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing "id" or "name" query parameter' }));
              return;
            }
            const deleted = await this.router.getMemory().deleteSkill(id);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: deleted, id }));
          } catch (err: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // 5a-3. Skill Revision History API
        if (req.method === 'GET' && url.pathname === '/api/skills/history') {
          try {
            const name = url.searchParams.get('name');
            if (!name) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing "name" query parameter' }));
              return;
            }
            const revisions = await this.router.getMemory().getSkillRevisions(name);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(revisions));
          } catch (err: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // 5a-4. Skill Rollback API
        if (req.method === 'POST' && url.pathname === '/api/skills/rollback') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body) as { name: string; target: string };
              if (!payload.name || !payload.target) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing "name" or "target" in request body' }));
                return;
              }
              const restoredSkill = await this.router.getMemory().rollbackSkill(payload.name, payload.target);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, restoredSkill }));
            } catch (err: unknown) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        // 5a-5. Remote Skill Install API
        if (req.method === 'POST' && url.pathname === '/api/skills/install') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body) as { url: string; overwrite?: boolean; force?: boolean };
              if (!payload.url) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing "url" in request body' }));
                return;
              }
              const installResult = await RemoteSkillInstaller.install(
                payload.url,
                this.router.getMemory(),
                undefined,
                { overwrite: payload.overwrite, force: payload.force }
              );
              const statusCode = installResult.success ? 200 : 400;
              res.writeHead(statusCode, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(installResult));
            } catch (err: unknown) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
            }
          });
          return;
        }

        // 5b. Semantic Facts API
        if (req.method === 'GET' && url.pathname === '/api/facts') {
          try {
            const category = url.searchParams.get('category') || undefined;
            const facts = await this.router.getMemory().listFacts({ category });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(facts));
          } catch (err: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // 5c. Save Semantic Fact API
        if (req.method === 'POST' && url.pathname === '/api/facts') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body) as {
                id?: string;
                category: string;
                key: string;
                value: string;
                confidence?: number;
              };
              const factId = payload.id || `fact_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
              const fact = {
                id: factId,
                category: payload.category,
                key: payload.key,
                value: payload.value,
                confidence: payload.confidence ?? 1.0,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              };
              await this.router.getMemory().saveFact(fact);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(fact));
            } catch (err: unknown) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        // 5d. Delete Semantic Fact API
        if (req.method === 'DELETE' && url.pathname === '/api/facts') {
          try {
            const id = url.searchParams.get('id');
            if (!id) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing "id" query parameter' }));
              return;
            }
            const deleted = await this.router.getMemory().deleteFact(id);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: deleted, id }));
          } catch (err: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // 5e. Search Semantic Facts API
        if (req.method === 'GET' && url.pathname === '/api/facts/search') {
          try {
            const q = url.searchParams.get('q') || '';
            const category = url.searchParams.get('category') || undefined;
            const results = await this.router.getMemory().searchFacts(q, { category });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(results));
          } catch (err: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // 5f. Export Memory Snapshot API
        if (req.method === 'GET' && url.pathname === '/api/memory/export') {
          try {
            const includeTraces = url.searchParams.get('includeTraces') === 'true';
            const snapshot = await this.router.getMemory().exportSnapshot({ includeTraces });
            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Content-Disposition': `attachment; filename="opentalon-memory-${Date.now()}.json"`,
            });
            res.end(JSON.stringify(snapshot, null, 2));
          } catch (err: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // 5g. Import Memory Snapshot API
        if (req.method === 'POST' && url.pathname === '/api/memory/import') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const snapshot = JSON.parse(body);
              const result = await this.router.getMemory().importSnapshot(snapshot, { overwrite: true });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(result));
            } catch (err: unknown) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
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
                attachments: payload.attachments,
                history: payload.history,
                enableSearchGrounding: payload.enableSearchGrounding,
                autoSaveGroundedFacts: payload.autoSaveGroundedFacts,
                thinkingConfig: payload.thinkingConfig,
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

        // 9. MCP Tools list endpoint
        if (req.method === 'GET' && url.pathname === '/api/mcp/tools') {
          try {
            const resRpc = await this.mcpServer.handleMessage({
              jsonrpc: '2.0',
              id: 1,
              method: 'tools/list',
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(resRpc.result));
          } catch (err: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // 10. MCP JSON-RPC Dispatch endpoint
        if (req.method === 'POST' && url.pathname === '/api/mcp/rpc') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const rpcReq = JSON.parse(body);
              const rpcRes = await this.mcpServer.handleMessage(rpcReq);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(rpcRes));
            } catch (err: unknown) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        // 11. MCP Tool Import endpoint
        if (req.method === 'POST' && url.pathname === '/api/mcp/import') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body) as { url: string; prefix?: string; allowedHosts?: string[] };
              const client = new McpClientAdapter({
                name: 'remote-importer',
                transport: 'http',
                url: payload.url,
              });
              const report = await McpToolBridge.importMcpTools(client, this.router.getMemory(), {
                prefix: payload.prefix ?? 'mcp',
                allowedHosts: payload.allowedHosts ?? [],
              });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(report));
            } catch (err: unknown) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        // 12. Swarm Multi-Agent Execution endpoint
        if (req.method === 'POST' && url.pathname === '/api/swarm/execute') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body) as {
                topology: 'fan_out_fan_in' | 'pipeline_saga' | 'critic_validator_loop';
                task: string;
                agents?: Array<{ id: string; role: string; systemInstruction: string }>;
                criticConfig?: { maxRetries?: number };
              };

              let agents = payload.agents;
              if (!agents || agents.length === 0) {
                if (payload.topology === 'fan_out_fan_in') {
                  agents = [
                    { id: 'architect', role: 'System Architect', systemInstruction: 'You are the System Architect. Provide architectural foundations.' },
                    { id: 'security', role: 'Security Sentinel', systemInstruction: 'You are the Security Sentinel. Audit threat models and validation gates.' },
                    { id: 'craftsman', role: 'Fullstack Craftsman', systemInstruction: 'You are the Fullstack Craftsman. Provide concrete implementation.' },
                  ];
                } else if (payload.topology === 'pipeline_saga') {
                  agents = [
                    { id: 'stage-1', role: 'Discovery & Requirements', systemInstruction: 'Extract PRD and domain entities.' },
                    { id: 'stage-2', role: 'API & Contract Design', systemInstruction: 'Design OpenAPI and type contracts.' },
                    { id: 'stage-3', role: 'Implementation & Verification', systemInstruction: 'Write production code.' },
                  ];
                } else {
                  agents = [
                    { id: 'implementer', role: 'Implementer Agent', systemInstruction: 'You are the Implementer Agent. Write complete code.' },
                    { id: 'critic', role: 'Strict Quality Critic', systemInstruction: 'You are the Strict Quality Critic. Reject any flaw.' },
                  ];
                }
              }

              const result = await this.swarmDirector.executeSwarm({
                topology: payload.topology,
                task: payload.task,
                agents,
                criticConfig: payload.criticConfig,
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

        // 13. Slow Path Evolution Trigger API
        if (req.method === 'POST' && url.pathname === '/api/evolution/run') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const payload = body ? JSON.parse(body) : {};
              const limit = typeof payload.limit === 'number' ? payload.limit : 50;
              const dryRun = Boolean(payload.dryRun);
              const speculativeDraftCount =
                typeof payload.speculativeDraftCount === 'number'
                  ? payload.speculativeDraftCount
                  : undefined;
              const report = await this.router.getEvolutionEngine().runEvolutionCycle({
                traceLimit: limit,
                dryRun,
                speculativeDraftCount,
              });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(report));
            } catch (err: unknown) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        // 14. Slow Path Evolution Status API
        if (req.method === 'GET' && url.pathname === '/api/evolution/status') {
          try {
            const engine = this.router.getEvolutionEngine();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                isEvolving: this.router.getIsEvolving(),
                queueLength: this.router.getTraceQueueLength(),
                synthesesPastHour: engine.getSynthesesInPastHour(),
              })
            );
          } catch (err: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // 15. Server-Sent Events (SSE) Live Router Event Bus
        if (req.method === 'GET' && url.pathname === '/api/events') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
          });

          const sendSSE = (event: string, data: unknown) => {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
          };

          sendSSE('connected', { timestamp: Date.now() });

          const onTrace = (trace: any) =>
            sendSSE('trace', { id: trace.id, input: trace.input, latencyMs: trace.latencyMs });
          const onSlowStarted = (data: any) => sendSSE('evolution_started', data);
          const onSlowCompleted = (report: any) => sendSSE('evolution_completed', report);
          const onSlowError = (err: any) => sendSSE('evolution_error', { message: String(err) });
          const onSkill = (skill: any) =>
            sendSSE('skill_registered', { name: skill.name, version: skill.version });
          const onCronNotification = (evt: any) =>
            sendSSE('cron_notification', evt);

          this.router.on('trace:emitted', onTrace);
          this.router.on('slowpath:started', onSlowStarted);
          this.router.on('slowpath:completed', onSlowCompleted);
          this.router.on('slowpath:error', onSlowError);
          this.router.on('skill:registered', onSkill);
          this.router.on('cron:notification', onCronNotification);

          req.on('close', () => {
            this.router.off('trace:emitted', onTrace);
            this.router.off('slowpath:started', onSlowStarted);
            this.router.off('slowpath:completed', onSlowCompleted);
            this.router.off('slowpath:error', onSlowError);
            this.router.off('skill:registered', onSkill);
            this.router.off('cron:notification', onCronNotification);
          });
          return;
        }

        // 16. Cron Jobs API: List All Jobs
        if (req.method === 'GET' && url.pathname === '/api/cron/jobs') {
          try {
            const jobs = await this.scheduler.getJobs();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(jobs));
          } catch (err: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // 17. Cron Jobs API: Register New Job
        if (req.method === 'POST' && url.pathname === '/api/cron/jobs') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body);
              if (!payload.name || !payload.cron || !payload.actionType) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing name, cron, or actionType' }));
                return;
              }
              const job = await this.scheduler.registerJob(payload);
              res.writeHead(201, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(job));
            } catch (err: unknown) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        // 18. Cron Jobs API: Trigger Job Immediately
        const triggerMatch = url.pathname.match(/^\/api\/cron\/jobs\/([^/]+)\/trigger$/);
        if (req.method === 'POST' && triggerMatch) {
          const jobId = decodeURIComponent(triggerMatch[1]);
          try {
            const log = await this.scheduler.triggerJob(jobId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(log));
          } catch (err: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // 19. Cron Jobs API: Toggle Pause / Resume
        const toggleMatch = url.pathname.match(/^\/api\/cron\/jobs\/([^/]+)\/toggle$/);
        if (req.method === 'POST' && toggleMatch) {
          const jobId = decodeURIComponent(toggleMatch[1]);
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const parsed = body ? JSON.parse(body) : {};
              const job = await this.scheduler.toggleJob(jobId, parsed.active);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(job));
            } catch (err: unknown) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        // 20. Cron Jobs API: Delete Job
        const deleteMatch = url.pathname.match(/^\/api\/cron\/jobs\/([^/]+)$/);
        if (req.method === 'DELETE' && deleteMatch) {
          const jobId = decodeURIComponent(deleteMatch[1]);
          try {
            const deleted = await this.scheduler.deleteJob(jobId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: deleted }));
          } catch (err: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // 21. Cron Jobs API: Execution Logs
        if (req.method === 'GET' && url.pathname === '/api/cron/logs') {
          try {
            const jobId = url.searchParams.get('jobId') || undefined;
            const limit = parseInt(url.searchParams.get('limit') || '50', 10);
            const logs = await this.scheduler.getLogs(jobId, limit);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(logs));
          } catch (err: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // 22. Inbound Webhook Ingress
        const webhookMatch = url.pathname.match(/^\/api\/webhooks\/([^/]+)$/);
        if (req.method === 'POST' && webhookMatch) {
          const webhookName = decodeURIComponent(webhookMatch[1]);
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              // HMAC SHA-256 signature verification if secret is configured
              if (this.webhookSecret) {
                const signatureHeader =
                  req.headers['x-talon-signature'] || req.headers['x-hub-signature-256'];
                if (!signatureHeader) {
                  res.writeHead(401, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Missing X-Talon-Signature header' }));
                  return;
                }
                const hmac = crypto.createHmac('sha256', this.webhookSecret);
                hmac.update(body);
                const expectedSignature = hmac.digest('hex');
                const cleanSignature = String(signatureHeader).replace(/^sha256=/, '');
                if (cleanSignature !== expectedSignature) {
                  res.writeHead(401, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Invalid webhook signature' }));
                  return;
                }
              }

              let payload: Record<string, unknown> = {};
              try {
                payload = JSON.parse(body);
              } catch {
                payload = { raw: body };
              }

              // Check if a registered job matches webhook-${name} or ${name}
              const matchingJob =
                (await this.router.getMemory().getJob(`webhook-${webhookName}`)) ||
                (await this.router.getMemory().getJob(webhookName));

              if (matchingJob) {
                const log = await this.scheduler.triggerJob(matchingJob.id);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, triggeredJob: matchingJob.name, log }));
                return;
              }

              // Otherwise execute ad-hoc skill if specified in payload
              const startTime = Date.now();
              if (payload.actionType === 'skill' && typeof payload.skillName === 'string') {
                const skill = await this.router.getMemory().getSkill(payload.skillName);
                if (!skill) {
                  res.writeHead(404, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: `Skill "${payload.skillName}" not found` }));
                  return;
                }
                const sandboxed = await this.router.getSandbox().execute({
                  code: skill.code,
                  args: (payload.args as Record<string, unknown>) || payload,
                  capabilities: skill.capabilities,
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(
                  JSON.stringify({
                    success: sandboxed.success,
                    result: sandboxed.data ?? sandboxed.error,
                  })
                );
                return;
              }

              // Default: Execute fast path prompt with webhook event context
              const prompt =
                typeof payload.prompt === 'string'
                  ? payload.prompt
                  : `Webhook event "${webhookName}" received with payload: ${JSON.stringify(
                      payload
                    )}. Process and summarize.`;

              const result = await this.router.executeFastPath({
                sessionId: `webhook_${webhookName}_${Date.now()}`,
                input: prompt,
              });

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  success: true,
                  event: webhookName,
                  output: result.output,
                  latencyMs: Date.now() - startTime,
                  tokensUsed: result.tokensUsed,
                })
              );
            } catch (err: unknown) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        // 23. A2A Agent Card Standard Endpoint
        if (
          req.method === 'GET' &&
          (url.pathname === '/.well-known/agent.json' || url.pathname === '/api/a2a/card')
        ) {
          try {
            const identity = await this.identityManager.getOrCreateIdentity();
            const skills = await this.router.getMemory().listSkills();
            const baseUrl = `http://${this.host}:${this.port}`;
            const card: AgentCard = {
              urn: identity.id,
              name: identity.name,
              version: '0.6.0',
              publicKey: identity.publicKey,
              endpoints: {
                base: baseUrl,
                agentCard: `${baseUrl}/.well-known/agent.json`,
                negotiate: `${baseUrl}/api/a2a/negotiate`,
                dispatch: `${baseUrl}/api/a2a/dispatch`,
              },
              skills: skills.map((s) => ({
                name: s.name,
                description: s.description,
                version: s.version,
                capabilities: (s.capabilities as Record<string, unknown>) || {},
              })),
              activeModel: this.router.getLLM().constructor.name,
              status: 'online',
              uptimeSeconds: Math.round(process.uptime()),
            };

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(card, null, 2));
          } catch (err: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // 24. A2A Peers Mesh Registry: List Peers
        if (req.method === 'GET' && url.pathname === '/api/a2a/peers') {
          try {
            const status = (url.searchParams.get('status') as
              | 'online'
              | 'offline'
              | 'unreachable') || undefined;
            const peers = await this.router.getMemory().listFederatedPeers({ status });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(peers));
          } catch (err: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // 25. A2A Peers Mesh Registry: Register Peer
        if (req.method === 'POST' && url.pathname === '/api/a2a/peers/register') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body) as {
                endpointUrl?: string;
                peerId?: string;
                name?: string;
                publicKey?: string;
                capabilities?: string[];
              };

              if (!payload.endpointUrl) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing endpointUrl in request payload' }));
                return;
              }

              let peerToSave: FederatedPeer;

              // If full details provided directly
              if (payload.peerId && payload.publicKey) {
                peerToSave = {
                  peerId: payload.peerId,
                  name: payload.name || 'Remote OpenTalon Peer',
                  endpointUrl: payload.endpointUrl,
                  publicKey: payload.publicKey,
                  capabilities: payload.capabilities || [],
                  status: 'online',
                  lastSeenAt: Date.now(),
                };
              } else {
                // Discover automatically via /.well-known/agent.json
                const cardUrl = payload.endpointUrl.replace(/\/$/, '') + '/.well-known/agent.json';
                const startTime = Date.now();
                const cardRes = await fetch(cardUrl, { signal: AbortSignal.timeout(5000) });
                if (!cardRes.ok) {
                  throw new Error(`Failed to fetch Agent Card from ${cardUrl}: HTTP ${cardRes.status}`);
                }
                const card = (await cardRes.json()) as AgentCard;
                const latencyMs = Date.now() - startTime;

                peerToSave = {
                  peerId: card.urn,
                  name: card.name,
                  endpointUrl: payload.endpointUrl,
                  publicKey: card.publicKey,
                  capabilities: card.skills.map((s) => s.name),
                  status: 'online',
                  latencyMs,
                  lastSeenAt: Date.now(),
                };
              }

              await this.router.getMemory().saveFederatedPeer(peerToSave);
              res.writeHead(201, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(peerToSave));
            } catch (err: unknown) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        // 26. A2A Peers Mesh Registry: Delete Peer
        const peerDeleteMatch = url.pathname.match(/^\/api\/a2a\/peers\/([^/]+)$/);
        if (req.method === 'DELETE' && peerDeleteMatch) {
          const peerId = decodeURIComponent(peerDeleteMatch[1]);
          try {
            const deleted = await this.router.getMemory().deleteFederatedPeer(peerId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: deleted }));
          } catch (err: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // 27. A2A Ping Endpoint
        if (req.method === 'POST' && url.pathname === '/api/a2a/ping') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body || '{}') as {
                peerId?: string;
                endpointUrl?: string;
              };
              const peer = await this.router
                .getMemory()
                .getFederatedPeer(payload.peerId || payload.endpointUrl || '');
              if (!peer) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Peer not found in registry' }));
                return;
              }

              const targetUrl = peer.endpointUrl.replace(/\/$/, '') + '/healthz';
              const startTime = Date.now();
              try {
                const pingRes = await fetch(targetUrl, { signal: AbortSignal.timeout(4000) });
                const latency = Date.now() - startTime;
                const status = pingRes.ok ? 'online' : 'unreachable';
                await this.router.getMemory().updatePeerStatus(peer.peerId, status, latency);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ peerId: peer.peerId, status, latencyMs: latency }));
              } catch {
                await this.router.getMemory().updatePeerStatus(peer.peerId, 'offline');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ peerId: peer.peerId, status: 'offline' }));
              }
            } catch (err: unknown) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        // 28. A2A Task Negotiation (0-Token Gate)
        if (req.method === 'POST' && url.pathname === '/api/a2a/negotiate') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            const startTime = Date.now();
            try {
              const payload = JSON.parse(body) as A2ANegotiateRequest;

              // Check signature if signature headers are provided
              const signature = req.headers['x-talon-signature'];
              if (signature) {
                const signedHeaders: SignedHeaders = {
                  agentId: String(req.headers['x-talon-agent-id'] || ''),
                  publicKey: String(req.headers['x-talon-public-key'] || ''),
                  signature: String(signature),
                  timestamp: Number(req.headers['x-talon-timestamp'] || 0),
                  nonce: String(req.headers['x-talon-nonce'] || ''),
                };
                const v = this.identityManager.verifyRequestSignature(payload, signedHeaders);
                if (!v.valid) {
                  res.writeHead(401, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: v.error }));
                  return;
                }
              }

              // Check skills capability match in memory
              const identity = await this.identityManager.getOrCreateIdentity();
              const availableSkillsList = await this.router.getMemory().listSkills();
              const availableNames = new Set(availableSkillsList.map((s) => s.name));

              const required = payload.requiredSkills || [];
              const matchedSkills = required.filter((name) => availableNames.has(name));
              const canHandle = required.length === 0 || matchedSkills.length === required.length;

              const response: A2ANegotiateResponse = {
                canHandle,
                reason: canHandle
                  ? undefined
                  : `Missing required skill(s): ${required.filter((n) => !availableNames.has(n)).join(', ')}`,
                availableSkills: Array.from(availableNames),
                assignedPeerId: identity.id,
                estimatedLatencyMs: 150,
              };

              // Audit log
              await this.router.getMemory().saveA2AAuditLog({
                id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                traceId: payload.taskId || `trace_${Date.now()}`,
                peerId: payload.senderAgentId || 'anonymous',
                direction: 'inbound',
                action: 'negotiate',
                status: canHandle ? 'accepted' : 'rejected',
                payload: payload as unknown as Record<string, unknown>,
                result: response as unknown as Record<string, unknown>,
                durationMs: Date.now() - startTime,
                timestamp: Date.now(),
              });

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(response));
            } catch (err: unknown) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        // 29. A2A Task Dispatch & Execution
        if (req.method === 'POST' && url.pathname === '/api/a2a/dispatch') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            const startTime = Date.now();
            try {
              const payload = JSON.parse(body) as A2ADispatchRequest;

              // Check circular delegation depth limit
              if (payload.delegationDepth && payload.delegationDepth > 3) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(
                  JSON.stringify({
                    error: `ERR_MAX_DELEGATION_DEPTH: Delegation depth ${payload.delegationDepth} exceeded limit of 3`,
                  })
                );
                return;
              }

              // Check signature if signature headers are provided
              const signature = req.headers['x-talon-signature'];
              if (signature) {
                const signedHeaders: SignedHeaders = {
                  agentId: String(req.headers['x-talon-agent-id'] || ''),
                  publicKey: String(req.headers['x-talon-public-key'] || ''),
                  signature: String(signature),
                  timestamp: Number(req.headers['x-talon-timestamp'] || 0),
                  nonce: String(req.headers['x-talon-nonce'] || ''),
                };
                const v = this.identityManager.verifyRequestSignature(payload, signedHeaders);
                if (!v.valid) {
                  res.writeHead(401, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: v.error }));
                  return;
                }
              }

              const identity = await this.identityManager.getOrCreateIdentity();

              // Execute through Fast Path
              const result = await this.router.executeFastPath({
                sessionId: `a2a_${payload.taskId || Date.now()}`,
                input: payload.task,
                skillsFilter: payload.skillsFilter,
              });

              const response: A2ADispatchResponse = {
                taskId: payload.taskId,
                senderAgentId: payload.senderAgentId || 'anonymous',
                executorPeerId: identity.id,
                success: true,
                output: result.output,
                tokensUsed: result.tokensUsed,
                durationMs: Date.now() - startTime,
              };

              // Audit log
              await this.router.getMemory().saveA2AAuditLog({
                id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                traceId: payload.taskId || `trace_${Date.now()}`,
                peerId: payload.senderAgentId || 'anonymous',
                direction: 'inbound',
                action: 'dispatch',
                status: 'completed',
                payload: payload as unknown as Record<string, unknown>,
                result: response as unknown as Record<string, unknown>,
                durationMs: Date.now() - startTime,
                timestamp: Date.now(),
              });

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(response));
            } catch (err: unknown) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        // 30. A2A Audit Logs API
        if (req.method === 'GET' && url.pathname === '/api/a2a/logs') {
          try {
            const peerId = url.searchParams.get('peerId') || undefined;
            const limit = parseInt(url.searchParams.get('limit') || '50', 10);
            const logs = await this.router.getMemory().getA2AAuditLogs({ peerId, limit });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(logs));
          } catch (err: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      });

      this.server.on('error', (err) => reject(err));
      this.server.listen(this.port, this.host, () => {
        const addr = this.server?.address();
        if (addr && typeof addr === 'object' && addr.port) {
          this.port = addr.port;
        }
        this.scheduler.start();
        resolve(this.port);
      });
    });
  }

  public stop(): Promise<void> {
    this.scheduler.stop();
    return new Promise((resolve) => {
      if (this.server) {
        if (typeof this.server.closeAllConnections === 'function') {
          this.server.closeAllConnections();
        }
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
