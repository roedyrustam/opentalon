import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {
  DualBrainRouter,
  GeminiDriver,
  OpenAIDriver,
  MockLLMDriver,
  EvolutionEngine,
  McpServer,
  McpClientAdapter,
  McpToolBridge,
  SwarmDirector,
  type ChatMessage,
} from '@opentalon/core';
import { LibSqlMemoryAdapter } from '@opentalon/memory';
import { SandboxedVmRunner } from '@opentalon/skill-engine';
import { LocalDaemonAdapter } from '@opentalon/gateway';

const program = new Command();

program
  .name('talon')
  .description('OpenTalon - Next-Generation AI Agent Framework CLI')
  .version('0.1.0');

function getComponents(dbPath = 'opentalon.db') {
  const memory = new LibSqlMemoryAdapter({
    url: `file:${dbPath}`,
  });
  const sandbox = new SandboxedVmRunner();

  let llm;
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    llm = new GeminiDriver({
      primaryModel: process.env.TALON_MODEL || 'gemini-2.5-pro',
      fallbackModel: 'gemini-2.5-flash',
    });
  } else if (process.env.OPENAI_API_KEY) {
    llm = new OpenAIDriver({
      model: process.env.TALON_MODEL || 'gpt-4o-mini',
    });
  } else {
    console.warn('[WARN] No GEMINI_API_KEY or OPENAI_API_KEY found. Running in offline Mock LLM mode.');
    llm = new MockLLMDriver();
  }

  const router = new DualBrainRouter({
    memory,
    sandbox,
    llm,
    maxFastPathTokens: 1500,
  });

  const evolutionEngine = new EvolutionEngine(memory, sandbox, llm);
  const mcpServer = new McpServer(memory, sandbox);
  const swarmDirector = new SwarmDirector(llm);

  return { memory, sandbox, llm, router, evolutionEngine, mcpServer, swarmDirector };
}

// 1. `talon init`
program
  .command('init')
  .description('Initialize a new OpenTalon workspace with local database and config')
  .action(async () => {
    console.log('🚀 Initializing OpenTalon workspace...');
    const configPath = path.resolve('opentalon.config.json');
    if (!fs.existsSync(configPath)) {
      const defaultConfig = {
        name: 'my-talon-agent',
        version: '0.1.0',
        db: 'opentalon.db',
        tokenBudget: 1500,
        provider: 'gemini',
      };
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
      console.log('  Created opentalon.config.json');
    }

    const memory = new LibSqlMemoryAdapter({ url: 'file:opentalon.db' });
    await memory.initialize();
    await memory.close();
    console.log('  Initialized local SQLite database: opentalon.db');
    console.log('✅ OpenTalon workspace is ready.');
  });

