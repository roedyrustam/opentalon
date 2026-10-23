import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {
  DualBrainRouter,
  GeminiDriver,
  OpenAIDriver,
  AnthropicDriver,
  DeepSeekDriver,
  OllamaDriver,
  CascadingLLMDriver,
  MockLLMDriver,
  EvolutionEngine,
  McpServer,
  McpClientAdapter,
  McpToolBridge,
  SwarmDirector,
  CronScheduler,
  ContextCacheManager,
  ThinkingBudgetCalculator,
  type ChatMessage,
  type ILLMPort,
  type CascadeProvider,
} from '@opentalon/core';
import { LibSqlMemoryAdapter } from '@opentalon/memory';
import { SandboxedVmRunner, RemoteSkillInstaller } from '@opentalon/skill-engine';
import { LocalDaemonAdapter } from '@opentalon/gateway';

// Automatically discover and load .env from workspace or parent directories
function loadEnv() {
  const envCandidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(process.cwd(), '..', '..', '.env'),
  ];
  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
            if (!process.env[key] && val) {
              process.env[key] = val;
            }
          }
        }
        break;
      } catch {
        // silent fallback
      }
    }
  }
}
loadEnv();

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

  const providers: CascadeProvider[] = [];

  // 1. Google Gemini (Fast Frugal & Long-Context)
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    const gemini = new GeminiDriver({
      primaryModel: process.env.GEMINI_MODEL || process.env.TALON_MODEL || 'gemini-3.5-flash-lite',
      fallbackModel: process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.8-flash',
    });
    providers.push({
      name: 'gemini',
      driver: gemini,
      priority: Number(process.env.GEMINI_PRIORITY || 0),
    });
  }

  // 2. Anthropic Claude (Frontier Reasoning & Hybrid Thinking)
  if (process.env.ANTHROPIC_API_KEY) {
    const claude = new AnthropicDriver({
      model: process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219',
    });
    providers.push({
      name: 'anthropic',
      driver: claude,
      priority: Number(process.env.ANTHROPIC_PRIORITY || 1),
    });
  }

  // 3. DeepSeek (Ultra-Frugal V3 & R1 Reasoning)
  if (process.env.DEEPSEEK_API_KEY) {
    const deepseek = new DeepSeekDriver({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    });
    providers.push({
      name: 'deepseek',
      driver: deepseek,
      priority: Number(process.env.DEEPSEEK_PRIORITY || 2),
    });
  }

  // 4. OpenAI (GPT-4o & GPT-4o-mini)
  if (process.env.OPENAI_API_KEY) {
    const openai = new OpenAIDriver({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    });
    providers.push({
      name: 'openai',
      driver: openai,
      priority: Number(process.env.OPENAI_PRIORITY || 3),
    });
  }

  // 5. Local Offline Ollama
  if (process.env.OLLAMA_ENABLED === 'true' || process.env.OLLAMA_MODEL || process.env.OLLAMA_BASE_URL) {
    const ollama = new OllamaDriver({
      baseURL: process.env.OLLAMA_BASE_URL,
      model: process.env.OLLAMA_MODEL || 'qwen2.5:7b',
    });
    providers.push({
      name: 'ollama',
      driver: ollama,
      priority: Number(process.env.OLLAMA_PRIORITY || 4),
    });
  }

  let llm: ILLMPort;

  if (providers.length > 0) {
    llm = new CascadingLLMDriver({
      providers,
      onFailover: (from, to, error) => {
        console.warn(`\x1b[33m[CASCADE FAILOVER]\x1b[0m Provider '${from}' error (${error.message}). Gracefully switching to '${to}'...`);
      },
    });
  } else {
    console.warn('[WARN] No LLM API keys or Ollama configured. Running in offline Mock LLM mode.');
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

  // Configure asymmetric worker LLM (Gemini 3.8 Flash) for high-throughput swarm delegation
  let workerLLM: ILLMPort | undefined;
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    workerLLM = new GeminiDriver({
      primaryModel: process.env.GEMINI_WORKER_MODEL || 'gemini-3.8-flash',
      fallbackModel: 'gemini-3.5-flash-lite',
    });
  }

  const swarmDirector = new SwarmDirector(llm, workerLLM);
  const scheduler = new CronScheduler({ memory, router, sandbox });

  return { memory, sandbox, llm, router, evolutionEngine, mcpServer, swarmDirector, scheduler };
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

    const existingJobs = await memory.listJobs();
    if (existingJobs.length === 0) {
      await memory.saveJob({
        id: 'job-health-check',
        name: 'hourly-health-check',
        cron: '@hourly',
        actionType: 'skill',
        actionPayload: {
          skillName: 'http_json_fetcher',
          args: { url: 'http://127.0.0.1:3100/health' },
        },
        status: 'active',
        nextRunAt: Date.now() + 3600000,
        failureCount: 0,
        maxRetries: 3,
        timeoutMs: 15000,
        notifyChannels: ['sse'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      console.log('  Seeded preset automation: hourly-health-check (@hourly)');
    }

    await memory.close();
    console.log('  Initialized local SQLite database: opentalon.db');
    console.log('✅ OpenTalon workspace is ready.');
  });

// Interactive REPL chat session handler
async function startInteractiveChat() {
  const { router, memory, evolutionEngine, llm } = getComponents();
  await memory.initialize();

  const sessionId = `repl_${Date.now()}`;
  const history: ChatMessage[] = [];
  let enableGrounding = false;

  const cyan = '\x1b[36m';
  const green = '\x1b[32m';
  const yellow = '\x1b[33m';
  const magenta = '\x1b[35m';
  const bold = '\x1b[1m';
  const dim = '\x1b[2m';
  const reset = '\x1b[0m';

  const providerName = (llm as any).provider || (llm.constructor ? llm.constructor.name.replace('Driver', '') : 'Unknown');
  const modelName = (llm as any).primaryModel || (llm as any).model || 'default';

  console.log(`
${cyan}╔══════════════════════════════════════════════════════════════════╗
║        🦅  OPENTALON INTERACTIVE REPL (DUAL-BRAIN)               ║
║  Dual-Brain Autonomous AI Agent Framework (v0.1.0)               ║
╠══════════════════════════════════════════════════════════════════╣${reset}
║  • LLM Provider : ${green}${providerName}${reset} (${modelName})
║  • Token Budget : <1,500 tokens / turn                           ║
║  • Slash Cmds   : Type ${yellow}/help${reset} for available commands             ║
║  • Exit         : Type ${dim}/exit${reset} or ${dim}exit${reset} to leave session                 ║
${cyan}╚══════════════════════════════════════════════════════════════════╝${reset}
`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${cyan}talon>${reset} `,
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const trimmed = line.trim();

    // 1. Exit handling
    if (trimmed === 'exit' || trimmed === 'quit' || trimmed === '/exit' || trimmed === '/quit') {
      console.log(`\n${green}👋 Session ended. Goodbye!${reset}`);
      await memory.close();
      process.exit(0);
    }

    if (trimmed.length === 0) {
      rl.prompt();
      return;
    }

    // 2. Slash command handling
    if (trimmed.startsWith('/')) {
      const parts = trimmed.slice(1).split(/\s+/);
      const cmd = parts[0]?.toLowerCase();
      const rest = parts.slice(1).join(' ').trim();

      if (cmd === 'help' || cmd === '?') {
        console.log(`
${bold}OpenTalon REPL Slash Commands:${reset}
  ${yellow}/help, /?${reset}               Show this commands guide
  ${yellow}/grounding${reset}              Toggle native Google Search Grounding on/off
  ${yellow}/skills${reset}                 List all active procedural skills in sandbox
  ${yellow}/facts${reset}                  List long-term semantic facts & user preferences
  ${yellow}/addfact <key>=<val>${reset}   Store a new semantic rule or preference
  ${yellow}/delfact <id>${reset}          Delete a semantic fact by ID
  ${yellow}/stats${reset}                  Show runtime telemetry, latency & token stats
  ${yellow}/model${reset}                  Display active LLM provider and model configuration
  ${yellow}/evolve${reset}                 Trigger on-demand Slow Path evolution cycle
  ${yellow}/history${reset}                View conversation turns in current session
  ${yellow}/reset${reset}                  Clear current conversation history
  ${yellow}/clear${reset}                  Clear terminal screen
  ${yellow}/exit, /quit${reset}            Exit OpenTalon REPL
`);
        rl.prompt();
        return;
      }

      if (cmd === 'skills') {
        try {
          const skills = await memory.listSkills();
          console.log(`\n${bold}📚 Registered Procedural Skills (${skills.length}):${reset}`);
          if (skills.length === 0) {
            console.log(`  ${dim}No skills registered in database.${reset}`);
          } else {
            for (const s of skills) {
              console.log(`  • ${green}${s.name}${reset} (v${s.version}) [Hash: ${s.hash.slice(0, 8)}]`);
              console.log(`    ${dim}${s.description}${reset}`);
            }
          }
          console.log('');
        } catch (err: unknown) {
          console.error(`❌ Failed to list skills:`, err instanceof Error ? err.message : String(err));
        }
        rl.prompt();
        return;
      }

      if (cmd === 'facts') {
        try {
          const facts = await memory.listFacts({ limit: 50 });
          console.log(`\n${bold}🧠 Long-Term Semantic Facts (${facts.length}):${reset}`);
          if (facts.length === 0) {
            console.log(`  ${dim}No semantic facts stored yet. Use /addfact <key>=<value> to save one.${reset}`);
          } else {
            for (const f of facts) {
              console.log(`  • [${magenta}${f.category}${reset}] ${bold}${f.key}${reset}: ${f.value} ${dim}(ID: ${f.id})${reset}`);
            }
          }
          console.log('');
        } catch (err: unknown) {
          console.error(`❌ Failed to list facts:`, err instanceof Error ? err.message : String(err));
        }
        rl.prompt();
        return;
      }

      if (cmd === 'addfact') {
        if (!rest) {
          console.log(`${yellow}Usage: /addfact <key> = <value>${reset} (e.g. /addfact preferred_currency = EUR)`);
          rl.prompt();
          return;
        }
        let key = '';
        let val = '';
        if (rest.includes('=')) {
          const idx = rest.indexOf('=');
          key = rest.slice(0, idx).trim();
          val = rest.slice(idx + 1).trim();
        } else {
          const spaceIdx = rest.indexOf(' ');
          if (spaceIdx !== -1) {
            key = rest.slice(0, spaceIdx).trim();
            val = rest.slice(spaceIdx + 1).trim();
          } else {
            key = rest;
            val = 'true';
          }
        }

        try {
          const fact = {
            id: `fact_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            category: 'user_preference',
            key,
            value: val,
            confidence: 1.0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          await memory.saveFact(fact);
          console.log(`✨ ${green}Saved semantic fact:${reset} "${key}" = "${val}" ${dim}(ID: ${fact.id})${reset}`);
        } catch (err: unknown) {
          console.error(`❌ Failed to save fact:`, err instanceof Error ? err.message : String(err));
        }
        rl.prompt();
        return;
      }

      if (cmd === 'delfact') {
        if (!rest) {
          console.log(`${yellow}Usage: /delfact <fact_id>${reset}`);
          rl.prompt();
          return;
        }
        try {
          const deleted = await memory.deleteFact(rest);
          if (deleted) {
            console.log(`🗑️ ${green}Deleted semantic fact:${reset} ${rest}`);
          } else {
            console.log(`⚠️ Fact not found: ${rest}`);
          }
        } catch (err: unknown) {
          console.error(`❌ Failed to delete fact:`, err instanceof Error ? err.message : String(err));
        }
        rl.prompt();
        return;
      }

      if (cmd === 'stats') {
        try {
          const skills = await memory.listSkills();
          const traces = await memory.getRecentTraces(100);
          const facts = await memory.listFacts({ limit: 1000 });
          const avgLatency = traces.length > 0 ? Math.round(traces.reduce((a, t) => a + t.latencyMs, 0) / traces.length) : 0;
          const totalTokens = traces.reduce((a, t) => a + (t.tokensUsed?.totalTokens || 0), 0);

          console.log(`\n${bold}📊 System Telemetry & Statistics:${reset}`);
          console.log(`  • Registered Skills  : ${green}${skills.length}${reset}`);
          console.log(`  • Semantic Facts     : ${cyan}${facts.length}${reset}`);
          console.log(`  • Episodic Traces    : ${yellow}${traces.length}${reset}`);
          console.log(`  • Avg Latency (100)  : ${magenta}${avgLatency}ms${reset}`);
          console.log(`  • Total Tokens Logged: ${totalTokens}`);
          console.log('');
        } catch (err: unknown) {
          console.error(`❌ Failed to fetch stats:`, err instanceof Error ? err.message : String(err));
        }
        rl.prompt();
        return;
      }

      if (cmd === 'model') {
        console.log(`\n${bold}🤖 Active LLM Configuration:${reset}`);
        console.log(`  • Provider       : ${cyan}${providerName}${reset}`);
        console.log(`  • Primary Model  : ${green}${modelName}${reset}`);
        console.log(`  • Fallback Model : ${(llm as any).fallbackModel || 'none'}`);
        console.log(`  • Token Budget   : <1,500 tokens / turn`);
        console.log(`  • Embedding Model: ${process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001'}\n`);
        rl.prompt();
        return;
      }

      if (cmd === 'evolve') {
        console.log(`\n🧠 Running on-demand Slow Path Evolution cycle...`);
        const start = Date.now();
        try {
          const report = await evolutionEngine.runEvolutionCycle({ traceLimit: 50, dryRun: false });
          console.log(`✨ Evolution finished in ${Date.now() - start}ms.`);
          console.log(`   Opportunities inspected: ${report.opportunitiesFound}`);
          console.log(`   Skills synthesized: ${report.skillsSynthesized.length}`);
          for (const s of report.skillsSynthesized) {
            console.log(`   • ${green}${s.name}${reset} (v${s.version})`);
          }
          console.log('');
        } catch (err: unknown) {
          console.error(`❌ Evolution cycle failed:`, err instanceof Error ? err.message : String(err));
        }
        rl.prompt();
        return;
      }

      if (cmd === 'history') {
        console.log(`\n${bold}💬 Conversation History (${Math.floor(history.length / 2)} turns):${reset}`);
        if (history.length === 0) {
          console.log(`  ${dim}No turns in current session yet.${reset}`);
        } else {
          for (let i = 0; i < history.length; i++) {
            const h = history[i];
            const roleColor = h.role === 'user' ? cyan : green;
            console.log(`  [${roleColor}${h.role.toUpperCase()}${reset}]: ${h.content.slice(0, 100)}${h.content.length > 100 ? '...' : ''}`);
          }
        }
        console.log('');
        rl.prompt();
        return;
      }

      if (cmd === 'reset') {
        history.length = 0;
        console.log(`🔄 ${green}Session conversation history cleared.${reset}\n`);
        rl.prompt();
        return;
      }

      if (cmd === 'clear') {
        console.clear();
        rl.prompt();
        return;
      }

      if (cmd === 'grounding' || cmd === 'search') {
        enableGrounding = !enableGrounding;
        console.log(`\n🌐 Google Search Grounding is now ${enableGrounding ? `${green}ENABLED${reset}` : `${yellow}DISABLED${reset}`}.\n`);
        rl.prompt();
        return;
      }

      console.log(`⚠️ Unknown slash command: "/${cmd}". Type ${yellow}/help${reset} for list of commands.`);
      rl.prompt();
      return;
    }

    // 3. Fast Path Agent Execution
    try {
      const start = Date.now();
      const result = await router.executeFastPath({
        sessionId,
        input: trimmed,
        history,
        enableSearchGrounding: enableGrounding,
      });

      console.log(`\n${result.output}\n`);

      if (result.groundingMetadata?.sources && result.groundingMetadata.sources.length > 0) {
        console.log(`${cyan}🌐 Verified Google Search Sources:${reset}`);
        for (const src of result.groundingMetadata.sources) {
          console.log(`  • ${src.title} (${dim}${src.url}${reset})`);
        }
        console.log('');
      }

      if (result.cachedContentUsed) {
        console.log(`${dim}[💾 Cache Hit: ${result.cachedContentUsed}]${reset}`);
      }

      const skillsStr = result.retrievedSkills.length > 0
        ? result.retrievedSkills.map((s) => s.name).join(', ')
        : 'none';
      const toolsStr = result.toolCallsMade.length > 0
        ? ` | 🛠️ Tools: ${result.toolCallsMade.map((t) => t.toolName).join(', ')}`
        : '';

      console.log(
        `${dim}[⚡ ${Date.now() - start}ms | ${result.tokensUsed.totalTokens} tokens (Prompt: ${result.tokensUsed.promptTokens}, Comp: ${result.tokensUsed.completionTokens}) | Skills: ${skillsStr}${toolsStr}]${reset}\n`
      );

      history.push({ role: 'user', content: trimmed });
      history.push({ role: 'assistant', content: result.output });
    } catch (err: unknown) {
      console.error('❌ Error:', err instanceof Error ? err.message : String(err));
    }

    rl.prompt();
  });
}

