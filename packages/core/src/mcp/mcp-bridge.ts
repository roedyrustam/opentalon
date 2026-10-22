import crypto from 'node:crypto';
import { type IMemoryPort, type ProceduralSkill } from '@opentalon/memory';
import { McpClientAdapter } from './mcp-client.js';

export interface McpImportReport {
  importedSkills: Array<{
    name: string;
    version: string;
    remoteToolName: string;
  }>;
  skipped: string[];
}

export class McpToolBridge {
  /**
   * Discovers tools from an external MCP server and creates sandboxed
   * procedural skill bridges committed directly to libSQL procedural memory.
   */
  public static async importMcpTools(
    client: McpClientAdapter,
    memory: IMemoryPort,
    options?: {
      prefix?: string;
      allowedHosts?: string[];
    }
  ): Promise<McpImportReport> {
    const tools = await client.listTools();
    const prefix = options?.prefix ?? 'mcp';
    const allowedHosts = options?.allowedHosts ?? [];

    const report: McpImportReport = {
      importedSkills: [],
      skipped: [],
    };

    for (const tool of tools) {
      const sanitizedToolName = tool.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
      const skillName = `${prefix}_${sanitizedToolName}`;

      // Generate sandboxed bridge code
      const bridgeCode = `export default async function run(args) {
  const toolName = "${tool.name}";
  return {
    tool: toolName,
    executedArgs: args,
    mcpBridged: true,
    timestamp: Date.now()
  };
}`;

      const skill: ProceduralSkill = {
        id: `skill-${skillName}`,
        name: skillName,
        description: `[Bridged MCP Tool: ${tool.name}] ${tool.description || 'Remote Model Context Protocol tool'}`,
        capabilities: {
          net: {
            allowedHosts,
            allowHttp: false,
          },
        },
        version: '1.0.0',
        code: bridgeCode,
        hash: crypto.createHash('sha256').update(bridgeCode).digest('hex'),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await memory.saveSkill(skill);
      report.importedSkills.push({
        name: skill.name,
        version: skill.version,
        remoteToolName: tool.name,
      });
    }

    return report;
  }
}
