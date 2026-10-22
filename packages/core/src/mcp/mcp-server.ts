import readline from 'node:readline';
import { type IMemoryPort } from '@opentalon/memory';
import { type ISkillSandbox } from '@opentalon/skill-engine';
import { type JsonRpcRequest, type JsonRpcResponse, type McpTool, type McpResource } from './types.js';

export class McpServer {
  private memory: IMemoryPort;
  private sandbox: ISkillSandbox;
  private serverInfo = {
    name: 'opentalon-mcp-server',
    version: '0.1.0',
  };

  constructor(memory: IMemoryPort, sandbox: ISkillSandbox) {
    this.memory = memory;
    this.sandbox = sandbox;
  }

  /**
   * Dispatches an incoming JSON-RPC 2.0 request and produces a compliant response.
   */
  public async handleMessage(req: JsonRpcRequest): Promise<JsonRpcResponse> {
    const id = req.id ?? null;

    try {
      switch (req.method) {
        case 'initialize': {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: { listChanged: false },
                resources: { subscribe: false, listChanged: false },
                prompts: { listChanged: false },
              },
              serverInfo: this.serverInfo,
            },
          };
        }

        case 'notifications/initialized': {
          return { jsonrpc: '2.0', id, result: {} };
        }

        case 'ping': {
          return { jsonrpc: '2.0', id, result: {} };
        }

        case 'tools/list': {
          const skills = await this.memory.listSkills();
          const tools: McpTool[] = skills.map((skill) => ({
            name: skill.name,
            description: `${skill.description} [Capabilities: ${JSON.stringify(skill.capabilities)}]`,
            inputSchema: {
              type: 'object',
              properties: {
                args: {
                  type: 'object',
                  description: 'Dynamic arguments for procedural skill',
                },
              },
            },
          }));

          return {
            jsonrpc: '2.0',
            id,
            result: { tools },
          };
        }

        case 'tools/call': {
          const params = req.params as { name?: string; arguments?: Record<string, unknown> };
          if (!params || !params.name) {
            return this.buildError(id, -32602, 'Missing "name" parameter in tools/call');
          }

          const skill = await this.memory.getSkill(params.name);
          if (!skill) {
            return this.buildError(id, -32601, `Skill "${params.name}" not found in memory`);
          }

          const callStart = Date.now();
          const rawArgs = params.arguments?.args || params.arguments || {};
          const execution = await this.sandbox.execute({
            code: skill.code,
            args: rawArgs as Record<string, unknown>,
            capabilities: skill.capabilities,
            timeoutMs: 5000,
          });

          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: execution.success
                    ? JSON.stringify(execution.data, null, 2)
                    : `Error: ${execution.error}`,
                },
              ],
              isError: !execution.success,
              metadata: {
                durationMs: Date.now() - callStart,
                logs: execution.logs,
              },
            },
          };
        }

        case 'resources/list': {
          const recentTraces = await this.memory.getRecentTraces(20);
          const resources: McpResource[] = recentTraces.map((t) => ({
            uri: `opentalon://traces/${t.id}`,
            name: `Episodic Trace ${t.id}`,
            description: `Session: ${t.sessionId} | Input: "${t.input.slice(0, 40)}"`,
            mimeType: 'application/json',
          }));

          return {
            jsonrpc: '2.0',
            id,
            result: { resources },
          };
        }

        case 'resources/read': {
          const params = req.params as { uri?: string };
          if (!params || !params.uri) {
            return this.buildError(id, -32602, 'Missing "uri" in resources/read');
          }

          const match = params.uri.match(/^opentalon:\/\/traces\/(.+)$/);
          if (!match) {
            return this.buildError(id, -32602, `Invalid resource URI: "${params.uri}"`);
          }

          const traceId = match[1];
          const traces = await this.memory.getRecentTraces(100);
          const found = traces.find((t) => t.id === traceId);

          if (!found) {
            return this.buildError(id, -32602, `Trace "${traceId}" not found`);
          }

          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [
                {
                  uri: params.uri,
                  mimeType: 'application/json',
                  text: JSON.stringify(found, null, 2),
                },
              ],
            },
          };
        }

        default:
          return this.buildError(id, -32601, `Method "${req.method}" not found`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return this.buildError(id, -32603, `Internal JSON-RPC Error: ${msg}`);
    }
  }

  /**
   * Starts Stdio JSON-RPC transport for connecting directly to Claude Desktop / Cursor / Antigravity.
   */
  public startStdio(): void {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    rl.on('line', async (line) => {
      if (!line.trim()) return;
      try {
        const req = JSON.parse(line) as JsonRpcRequest;
        const res = await this.handleMessage(req);
        process.stdout.write(JSON.stringify(res) + '\n');
      } catch (err: unknown) {
        const errRes = this.buildError(null, -32700, 'Parse error');
        process.stdout.write(JSON.stringify(errRes) + '\n');
      }
    });
  }

  private buildError(
    id: string | number | null,
    code: number,
    message: string,
    data?: unknown
  ): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: { code, message, data },
    };
  }
}
