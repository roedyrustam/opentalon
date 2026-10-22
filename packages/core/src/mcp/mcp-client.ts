import { type McpTool, type JsonRpcRequest, type JsonRpcResponse } from './types.js';

export interface ExternalMcpServerConfig {
  name: string;
  url?: string;
  transport: 'http' | 'in_process';
  handler?: (req: JsonRpcRequest) => Promise<JsonRpcResponse>;
}

export class McpClientAdapter {
  private config: ExternalMcpServerConfig;
  private requestId = 0;

  constructor(config: ExternalMcpServerConfig) {
    this.config = config;
  }

  /**
   * Initializes the MCP connection and discovers remote tools.
   */
  public async listTools(): Promise<McpTool[]> {
    const res = await this.sendRequest('tools/list', {});
    if (res.error) {
      throw new Error(`MCP Client error on tools/list: ${res.error.message}`);
    }
    const data = res.result as { tools: McpTool[] };
    return data.tools || [];
  }

  /**
   * Calls a remote tool on the MCP server.
   */
  public async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const res = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    });
    if (res.error) {
      throw new Error(`MCP Client error on tools/call (${name}): ${res.error.message}`);
    }
    return res.result;
  }

  private async sendRequest(method: string, params: Record<string, unknown>): Promise<JsonRpcResponse> {
    const id = ++this.requestId;
    const rpcReq: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    if (this.config.transport === 'in_process' && this.config.handler) {
      return await this.config.handler(rpcReq);
    }

    if (this.config.transport === 'http' && this.config.url) {
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rpcReq),
      });

      if (!response.ok) {
        throw new Error(`HTTP Transport error (${response.status}): ${await response.text()}`);
      }

      return (await response.json()) as JsonRpcResponse;
    }

    throw new Error(`Unsupported transport: ${this.config.transport}`);
  }
}