// Default action when running `talon` without subcommands
program.action(() => {
  console.log(`
  🦅  OPENTALON CLI (v0.1.0)
  Next-Generation Dual-Brain Autonomous AI Agent Framework
  
  Quick Commands:
    talon run "<prompt>"    Execute a single turn (<1,500 token budget)
    talon chat              Launch interactive multi-turn REPL chat
    talon serve             Start local daemon & Web Cockpit (http://127.0.0.1:3100)
    talon skills list       List all registered procedural skills
    talon memory list       View long-term semantic knowledge facts
    talon memory export     Export portable JSON memory snapshot
    talon mcp serve         Start Model Context Protocol stdio server
    talon swarm fanout      Run parallel multi-agent swarm task
  
  Run "talon --help" for all commands.
  `);
});

// 2. `talon run [prompt]`
program
  .command('run [prompt]')
  .description('Execute a single Fast Path agent turn (<1,500 token budget) or start interactive chat if omitted')
  .option('-s, --session <id>', 'Session identifier', `session_${Date.now()}`)
  .option('-g, --grounding', 'Enable native Google Search Grounding for verified real-time web knowledge', false)
  .option('--stream', 'Stream response tokens with typing pacing to stdout', false)
  .option('--json', 'Output machine-readable JSON result', false)
  .action(async (prompt: string | undefined, options: { session: string; stream: boolean; json: boolean; grounding: boolean }) => {
    if (!prompt) {
      console.log('💡 No prompt provided. Entering OpenTalon interactive chat...\n');
      return startInteractiveChat();
    }

    const { router } = getComponents();
    if (!options.json) {
      console.log(`\n🤖 [Fast Path] Input: "${prompt}" (Session: ${options.session})${options.grounding ? ' [Search Grounding Enabled]' : ''}`);
    }
    const start = Date.now();

    try {
      const result = await router.executeFastPath({
        sessionId: options.session,
        input: prompt,
        enableSearchGrounding: options.grounding,
      });

      if (options.json) {
        const sanitized = {
          ...result,
          retrievedSkills: result.retrievedSkills.map(({ embedding, ...rest }) => rest),
        };
        console.log(JSON.stringify(sanitized, null, 2));
        return;
      }

      if (options.stream) {
        console.log('\n--- Output (Streaming) ---');
        const words = result.output.split(/(\s+)/);
        for (const w of words) {
          process.stdout.write(w);
          if (w.trim().length > 0) {
            await new Promise((r) => setTimeout(r, 10));
          }
        }
        process.stdout.write('\n--------------------------\n');
      } else {
        console.log('\n--- Output ---');
        console.log(result.output);
        console.log('--------------');
      }

      console.log(`⏱️ Latency: ${result.latencyMs}ms | Total Elapsed: ${Date.now() - start}ms`);
      console.log(
        `📊 Tokens: ${result.tokensUsed.totalTokens} (Prompt: ${result.tokensUsed.promptTokens}, Completion: ${result.tokensUsed.completionTokens})`
      );
      if (result.cachedContentUsed) {
        console.log(`💾 Context Cache Hit: ${result.cachedContentUsed}`);
      }
      if (result.groundingMetadata?.sources && result.groundingMetadata.sources.length > 0) {
        console.log(`\n🌐 Verified Google Search Sources:`);
        for (const src of result.groundingMetadata.sources) {
          console.log(`  • ${src.title} (${src.url})`);
        }
      }
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
    await startInteractiveChat();
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
    console.log(`   Cron & Automations: Heartbeat Scheduler Active (1s ticks)`);
    console.log(`   Webhook Ingress: POST http://${options.host}:${port}/api/webhooks/:name`);
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
  .option('-s, --speculative <count>', 'Number of parallel speculative candidate drafts to benchmark in sandbox (1-5)', '1')
  .option('--dry-run', 'Inspect opportunities and validate synthesis in sandbox without committing to database', false)
  .option('--json', 'Output machine-readable JSON evolution report', false)
  .action(async (options: { limit: string; speculative: string; dryRun: boolean; json: boolean }) => {
    const limit = parseInt(options.limit, 10);
    const speculativeDraftCount = parseInt(options.speculative || '1', 10);
    const { evolutionEngine } = getComponents();

    const start = Date.now();
    const report = await evolutionEngine.runEvolutionCycle({
      traceLimit: limit,
      dryRun: options.dryRun,
      speculativeDraftCount,
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
  .command('call <toolName> [argsJson...]')
  .description('Invoke an MCP tool call directly')
  .action(async (toolName: string, argsJsonParts?: string[]) => {
    const { mcpServer, memory } = getComponents();
    await memory.initialize();

    const rawArgs = argsJsonParts && argsJsonParts.length > 0 ? argsJsonParts.join(' ') : '{}';
    let args = {};
    try {
      args = JSON.parse(rawArgs);
    } catch {
      try {
        args = JSON.parse(rawArgs.replace(/'/g, '"'));
      } catch {
        console.error('❌ Invalid JSON arguments string:', rawArgs);
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
  .command('install <urlOrTarget>')
  .description('Download, security audit, verify, and register a skill from a remote URL, GitHub, or Gist')
  .option('--overwrite', 'Overwrite existing skill with same name', false)
  .option('--force', 'Bypass capability safety audit warnings', false)
  .action(async (urlOrTarget: string, options: { overwrite: boolean; force: boolean }) => {
    const { memory } = getComponents();
    await memory.initialize();

    console.log(`\n📦 Fetching remote skill from: ${urlOrTarget}...`);
    try {
      const normalized = RemoteSkillInstaller.normalizeUrl(urlOrTarget);
      if (normalized !== urlOrTarget) {
        console.log(`🔗 Normalized target: ${normalized}`);
      }

      console.log('🛡️ Performing Zero-Trust capability audit...');
      console.log('🧪 Verifying execution isolate in sandbox...');

      const result = await RemoteSkillInstaller.install(urlOrTarget, memory, undefined, {
        overwrite: options.overwrite,
        force: options.force,
      });

      if (!result.success) {
        console.error(`\n❌ Installation failed: ${result.error}\n`);
        await memory.close();
        process.exit(1);
      }

      console.log(`\n========================================`);
      console.log(`✅ Successfully Installed Skill: \x1b[32m${result.skillName}\x1b[0m (v${result.version})`);
      console.log(`========================================`);
      console.log(`Description: ${result.description}`);
      console.log(`Source:      ${result.sourceUrl}`);
      console.log(`Hash:        ${result.hash?.slice(0, 16)}...`);
      if (result.audit.warnings.length > 0) {
        console.log(`⚠️ Warnings:  ${result.audit.warnings.join(' | ')}`);
      }
      console.log(`\n💡 Ready for execution via: "talon skills run ${result.skillName}"\n`);
    } catch (err: unknown) {
      console.error('\n❌ Installation error:', err instanceof Error ? err.message : String(err), '\n');
      process.exit(1);
    } finally {
      await memory.close();
    }
  });

skillsCommand
  .command('run <skillName> [argsJson...]')
  .description('Execute a registered procedural skill directly in the Zero-Trust Sandbox')
  .action(async (skillName: string, argsJsonParts?: string[]) => {
    const { memory, sandbox } = getComponents();
    await memory.initialize();

    const skill = await memory.getSkill(skillName);
    if (!skill) {
      console.error(`❌ Skill "${skillName}" not found in memory database.`);
      await memory.close();
      process.exit(1);
    }

    const rawArgs = argsJsonParts && argsJsonParts.length > 0 ? argsJsonParts.join(' ') : '{}';
    let parsedArgs: Record<string, unknown> = {};
    try {
      parsedArgs = JSON.parse(rawArgs);
    } catch {
      try {
        parsedArgs = JSON.parse(rawArgs.replace(/'/g, '"'));
      } catch {
        console.error('❌ Invalid JSON arguments string provided:', rawArgs);
        await memory.close();
        process.exit(1);
      }
    }

    console.log(`\n🧪 Executing skill [${skill.name} v${skill.version}] in Zero-Trust Sandbox...`);
    console.log(`   Arguments: ${JSON.stringify(parsedArgs)}`);
    console.log(`   Capabilities: ${JSON.stringify(skill.capabilities)}`);

    const executeWithChain = async (
      targetSkill: typeof skill,
      args: Record<string, unknown>,
      depth = 0
    ): Promise<any> => {
      return await sandbox.execute({
        code: targetSkill.code,
        args,
        capabilities: targetSkill.capabilities,
        timeoutMs: 5000,
        chainDepth: depth,
        callSkill: async (name: string, childArgs: Record<string, unknown>, d: number): Promise<unknown> => {
          const child = await memory.getSkill(name);
          if (!child) {
            throw new Error(`Chained skill "${name}" not found in procedural memory.`);
          }
          const res: any = await executeWithChain(child, childArgs, d);
          if (!res.success) {
            throw new Error(`Chained skill "${name}" failed: ${res.error}`);
          }
          return res.data;
        },
      });
    };

    const start = Date.now();
    const result = await executeWithChain(skill, parsedArgs, 0);
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

skillsCommand
  .command('history <skillName>')
  .description('View chronological revision history and audit log for a procedural skill')
  .action(async (skillName: string) => {
    const { memory } = getComponents();
    await memory.initialize();

    const revisions = await memory.getSkillRevisions(skillName);
    await memory.close();

    console.log(`\n📜 Revision History for Skill "${skillName}" (${revisions.length} revision(s)):`);
    if (revisions.length === 0) {
      console.log('   No revision records found for this skill.');
      return;
    }

    for (let i = 0; i < revisions.length; i++) {
      const rev = revisions[i];
      const isLatest = i === 0 ? ' [CURRENT/ACTIVE]' : '';
      console.log(`\n  • Revision #${revisions.length - i}: v${rev.version}${isLatest}`);
      console.log(`    Date:         ${new Date(rev.timestamp).toISOString()}`);
      console.log(`    Hash:         ${rev.hash}`);
      console.log(`    Description:  ${rev.description}`);
      console.log(`    Capabilities: ${JSON.stringify(rev.capabilities)}`);
    }
    console.log('\n💡 Roll back anytime using: talon skills rollback <skillName> <version|hash>\n');
  });

skillsCommand
  .command('rollback <skillName> <target>')
  .description('Roll back a procedural skill to a previous version, hash, or revision ID')
  .action(async (skillName: string, target: string) => {
    const { memory } = getComponents();
    await memory.initialize();

    try {
      console.log(`🔄 Rolling back skill "${skillName}" to revision matching "${target}"...`);
      const restored = await memory.rollbackSkill(skillName, target);
      console.log(`✅ Successfully restored skill "${restored.name}" to v${restored.version} [Hash: ${restored.hash.slice(0, 10)}...]`);
      console.log(`   Description: ${restored.description}`);
    } catch (err: unknown) {
      console.error('❌ Rollback failed:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    } finally {
      await memory.close();
    }
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

memoryCommand
  .command('export [filePath]')
  .description('Export complete memory state (skills, facts, traces) to a JSON snapshot file')
  .option('--include-traces', 'Include episodic execution traces in the export', false)
  .action(async (filePath?: string, options?: { includeTraces: boolean }) => {
    const { memory } = getComponents();
    await memory.initialize();

    const targetPath = filePath
      ? path.resolve(filePath)
      : path.resolve(process.cwd(), `opentalon-memory-snapshot-${Date.now()}.json`);

    console.log(`\n📦 Exporting memory snapshot...`);
    const snapshot = await memory.exportSnapshot({ includeTraces: options?.includeTraces });
    await memory.close();

    fs.writeFileSync(targetPath, JSON.stringify(snapshot, null, 2), 'utf-8');
    console.log(`✅ Snapshot saved to: ${targetPath}`);
    console.log(`   • Skills: ${snapshot.skills.length}`);
    console.log(`   • Facts:  ${snapshot.facts.length}`);
    console.log(`   • Traces: ${snapshot.traces?.length ?? 0}\n`);
  });

memoryCommand
  .command('import <filePath>')
  .description('Import memory snapshot from a JSON file into active libSQL database')
  .option('--overwrite', 'Overwrite existing skills with same name', false)
  .action(async (filePath: string, options: { overwrite: boolean }) => {
    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ Snapshot file not found: ${fullPath}`);
      process.exit(1);
    }

    let snapshot;
    try {
      snapshot = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    } catch {
      console.error(`❌ Invalid JSON in snapshot file: ${fullPath}`);
      process.exit(1);
    }

    const { memory } = getComponents();
    await memory.initialize();

    console.log(`\n📥 Importing memory snapshot from: ${fullPath}...`);
    const res = await memory.importSnapshot(snapshot, { overwrite: options.overwrite });
    await memory.close();

    console.log(`✅ Successfully restored:`);
    console.log(`   • Skills: ${res.importedSkills}`);
    console.log(`   • Facts:  ${res.importedFacts}`);
    console.log(`   • Traces: ${res.importedTraces}\n`);
  });

// 12. `talon providers`
program
  .command('providers')
  .description('Inspect active multi-model cascading providers and circuit breaker health')
  .action(async () => {
    const { llm } = getComponents();
    console.log('\n🤖 \x1b[1mOpenTalon Multi-Model Provider Cascade Status\x1b[0m\n');

    if (llm instanceof CascadingLLMDriver) {
      const statuses = llm.getProvidersStatus();
      console.log('Active Providers (ordered by priority):\n');
      console.log(
        '  ' +
          'Priority'.padEnd(10) +
          'Provider'.padEnd(14) +
          'Health'.padEnd(16) +
          'Successes'.padEnd(12) +
          'Failures'.padEnd(12) +
          'Cooldown Until'
      );
      console.log('  ' + '─'.repeat(80));

      for (const s of statuses) {
        const healthBadge = s.healthy
          ? '\x1b[32m● HEALTHY\x1b[0m'
          : '\x1b[31m▲ COOLDOWN\x1b[0m';
        const cooldownStr = s.cooldownUntil > Date.now()
          ? `In ${Math.ceil((s.cooldownUntil - Date.now()) / 1000)}s`
          : 'None';

        console.log(
          '  ' +
            String(s.priority).padEnd(10) +
            s.name.padEnd(14) +
            healthBadge.padEnd(25) +
            String(s.successCount).padEnd(12) +
            String(s.failureCount).padEnd(12) +
            cooldownStr
        );
      }
      console.log('\n💡 Cascading automatically shifts traffic to lower priority providers on error or 429.\n');
    } else {
      console.log('  Running in single provider mode: ' + (llm.constructor ? llm.constructor.name : 'Unknown'));
      console.log('  Configure GEMINI_API_KEY, ANTHROPIC_API_KEY, DEEPSEEK_API_KEY, OPENAI_API_KEY, or OLLAMA_MODEL in .env to activate the full multi-model cascade.\n');
    }
  });

// 13. `talon cron` / `talon schedule`
const cronCommand = program
  .command('cron')
  .alias('schedule')
  .description('Manage autonomous background scheduled jobs, cron triggers, and proactive watcher automations');

// talon cron list
cronCommand
  .command('list')
  .description('List all registered scheduled automations and their next execution time')
  .action(async () => {
    const { memory } = getComponents();
    await memory.initialize();
    const jobs = await memory.listJobs();
    await memory.close();

    console.log(`\n⏰ OpenTalon Scheduled Automations (${jobs.length} registered):\n`);
    if (jobs.length === 0) {
      console.log('   No scheduled automations registered.');
      console.log('   Create one with: talon cron add --name <name> --cron "<expr>" --prompt "<prompt>"');
      console.log('   Or add a 0-token skill: talon cron add --name <name> --cron "<expr>" --skill <skillName>\n');
      return;
    }

    console.log(
      '  ' +
        'Status'.padEnd(10) +
        'Name'.padEnd(26) +
        'Schedule'.padEnd(16) +
        'Action'.padEnd(18) +
        'Next Run'.padEnd(22) +
        'Last Status'
    );
    console.log('  ' + '─'.repeat(95));

    for (const j of jobs) {
      const isPaused = j.status === 'paused';
      const statusBadge = isPaused ? '\x1b[33mPAUSED\x1b[0m' : '\x1b[32mACTIVE\x1b[0m';
      const typeStr = j.actionType === 'prompt' ? '\x1b[35mPrompt\x1b[0m' : '\x1b[36mSkill (0 tok)\x1b[0m';
      const nextRunStr = j.nextRunAt ? new Date(j.nextRunAt).toLocaleString() : 'N/A';
      const lastStatus = j.lastStatus ? j.lastStatus.toUpperCase() : 'PENDING';

      console.log(
        '  ' +
          statusBadge.padEnd(19) +
          j.name.padEnd(26) +
          j.cron.padEnd(16) +
          typeStr.padEnd(27) +
          nextRunStr.padEnd(22) +
          lastStatus
      );
    }
    console.log('\n💡 Background jobs execute autonomously inside "talon serve" daemon.\n');
  });

// talon cron add
cronCommand
  .command('add')
  .description('Register a new background automation (Prompt AI action or direct 0-token Skill action)')
  .requiredOption('-n, --name <name>', 'Unique automation name slug (e.g. hourly-health)')
  .requiredOption('-c, --cron <expression>', 'Cron expression (e.g. "*/15 * * * *", "@hourly", "every 30m")')
  .option('-p, --prompt <prompt>', 'AI instruction for Prompt Action')
  .option('-s, --skill <skillName>', 'Registered skill name for Direct Skill Action (0 tokens)')
  .option('-a, --args <json>', 'JSON arguments for skill action', '{}')
  .option('--timeout <ms>', 'Execution timeout in ms', '30000')
  .option('--retries <count>', 'Max consecutive retries before auto-pause', '3')
  .action(
    async (options: {
      name: string;
      cron: string;
      prompt?: string;
      skill?: string;
      args: string;
      timeout: string;
      retries: string;
    }) => {
      const { scheduler, memory } = getComponents();
      await memory.initialize();

      if (!options.prompt && !options.skill) {
        console.error('❌ You must provide either --prompt "<instruction>" or --skill <skillName>.');
        await memory.close();
        process.exit(1);
      }

      const actionType: 'prompt' | 'skill' = options.skill ? 'skill' : 'prompt';
      let actionPayload: Record<string, unknown> = {};

      if (actionType === 'skill') {
        let parsedArgs = {};
        try {
          parsedArgs = JSON.parse(options.args);
        } catch {
          try {
            parsedArgs = JSON.parse(options.args.replace(/'/g, '"'));
          } catch {
            try {
              const fixed = options.args.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
              parsedArgs = JSON.parse(fixed);
            } catch {
              console.error('❌ Invalid JSON in --args:', options.args);
              await memory.close();
              process.exit(1);
            }
          }
        }
        actionPayload = { skillName: options.skill, args: parsedArgs };
      } else {
        actionPayload = { prompt: options.prompt };
      }

      try {
        const job = await scheduler.registerJob({
          name: options.name,
          cron: options.cron,
          actionType,
          actionPayload,
          status: 'active',
          timeoutMs: parseInt(options.timeout, 10),
          maxRetries: parseInt(options.retries, 10),
          notifyChannels: ['sse'],
        });
        await memory.close();

        console.log(`\n✅ Registered new scheduled automation:`);
        console.log(`   ID:        ${job.id}`);
        console.log(`   Name:      ${job.name}`);
        console.log(`   Schedule:  ${job.cron}`);
        console.log(`   Action:    ${job.actionType.toUpperCase()}`);
        console.log(`   Next Run:  ${job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : 'N/A'}`);
        console.log(`\n💡 To trigger immediately: talon cron trigger ${job.name}\n`);
      } catch (err: unknown) {
        console.error('❌ Failed to register job:', err instanceof Error ? err.message : String(err));
        await memory.close();
        process.exit(1);
      }
    }
  );

// talon cron trigger <idOrName>
cronCommand
  .command('trigger <idOrName>')
  .description('Trigger a scheduled automation immediately on demand')
  .action(async (idOrName: string) => {
    const { scheduler, memory } = getComponents();
    await memory.initialize();

    console.log(`\n⚡ Triggering scheduled automation "${idOrName}"...`);
    try {
      const log = await scheduler.triggerJob(idOrName);
      await memory.close();

      console.log(`\n--- Execution Result (${log.durationMs}ms) ---`);
      console.log(`Status:      ${log.status === 'success' ? '✅ SUCCESS' : '❌ ' + log.status.toUpperCase()}`);
      console.log(`Tokens Used: ${log.tokensUsed}`);
      if (log.output) {
        console.log(`Output:`);
        console.log(log.output);
      }
      if (log.errorMessage) {
        console.log(`Error: ${log.errorMessage}`);
      }
      console.log('-------------------------------------\n');
    } catch (err: unknown) {
      console.error('❌ Trigger failed:', err instanceof Error ? err.message : String(err));
      await memory.close();
      process.exit(1);
    }
  });

// talon cron pause <idOrName>
cronCommand
  .command('pause <idOrName>')
  .description('Pause a scheduled automation')
  .action(async (idOrName: string) => {
    const { scheduler, memory } = getComponents();
    await memory.initialize();
    try {
      const job = await scheduler.toggleJob(idOrName, false);
      await memory.close();
      console.log(`\n⏸️  Paused automation "${job.name}".\n`);
    } catch (err: unknown) {
      console.error('❌ Pause failed:', err instanceof Error ? err.message : String(err));
      await memory.close();
      process.exit(1);
    }
  });

// talon cron resume <idOrName>
cronCommand
  .command('resume <idOrName>')
  .description('Resume a paused scheduled automation')
  .action(async (idOrName: string) => {
    const { scheduler, memory } = getComponents();
    await memory.initialize();
    try {
      const job = await scheduler.toggleJob(idOrName, true);
      await memory.close();
      console.log(
        `\n▶️  Resumed automation "${job.name}". Next run: ${
          job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : 'N/A'
        }\n`
      );
    } catch (err: unknown) {
      console.error('❌ Resume failed:', err instanceof Error ? err.message : String(err));
      await memory.close();
      process.exit(1);
    }
  });

// talon cron remove <idOrName> / delete
cronCommand
  .command('remove <idOrName>')
  .alias('delete')
  .description('Delete a scheduled automation')
  .action(async (idOrName: string) => {
    const { scheduler, memory } = getComponents();
    await memory.initialize();
    try {
      const deleted = await scheduler.deleteJob(idOrName);
      await memory.close();
      if (deleted) {
        console.log(`\n🗑️  Successfully removed automation "${idOrName}".\n`);
      } else {
        console.log(`\n❌ Automation "${idOrName}" not found.\n`);
      }
    } catch (err: unknown) {
      console.error('❌ Delete failed:', err instanceof Error ? err.message : String(err));
      await memory.close();
      process.exit(1);
    }
  });

// talon cron logs [idOrName]
cronCommand
  .command('logs [idOrName]')
  .description('View execution audit logs of scheduled automations')
  .option('-l, --limit <count>', 'Maximum logs to display', '25')
  .action(async (idOrName?: string, options?: { limit: string }) => {
    const { memory } = getComponents();
    await memory.initialize();
    const limit = parseInt(options?.limit || '25', 10);
    let targetJobId: string | undefined = undefined;
    if (idOrName) {
      const job = await memory.getJob(idOrName);
      targetJobId = job ? job.id : idOrName;
    }
    const logs = await memory.getJobLogs(targetJobId, limit);
    await memory.close();

    console.log(`\n📜 OpenTalon Background Execution Logs (${logs.length} entries):\n`);
    if (logs.length === 0) {
      console.log('   No background execution logs recorded yet.\n');
      return;
    }

    console.log(
      '  ' +
        'Time'.padEnd(20) +
        'Job ID'.padEnd(16) +
        'Status'.padEnd(12) +
        'Duration'.padEnd(12) +
        'Tokens'.padEnd(10) +
        'Detail'
    );
    console.log('  ' + '─'.repeat(85));

    for (const l of logs) {
      const timeStr = new Date(l.startedAt).toLocaleTimeString();
      const statusBadge =
        l.status === 'success' ? '\x1b[32mSUCCESS\x1b[0m' : '\x1b[31m' + l.status.toUpperCase() + '\x1b[0m';
      const durStr = l.durationMs != null ? `${l.durationMs}ms` : '--';
      const detail = l.errorMessage || l.output || '';
      const preview = detail.length > 30 ? detail.slice(0, 30) + '...' : detail;

      console.log(
        '  ' +
          timeStr.padEnd(20) +
          l.jobId.slice(0, 14).padEnd(16) +
          statusBadge.padEnd(21) +
          durStr.padEnd(12) +
          String(l.tokensUsed).padEnd(10) +
          preview
      );
    }
    console.log('');
  });

// 12. `talon cache` & `talon booster`
const cacheCommand = program
  .command('cache')
  .description('Manage Gemini autonomous context caching and prompt prefixes');

cacheCommand
  .command('status')
  .description('Check Gemini context caching configuration and active thresholds')
  .action(() => {
    console.log(`
🧠 Gemini Autonomous Context Caching (2026 Edition):
  • Min Threshold : 32,768 tokens (~120k characters)
  • Default TTL   : 3,600s (1 hour)
  • Cost Savings  : 75% to 90% discount on cached input tokens
  • Invalidation  : Automatic SHA-256 content drift detection
  • Active Model  : ${process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite / gemini-4-pro'}
`);
  });

const boosterCommand = program
  .command('booster')
  .description('Gemini Agent Booster v0.3.0 — O(1) Thinking Budget Evaluator & Canonical KV-Cache Inspector');

boosterCommand
  .command('evaluate <prompt...>')
  .description('Evaluate task entropy score, thinking tier, and System-2 thinkingBudget for a prompt')
  .option('-t, --tools <count>', 'Simulated number of active tools', '0')
  .option('-r, --retry', 'Simulate sandbox self-correction retry escalation', false)
  .action((promptParts: string[], options: { tools: string; retry: boolean }) => {
    const input = promptParts.join(' ');
    const toolCount = parseInt(options.tools || '0', 10);
    const result = ThinkingBudgetCalculator.evaluate({
      input,
      toolCount,
      isRetry: Boolean(options.retry),
    });

    console.log(`
🚀 Gemini Agent Booster — Task Entropy Evaluation:
  • Input Prompt   : "${input}"
  • Entropy Score  : ${result.entropyScore} / 100
  • Reasoning Tier : ${result.tier.toUpperCase()} (${result.mode} mode)
  • Thinking Budget: ${result.thinkingBudget.toLocaleString()} tokens
  • Active Signals : ${result.reasons.join(', ')}
`);
  });

boosterCommand
  .command('status')
  .description('Query live booster & KV-cache telemetry from running daemon (or local config)')
  .action(async () => {
    try {
      const res = await fetch('http://127.0.0.1:3100/api/booster/stats');
      if (res.ok) {
        const stats = (await res.json()) as Record<string, unknown>;
        console.log(`
⚡ Live Daemon Gemini Agent Booster Telemetry (http://127.0.0.1:3100):
  • Fast Path Turns       : ${stats.fastPathTurnsCount ?? 0}
  • Avg Thinking Budget   : ${stats.avgThinkingBudget ?? 0} tokens
  • Tracked Prefixes      : ${stats.trackedPrefixes ?? 0} (Max 200 LRU)
  • Canonical Prefix Hits : ${stats.prefixHits ?? 0}
  • Explicit Cache Hits   : ${stats.cacheHits ?? 0}
  • Est. Tokens Saved     : ${stats.estimatedTokensSaved ?? 0} tokens
`);
        return;
      }
    } catch {
      // Daemon not reachable or not updated yet
    }
    console.log(`
⚡ Gemini Agent Booster v0.3.0 (Configuration):
  • Thinking Budget Engine: Active (O(1) Zero-Latency Heuristic)
  • Canonical Prefix Sort : Active (Alphabetical Tool + Fact SHA-256 Pinning)
  • Explicit Cache Floor  : 32,768 tokens (75%–90% discount)
  • Fallback Invariant    : gemini-4-pro / gemini-4-argon -> gemini-3.8-flash
`);
  });

// 12c. `talon finops`
program
  .command('finops')
  .description('Inspect Sovereign FinOps Cost Envelope, per-model token spend, and KV-cache USD savings')
  .action(async () => {
    try {
      const res = await fetch('http://127.0.0.1:3100/api/finops/report');
      if (res.ok) {
        const rep = (await res.json()) as Record<string, any>;
        console.log(`
💰 OpenTalon Sovereign FinOps Report (Live Daemon):
  • Total LLM Calls      : ${rep.totalCalls ?? 0}
  • Prompt Tokens        : ${(rep.totalPromptTokens ?? 0).toLocaleString()}
  • Completion Tokens    : ${(rep.totalCompletionTokens ?? 0).toLocaleString()}
  • System-2 Thinking    : ${(rep.totalThinkingTokens ?? 0).toLocaleString()}
  • KV-Cache Saved Tokens: ${(rep.totalCachedTokensSaved ?? 0).toLocaleString()}
  • Estimated Spend (USD): $${Number(rep.totalEstimatedCostUsd ?? 0).toFixed(6)}
  • Estimated Saved (USD): $${Number(rep.totalEstimatedSavingsUsd ?? 0).toFixed(6)}
  • Daily Envelope Usage : ${rep.budgetUtilizationPct ?? 0}% (Frugal Throttle: ${rep.frugalThrottleActive ? 'ACTIVE' : 'OFF'})
`);
        return;
      }
    } catch {
      // Daemon offline or older version
    }
    console.log(`
💰 OpenTalon Sovereign FinOps Governance:
  • Daily Token Envelope : 2,000,000 tokens / day
  • Daily Cost Ceiling   : $5.00 USD / day
  • Frugal Throttle Gate : 80% utilization (auto-caps thinkingBudget <= 2,048)
  • KV-Cache Discount    : 75% to 90% on canonical prefix & cachedContent hits
`);
  });

// 13. `talon analyze [dir]` (Monolithic Whole-Repo Ingestion & Gemini Context Caching)
program
  .command('analyze [dir]')
  .description('Perform whole-repo monolithic AST and codebase ingestion with Gemini 4 Pro 2M+ Context Caching')
  .option('-m, --model <model>', 'Target reasoning model', 'gemini-4-pro')
  .option('--ttl <seconds>', 'Context cache TTL in seconds', '3600')
  .action(async (dir = '.', options: { model: string; ttl: string }) => {
    console.log(`\n🔍 [Monolithic Codebase Analysis] Ingesting workspace: "${dir}"...`);
    const ttlSeconds = parseInt(options.ttl, 10);
    const targetModel = options.model;

    const ignoredDirs = new Set(['node_modules', '.git', 'dist', '.cache', 'coverage', '.turbo', '.next']);
    const allowedExts = new Set([
      '.ts', '.js', '.mjs', '.json', '.md', '.sql', '.yaml', '.yml', '.env.example', '.html', '.css'
    ]);

    const collectedFiles: Array<{ relPath: string; content: string }> = [];

    function scan(currentPath: string) {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!ignoredDirs.has(entry.name)) {
            scan(path.join(currentPath, entry.name));
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (allowedExts.has(ext)) {
            const fullPath = path.join(currentPath, entry.name);
            try {
              const stat = fs.statSync(fullPath);
              if (stat.size < 500 * 1024) {
                const content = fs.readFileSync(fullPath, 'utf8');
                const relPath = path.relative(dir, fullPath).replace(/\\/g, '/');
                collectedFiles.push({ relPath, content });
              }
            } catch {
              // Ignore unreadable files
            }
          }
        }
      }
    }

    try {
      scan(path.resolve(dir));
    } catch (err: unknown) {
      console.error(`❌ Scan failed:`, err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    console.log(`📂 Ingested ${collectedFiles.length} source files.`);

    let monolithicDump = `=== MONOLITHIC CODEBASE DUMP: ${path.resolve(dir)} ===\n\n`;
    for (const f of collectedFiles) {
      monolithicDump += `--- FILE: ${f.relPath} ---\n${f.content}\n\n`;
    }

    const approxTokens = Math.ceil(monolithicDump.length / 3.8);
    console.log(`📊 Total Payload: ${monolithicDump.length.toLocaleString()} characters (~${approxTokens.toLocaleString()} tokens).`);

    if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
      console.log(`\n⚠️ GEMINI_API_KEY is not set. Context Caching requires a valid Google Gemini API key.`);
      console.log(`💡 Export GEMINI_API_KEY="your-key" to pin this monolithic dump to Google Generative Language API.\n`);
      return;
    }

    const driver = new GeminiDriver({
      primaryModel: targetModel,
      fallbackModel: 'gemini-3.8-flash',
    });

    const cacheManager = new ContextCacheManager({
      driver,
      minTokenThreshold: 1000,
    });

    console.log(`🧠 Pinning monolithic context to Gemini API (${targetModel}) with TTL ${ttlSeconds}s...`);
    const cacheName = await cacheManager.getOrCreateCache(monolithicDump, {
      model: targetModel,
      ttlSeconds,
      displayName: `talon_repo_${path.basename(path.resolve(dir))}`,
    });

    if (cacheName) {
      console.log(`\n✅ Context Cache Created Successfully!`);
      console.log(`   Cache ID : ${cacheName}`);
      console.log(`   Model    : ${targetModel} (2M+ Monolithic Context)`);
      console.log(`   Discount : 75%–90% cost reduction on subsequent turns`);
      console.log(`   TTL      : ${ttlSeconds}s (${Math.round(ttlSeconds / 60)} minutes)\n`);
      console.log(`💡 Tip: The whole repository is now cached in Google AI infrastructure with zero loss!\n`);
    } else {
      console.log(`⚠️ Context Cache could not be provisioned (Check API permissions or model availability).\n`);
    }
  });

program.parse(process.argv);

