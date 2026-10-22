# SPEC-03: Zero-Trust Skill Sandbox Specification

## 1. Threat Model & Security Posture
OpenTalon mandates strict containment of all synthesized and community-contributed skills to prevent:
1. **Arbitrary Code Execution**: Skills cannot access the host file system or execute arbitrary shell commands unless explicitly granted.
2. **Data Exfiltration**: Network access (`fetch`, sockets) is denied by default and restricted strictly to declared domains.
3. **Denial of Service / Infinite Loops**: CPU execution is bounded by timeout limits (default 5,000ms) and memory limits (default 16MB).

---

## 2. Capability Matrix & Contract

A skill must define its required permissions via static metadata:

```typescript
export interface SkillCapabilities {
  net?: {
    allowedHosts: string[]; // e.g. ["api.github.com", "weather.service.net"]
    allowHttp?: boolean;   // default false (HTTPS only)
  };
  fs?: {
    readPaths: string[];   // Sandboxed paths or virtual root
    writePaths: string[];
  };
  env?: string[];          // Allowed environment variable keys only
}
```

---

## 3. Sandboxed Execution Interface

```typescript
export interface SandboxExecutionOptions {
  code: string;
  entrypoint?: string;
  args?: Record<string, unknown>;
  capabilities: SkillCapabilities;
  timeoutMs?: number;
  memoryLimitBytes?: number;
}

export interface SandboxExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  logs: string[];
  durationMs: number;
  memoryUsedBytes: number;
}

export interface SkillSandboxPort {
  execute(options: SandboxExecutionOptions): Promise<SandboxExecutionResult>;
}
```

---

## 4. Invariant Rules
1. **No Access to Host Global Scope**: `process.exit`, `process.env`, `require('child_process')`, `fs`, `eval` are stripped or neutralized in the guest isolate.
2. **Capability Interceptors**: Virtualized `fetch` and virtualized filesystem drivers validate all requests against the `SkillCapabilities` whitelist before dispatching.
3. **Deterministic Serialization**: Inputs and outputs must be JSON-serializable to ensure zero memory sharing between host and guest environments.