// 2. `talon run <prompt>`
program
  .command('run <prompt>')
  .description('Execute a single Fast Path agent turn (<1,500 token budget)')
  .option('-s, --session <id>', 'Session identifier', `session_${Date.now()}`)
  .action(async (prompt: string, options: { session: string }) => {
    const { router } = getComponents();
    console.log(`\n🤖 [Fast Path] Input: "${prompt}" (Session: ${options.session})`);
    const start = Date.now();

    try {
      const result = await router.executeFastPath({
        sessionId: options.session,
        input: prompt,
      });

      console.log('\n--- Output ---');
      console.log(result.output);
      console.log('--------------');
      console.log(`⏱️ Latency: ${result.latencyMs}ms | Total Elapsed: ${Date.now() - start}ms`);
      console.log(
        `📊 Tokens: ${result.tokensUsed.totalTokens} (Prompt: ${result.tokensUsed.promptTokens}, Completion: ${result.tokensUsed.completionTokens})`
      );
      if (result.retrievedSkills.length > 0) {
        console.log(
          `🛠️ Retrieved Skills: ${result.retrievedSkills.map((s) => s.name).join(', ')}`
        );
      }
      if (result.toolCallsMade.length > 0) {
        console.log(
          `⚡ Tool Calls Executed in Sandbox: ${result.toolCallsMade.map((t) => t.toolName).join(', ')}`
        );
      }
    } catch (err: unknown) {
      console.error('❌ Execution failed:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// 3. `talon chat` (Interactive REPL)
program
  .command('chat')
  .description('Launch interactive multi-turn REPL chat session with OpenTalon')
  .action(async () => {
    const { router } = getComponents();
    const sessionId = `repl_${Date.now()}`;
    const history: ChatMessage[] = [];

    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║       OpenTalon Interactive REPL (Dual-Brain Agent)       ║');
    console.log('║  Type your prompt below. Type "exit" or "quit" to leave.  ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'talon> ',
    });

    rl.prompt();

    rl.on('line', async (line) => {
      const trimmed = line.trim();
      if (trimmed === 'exit' || trimmed === 'quit') {
        console.log('👋 Session ended. Goodbye!');
        process.exit(0);
      }

      if (trimmed.length === 0) {
        rl.prompt();
        return;
      }

      try {
        const start = Date.now();
        const result = await router.executeFastPath({
          sessionId,
          input: trimmed,
          history,
        });

        console.log(`\n${result.output}\n`);
        console.log(
          `[⚡ ${Date.now() - start}ms | ${result.tokensUsed.totalTokens} tokens | Skills: ${result.retrievedSkills.map((s) => s.name).join(', ') || 'none'}]\n`
        );

        history.push({ role: 'user', content: trimmed });
        history.push({ role: 'assistant', content: result.output });
      } catch (err: unknown) {
        console.error('❌ Error:', err instanceof Error ? err.message : String(err));
      }

      rl.prompt();
    });
  });

// 4. `talon serve`
program
  .command('serve')
  .description('Start the local OpenTalon HTTP gateway daemon')
  .option('-p, --port <number>', 'Port to listen on', '3100')
  .option('-h, --host <string>', 'Host interface', '127.0.0.1')
  .option('--auto-evolve', 'Enable autonomous Slow Path evolution on incoming traces', false)
  .action(async (options: { port: string; host: string; autoEvolve: boolean }) => {
    const port = parseInt(options.port, 10);
    const { router } = getComponents();

    if (options.autoEvolve) {
      console.log('🧠 Autonomous Slow Path Evolution: ENABLED (Hermes reflection loop active)');
      router.on('slowpath:completed', (report: any) => {
        if (report?.skillsSynthesized?.length > 0) {
          for (const s of report.skillsSynthesized) {
            console.log(`✨ [Auto-Evolve] Synthesized and registered new skill: ${s.name} (v${s.version})`);
          }
        }
      });
      router.on('slowpath:error', (err: any) => {
        console.warn(`⚠️ [Auto-Evolve] Background evolution warning: ${err instanceof Error ? err.message : String(err)}`);
      });
    }

    const daemon = new LocalDaemonAdapter(router, { port, host: options.host });

    console.log(`🌐 Starting OpenTalon Local Daemon on http://${options.host}:${port}...`);
    await daemon.start();
    console.log(`✅ Daemon listening on http://${options.host}:${port}`);
    console.log(`   Dashboard: http://${options.host}:${port}/dashboard`);
    console.log(`   Healthcheck: http://${options.host}:${port}/health`);
    console.log(`   Chat Endpoint: POST http://${options.host}:${port}/v1/chat`);
    console.log(`   Stream Endpoint: POST http://${options.host}:${port}/v1/stream`);
  });

// 5. `talon dashboard`
program
  .command('dashboard')
  .description('Launch the embedded OpenTalon Visual Cockpit & Web Dashboard')
  .option('-p, --port <number>', 'Port to listen on', '3100')
  .option('-h, --host <string>', 'Host interface', '127.0.0.1')
  .action(async (options: { port: string; host: string }) => {
    const port = parseInt(options.port, 10);
    const { router } = getComponents();
    const daemon = new LocalDaemonAdapter(router, { port, host: options.host });

    await daemon.start();
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║       🦅 OpenTalon Dual-Brain Visual Cockpit Online       ║');
    console.log(`║  Web Dashboard: http://${options.host}:${port}                   ║`);
    console.log('║  • Episodic Traces & Token Telemetry                      ║');
    console.log('║  • Procedural Skills Sandbox Runner                       ║');
    console.log('║  • Live SSE Streaming Chat Playground                     ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
    console.log(`Press Ctrl+C to terminate the dashboard.\n`);
  });

// 6. `talon evolve`
program
  .command('evolve')
  .description('Run an autonomous Slow Path evolution cycle (Hermes reflection & auto-patching)')
  .option('-l, --limit <number>', 'Maximum traces to inspect', '100')
  .option('--dry-run', 'Inspect opportunities and validate synthesis in sandbox without committing to database', false)
  .option('--json', 'Output machine-readable JSON evolution report', false)
  .action(async (options: { limit: string; dryRun: boolean; json: boolean }) => {
    const limit = parseInt(options.limit, 10);
    const { evolutionEngine } = getComponents();

    const start = Date.now();
    const report = await evolutionEngine.runEvolutionCycle({
      traceLimit: limit,
      dryRun: options.dryRun,
    });

    if (options.json) {
      console.log(JSON.stringify({ ...report, durationMs: Date.now() - start }, null, 2));
      return;
    }

    console.log(`\n🧠 Running Autonomous Slow Path Evolution Cycle (scanning last ${limit} traces)...`);
    if (options.dryRun) {
      console.log('🔍 [DRY-RUN MODE] Verified skills will NOT be committed to database.');
    }

    console.log(`\n--- Evolution Report (${Date.now() - start}ms) ---`);
    console.log(`Opportunities detected: ${report.opportunitiesFound}`);
    console.log(`Skills synthesized & committed: ${report.skillsSynthesized.length}`);

    for (const skill of report.skillsSynthesized) {
      console.log(`  ✨ ${skill.name} (v${skill.version}) [Type: ${skill.type}] (Hash: ${skill.hash.slice(0, 10)}...)`);
    }

    if (report.skipped && report.skipped.length > 0) {
      console.log('\nSkipped Opportunities (FinOps / Circuit Breaker):');
      for (const skip of report.skipped) {
        console.log(`  🛑 [${skip.opportunityId}]: ${skip.reason}`);
      }
    }

    if (report.errors.length > 0) {
      console.log('\nWarnings / Sandbox Failures:');
      for (const err of report.errors) {
        console.log(`  ⚠️ ${err}`);
      }
    }
    console.log('-------------------------------------------\n');
  });

// 7. `talon swarm`
const swarmCommand = program
  .command('swarm')
  .description('Orchestrate multi-agent autonomous swarms (Fan-Out/Fan-In, Pipeline Saga, Critic Loop)');

swarmCommand
  .command('fanout <task>')
  .description('Run Fan-Out / Fan-In parallel subagent delegation and synthesis')
  .action(async (task: string) => {
    const { swarmDirector } = getComponents();
    console.log(`\n🐝 [Swarm: Fan-Out/Fan-In] Task: "${task}"`);

    const result = await swarmDirector.executeSwarm({
      topology: 'fan_out_fan_in',
      task,
      agents: [
        {
          id: 'architect',
          role: 'System Architect',
          systemInstruction: 'You are the System Architect. Provide architectural foundations and component schemas.',
        },
        {
          id: 'security',
          role: 'Security Sentinel',
          systemInstruction: 'You are the Security Sentinel. Audit threat models, permissions, and validation gates.',
        },
        {
          id: 'craftsman',
          role: 'Fullstack Craftsman',
          systemInstruction: 'You are the Fullstack Craftsman. Provide concrete, type-safe implementation guidance.',
        },
      ],
    });

    console.log('\n--- Subagent Results ---');
    for (const sub of result.subagentResults) {
      console.log(`\n[${sub.role}] (${sub.durationMs}ms):`);
      console.log(sub.output);
    }

    console.log('\n--- Final Unified Synthesis ---');
    console.log(result.finalOutput);
    console.log('-------------------------------');
    console.log(`⏱️ Latency: ${result.totalLatencyMs}ms | Total Tokens: ${result.totalTokens.totalTokens}\n`);
  });

swarmCommand
  .command('saga <task>')
  .description('Run Pipeline Saga sequential dependent multi-stage execution')
  .action(async (task: string) => {
    const { swarmDirector } = getComponents();
    console.log(`\n🔗 [Swarm: Pipeline Saga] Task: "${task}"`);

    const result = await swarmDirector.executeSwarm({
      topology: 'pipeline_saga',
      task,
      agents: [
        { id: 'stage-1', role: 'Discovery & Requirements', systemInstruction: 'Extract PRD and domain entities.' },
        { id: 'stage-2', role: 'API & Contract Design', systemInstruction: 'Design OpenAPI and type contracts.' },
        { id: 'stage-3', role: 'Implementation & Verification', systemInstruction: 'Write production code.' },
      ],
    });

    console.log('\n--- Pipeline Final Output ---');
    console.log(result.finalOutput);
    console.log('-----------------------------');
    console.log(`⏱️ Latency: ${result.totalLatencyMs}ms | Stages: ${result.subagentResults.length}\n`);
  });

swarmCommand
  .command('critic <task>')
  .description('Run Critic-Validator Loop zero-tolerance quality gate with self-healing')
  .option('-r, --retries <number>', 'Max critique retry cycles', '3')
  .action(async (task: string, options: { retries: string }) => {
    const { swarmDirector } = getComponents();
    const maxRetries = parseInt(options.retries, 10);
    console.log(`\n🛡️ [Swarm: Critic-Validator Loop] Task: "${task}" (Max retries: ${maxRetries})`);

    const result = await swarmDirector.executeSwarm({
      topology: 'critic_validator_loop',
      task,
      agents: [
        { id: 'implementer', role: 'Implementer Agent', systemInstruction: 'You are the Implementer Agent. Write complete code.' },
        { id: 'critic', role: 'Strict Quality Critic', systemInstruction: 'You are the Strict Quality Critic. Reject any flaw until perfect.' },
      ],
      criticConfig: { maxRetries },
    });

    console.log('\n--- Verified Candidate Solution ---');
    console.log(result.finalOutput);
    console.log('-----------------------------------');
    console.log(`✅ Approved in ${result.criticIterations} critique cycle(s) (Total Latency: ${result.totalLatencyMs}ms)\n`);
  });

// 8. `talon mcp`
const mcpCommand = program
  .command('mcp')
  .description('Model Context Protocol (MCP) server & client integration');

mcpCommand
  .command('serve')
  .description('Start OpenTalon MCP Server on Stdio (connect with Claude Desktop, Cursor, Antigravity)')
  .action(async () => {
    const { mcpServer, memory } = getComponents();
    await memory.initialize();
    console.error('🦅 [OpenTalon MCP Server] Ready on Stdio. Listening for JSON-RPC 2.0 frames...');
    mcpServer.startStdio();
  });

mcpCommand
  .command('list')
  .description('List all procedural tools exposed via MCP server')
  .action(async () => {
    const { mcpServer, memory } = getComponents();
    await memory.initialize();
    const res = await mcpServer.handleMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });
    await memory.close();

    const tools = (res.result as { tools: Array<{ name: string; description: string }> })?.tools || [];
    console.log(`\n🔌 OpenTalon MCP Tools (${tools.length} available):`);
    if (tools.length === 0) {
      console.log('   No tools registered. Register skills via "talon skills add <file.md>".');
      return;
    }
    for (const tool of tools) {
      console.log(`  • ${tool.name}`);
      console.log(`    ${tool.description}`);
    }
    console.log('');
  });

mcpCommand
  .command('call <toolName> [argsJson]')
  .description('Invoke an MCP tool call directly')
  .action(async (toolName: string, argsJson?: string) => {
    const { mcpServer, memory } = getComponents();
    await memory.initialize();

    let args = {};
    if (argsJson) {
      try {
        args = JSON.parse(argsJson);
      } catch {
        console.error('❌ Invalid JSON arguments string.');
        await memory.close();
        process.exit(1);
      }
    }

    console.log(`\n🔌 Calling MCP Tool: ${toolName}...`);
    const res = await mcpServer.handleMessage({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    });
    await memory.close();

    console.log('\n--- MCP Response ---');
    console.log(JSON.stringify(res, null, 2));
    console.log('--------------------\n');
  });

mcpCommand
  .command('import <endpointUrl>')
  .description('Import tools from an external MCP server into OpenTalon procedural memory')
  .option('-p, --prefix <prefix>', 'Skill name prefix', 'mcp')
  .option('--allowed-hosts <hosts>', 'Comma-separated list of allowed network hosts')
  .action(async (endpointUrl: string, options: { prefix: string; allowedHosts?: string }) => {
    const { memory } = getComponents();
    await memory.initialize();

    console.log(`\n🔌 Connecting to remote MCP server at: ${endpointUrl}...`);
    const client = new McpClientAdapter({
      name: 'cli-mcp-importer',
      transport: 'http',
      url: endpointUrl,
    });

    try {
      const allowedHosts = options.allowedHosts ? options.allowedHosts.split(',').map((s) => s.trim()) : [];
      const report = await McpToolBridge.importMcpTools(client, memory, {
        prefix: options.prefix,
        allowedHosts,
      });

      console.log(`✅ Successfully imported ${report.importedSkills.length} tools into procedural memory:`);
      for (const item of report.importedSkills) {
        console.log(`  • ${item.name} (remote tool: ${item.remoteToolName})`);
      }
      console.log('\n💡 These tools are now executable via "talon skills run <skillName>" and indexed for Fast Path routing!\n');
    } catch (err: unknown) {
      console.error('❌ MCP Import failed:', err instanceof Error ? err.message : String(err));
    } finally {
      await memory.close();
    }
  });

// 9. `talon skills`
const skillsCommand = program.command('skills').description('Manage procedural skills');

skillsCommand
  .command('list')
  .description('List all procedural skills registered in the memory database')
  .action(async () => {
    const { memory } = getComponents();
    await memory.initialize();
    const list = await memory.listSkills();
    await memory.close();

    console.log(`\n📚 Procedural Skills (${list.length} registered):`);
    if (list.length === 0) {
      console.log('   No skills registered yet. Use "talon skills add <file.md>" to register one.');
      return;
    }

    for (const skill of list) {
      console.log(`\n  • ${skill.name} (v${skill.version})`);
      console.log(`    Description: ${skill.description}`);
      console.log(`    Hash: ${skill.hash}`);
      console.log(`    Capabilities: ${JSON.stringify(skill.capabilities)}`);
    }
  });

skillsCommand
  .command('add <filePath>')
  .description('Register a new skill from a SKILL.md file into procedural memory')
  .action(async (filePath: string) => {
    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ File not found: ${fullPath}`);
      process.exit(1);
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    const { router } = getComponents();

    try {
      console.log(`🔍 Validating ${path.basename(fullPath)}...`);
      console.log(`🧪 Testing code in Zero-Trust Sandbox...`);
      const skill = await router.synthesizeAndRegisterSkill(content);
      console.log(`✅ Registered skill: ${skill.name} (v${skill.version}) [Hash: ${skill.hash.slice(0, 12)}...]`);
    } catch (err: unknown) {
      console.error('❌ Failed to register skill:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

skillsCommand
  .command('run <skillName> [argsJson]')
  .description('Execute a registered procedural skill directly in the Zero-Trust Sandbox')
  .action(async (skillName: string, argsJson?: string) => {
    const { memory, sandbox } = getComponents();
    await memory.initialize();

    const skill = await memory.getSkill(skillName);
    if (!skill) {
      console.error(`❌ Skill "${skillName}" not found in memory database.`);
      await memory.close();
      process.exit(1);
    }

    let parsedArgs: Record<string, unknown> = {};
    if (argsJson) {
      try {
        parsedArgs = JSON.parse(argsJson);
      } catch {
        console.error('❌ Invalid JSON arguments string provided.');
        await memory.close();
        process.exit(1);
      }
    }

    console.log(`\n🧪 Executing skill [${skill.name} v${skill.version}] in Zero-Trust Sandbox...`);
    console.log(`   Arguments: ${JSON.stringify(parsedArgs)}`);
    console.log(`   Capabilities: ${JSON.stringify(skill.capabilities)}`);

    const start = Date.now();
    const result = await sandbox.execute({
      code: skill.code,
      args: parsedArgs,
      capabilities: skill.capabilities,
      timeoutMs: 5000,
    });
    const elapsed = Date.now() - start;

    await memory.close();

    console.log(`\n--- Execution Result (${elapsed}ms) ---`);
    console.log(`Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    if (result.data !== undefined) {
      console.log('Return Data:');
      console.log(JSON.stringify(result.data, null, 2));
    }
    if (result.error) {
      console.log(`Error: ${result.error}`);
    }
    if (result.logs && result.logs.length > 0) {
      console.log('\nSandbox Logs:');
      for (const log of result.logs) {
        console.log(`  > ${log}`);
      }
    }
    console.log('--------------------------------------\n');
  });

skillsCommand
  .command('info <skillName>')
  .description('Inspect detailed metadata, capabilities, and code of a procedural skill')
  .action(async (skillName: string) => {
    const { memory } = getComponents();
    await memory.initialize();

    const skill = await memory.getSkill(skillName);
    await memory.close();

    if (!skill) {
      console.error(`❌ Skill "${skillName}" not found.`);
      process.exit(1);
    }

    console.log(`\n========================================`);
    console.log(`📜 Skill: ${skill.name} (v${skill.version})`);
    console.log(`========================================`);
    console.log(`ID:           ${skill.id}`);
    console.log(`Description:  ${skill.description}`);
    console.log(`SHA-256 Hash: ${skill.hash}`);
    console.log(`Capabilities: ${JSON.stringify(skill.capabilities, null, 2)}`);
    console.log(`Created:      ${new Date(skill.createdAt).toISOString()}`);
    console.log(`\n--- Executable Source ---`);
    console.log(skill.code);
    if (skill.testCases) {
      console.log(`\n--- Verified Test Cases ---`);
      console.log(skill.testCases);
    }
    console.log(`========================================\n`);
  });

skillsCommand
  .command('remove <skillName>')
  .description('Remove a procedural skill from the memory database')
  .action(async (skillName: string) => {
    const { memory } = getComponents();
    await memory.initialize();

    const skill = await memory.getSkill(skillName);
    if (!skill) {
      console.error(`❌ Skill "${skillName}" not found.`);
      await memory.close();
      process.exit(1);
    }

    await memory.deleteSkill(skill.id);
    await memory.close();
    console.log(`🗑️ Successfully removed skill: ${skill.name} (${skill.id})`);
  });

// 10. `talon memory`
const memoryCommand = program.command('memory').description('Manage long-term semantic facts & agent preferences');

memoryCommand
  .command('list')
  .description('List stored semantic facts and knowledge items')
  .option('-c, --category <cat>', 'Filter by fact category')
  .option('-l, --limit <num>', 'Maximum facts to return', '50')
  .action(async (options: { category?: string; limit: string }) => {
    const { memory } = getComponents();
    await memory.initialize();
    const limit = parseInt(options.limit, 10);
    const facts = await memory.listFacts({ category: options.category, limit });
    await memory.close();

    console.log(`\n🧠 Semantic Facts & Knowledge (${facts.length} items):`);
    if (facts.length === 0) {
      console.log('   No facts recorded. Use "talon memory add <key> <value>" to add one.');
      return;
    }

    for (const fact of facts) {
      console.log(`\n  • [${fact.category}] ${fact.key} (Confidence: ${fact.confidence})`);
      console.log(`    Value: ${fact.value}`);
      console.log(`    ID: ${fact.id} | Updated: ${new Date(fact.updatedAt).toISOString()}`);
    }
    console.log('');
  });

memoryCommand
  .command('add <key> <value>')
  .description('Save a new long-term semantic fact or user preference')
  .option('-c, --category <cat>', 'Category of the fact', 'user_preference')
  .option('--confidence <num>', 'Confidence score (0.0 to 1.0)', '1.0')
  .action(async (key: string, value: string, options: { category: string; confidence: string }) => {
    const { memory } = getComponents();
    await memory.initialize();

    const confidence = parseFloat(options.confidence);
    const factId = `fact_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await memory.saveFact({
      id: factId,
      category: options.category,
      key,
      value,
      confidence,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await memory.close();

    console.log(`\n✅ Stored semantic fact:`);
    console.log(`   ID:       ${factId}`);
    console.log(`   Category: ${options.category}`);
    console.log(`   Key:      ${key}`);
    console.log(`   Value:    ${value}`);
    console.log('💡 This knowledge is now continuously retrieved during Fast Path reasoning turns!\n');
  });

memoryCommand
  .command('search <query>')
  .description('Search semantic memory using full-text keyword matching')
  .option('-c, --category <cat>', 'Filter by category')
  .action(async (query: string, options: { category?: string }) => {
    const { memory } = getComponents();
    await memory.initialize();
    const results = await memory.searchFacts(query, { category: options.category, topK: 10 });
    await memory.close();

    console.log(`\n🔍 Search Results for "${query}" (${results.length} found):`);
    if (results.length === 0) {
      console.log('   No matching facts found.');
      return;
    }
    for (const fact of results) {
      console.log(`  • [${fact.category}] ${fact.key} = "${fact.value}"`);
    }
    console.log('');
  });

memoryCommand
  .command('remove <factId>')
  .description('Delete a semantic fact by ID')
  .action(async (factId: string) => {
    const { memory } = getComponents();
    await memory.initialize();
    const deleted = await memory.deleteFact(factId);
    await memory.close();

    if (deleted) {
      console.log(`🗑️ Successfully deleted fact: ${factId}`);
    } else {
      console.log(`❌ Fact not found: ${factId}`);
    }
  });

program.parse(process.argv);
