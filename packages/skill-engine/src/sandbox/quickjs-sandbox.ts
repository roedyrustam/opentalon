import vm from 'node:vm';
import {
  type ISkillSandbox,
  type SandboxExecutionOptions,
  type SandboxExecutionResult,
} from '../types.js';
import { CapabilityValidator } from './capability-validator.js';
import { VirtualFs } from './virtual-fs.js';

export class SandboxedVmRunner implements ISkillSandbox {
  public async execute(options: SandboxExecutionOptions): Promise<SandboxExecutionResult> {
    const startTime = Date.now();
    const logs: string[] = [];
    const timeoutMs = options.timeoutMs ?? 5000;

    try {
      // Sandboxed virtualized console
      const virtualConsole = {
        log: (...args: unknown[]) => logs.push(args.map((a) => String(a)).join(' ')),
        error: (...args: unknown[]) => logs.push(`[ERROR] ${args.map((a) => String(a)).join(' ')}`),
        warn: (...args: unknown[]) => logs.push(`[WARN] ${args.map((a) => String(a)).join(' ')}`),
        info: (...args: unknown[]) => logs.push(`[INFO] ${args.map((a) => String(a)).join(' ')}`),
      };

      // Sandboxed virtualized fetch with network capability gating
      const virtualFetch = async (input: string | URL | Request, init?: RequestInit) => {
        const urlString = typeof input === 'string' ? input : input.toString();
        CapabilityValidator.assertNetworkAllowed(urlString, options.capabilities.net);
        return await fetch(input, init);
      };

      // Sandboxed virtualized env
      const virtualEnv = new Proxy<Record<string, string | undefined>>({}, {
        get: (_target, prop: string) => {
          CapabilityValidator.assertEnvAllowed(prop, options.capabilities.env);
          return process.env[prop];
        },
      });

      // Sandboxed virtualized filesystem
      const virtualFs = new VirtualFs(options.capabilities.fs);

      // Construct sandboxed context
      const sandboxContext = vm.createContext({
        console: virtualConsole,
        fetch: virtualFetch,
        env: virtualEnv,
        fs: {
          readFile: (p: string) => virtualFs.readFile(p),
          writeFile: (p: string, c: string) => virtualFs.writeFile(p, c),
          exists: (p: string) => virtualFs.exists(p),
          listFiles: (dir?: string) => virtualFs.listFiles(dir),
          deleteFile: (p: string) => virtualFs.deleteFile(p),
        },
        args: options.args ?? {},
        setTimeout,
        clearTimeout,
        JSON,
        Math,
        Date,
        Array,
        Object,
        String,
        Number,
        Boolean,
        RegExp,
        Promise,
        Error,
        Map,
        Set,
        // Block dangerous global objects
        process: undefined,
        require: undefined,
        module: undefined,
        global: undefined,
      });

      // Wrap code into an async execution harness
      // Supports both `export default async function(args) {...}` and direct script execution
      let scriptCode = options.code.trim();
      if (scriptCode.includes('export default')) {
        // Transpile ES default export to in-isolate runnable function
        scriptCode = scriptCode.replace(/export\s+default\s+(async\s+function|function)?/, 'return async function');
      }

      const harness = `
        (async () => {
          const fn = (function() {
            ${scriptCode}
          })();
          if (typeof fn === 'function') {
            return await fn(args);
          }
          return fn;
        })()
      `;

      const script = new vm.Script(harness, {
        filename: 'sandboxed-skill.js',
      });

      const executionPromise = script.runInContext(sandboxContext, {
        timeout: timeoutMs,
      }) as Promise<unknown>;

      const data = await Promise.race([
        executionPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Execution timed out after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);

      const durationMs = Date.now() - startTime;
      return {
        success: true,
        data,
        logs,
        durationMs,
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: errorMsg,
        logs,
        durationMs,
      };
    }
  }
}
