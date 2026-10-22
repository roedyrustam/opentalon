import { describe, it, expect } from 'vitest';
import {
  CapabilityValidator,
  CapabilityViolationError,
  SandboxedVmRunner,
  SkillMarkdownParser,
  SkillVersionManager,
  SkillSynthesizer,
} from '../index.js';

describe('Skill Engine - Capability Validator', () => {
  it('allows whitelisted domains and denies unlisted domains', () => {
    const netGrant = {
      allowedHosts: ['api.github.com', '*.openai.com'],
      allowHttp: false,
    };

    expect(() =>
      CapabilityValidator.assertNetworkAllowed('https://api.github.com/repos', netGrant)
    ).not.toThrow();

    expect(() =>
      CapabilityValidator.assertNetworkAllowed('https://api.openai.com/v1', netGrant)
    ).not.toThrow();

    expect(() =>
      CapabilityValidator.assertNetworkAllowed('https://evil-site.com', netGrant)
    ).toThrow(CapabilityViolationError);

    // Insecure HTTP disallowed
    expect(() =>
      CapabilityValidator.assertNetworkAllowed('http://api.github.com', netGrant)
    ).toThrow(CapabilityViolationError);
  });

  it('validates environment variable access', () => {
    const envGrant = ['API_KEY', 'NODE_ENV'];
    expect(() => CapabilityValidator.assertEnvAllowed('API_KEY', envGrant)).not.toThrow();
    expect(() => CapabilityValidator.assertEnvAllowed('SECRET_TOKEN', envGrant)).toThrow(
      CapabilityViolationError
    );
  });
});

describe('Skill Engine - Zero-Trust Sandbox Runner', () => {
  const sandbox = new SandboxedVmRunner();

  it('executes safe JavaScript code and returns results', async () => {
    const code = `
      export default async function run(args) {
        console.log("Computing sum");
        return { sum: args.a + args.b };
      }
    `;

    const result = await sandbox.execute({
      code,
      args: { a: 10, b: 25 },
      capabilities: {},
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ sum: 35 });
    expect(result.logs).toContain('Computing sum');
  });

  it('blocks access to host process and dangerous globals', async () => {
    const code = `
      export default async function run() {
        return typeof process;
      }
    `;

    const result = await sandbox.execute({
      code,
      capabilities: {},
    });

    expect(result.success).toBe(true);
    expect(result.data).toBe('undefined');
  });

  it('enforces execution timeout', async () => {
    const infiniteLoopCode = `
      export default async function run() {
        while(true) {}
      }
    `;

    const result = await sandbox.execute({
      code: infiniteLoopCode,
      capabilities: {},
      timeoutMs: 100,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/timed out/i);
  });
});

describe('Skill Engine - Markdown Parser & Serializer', () => {
  it('parses and serializes SKILL.md accurately', () => {
    const rawMarkdown = `---
name: calculate_tax
version: 1.0.0
description: "Calculates total tax for e-commerce checkout"
capabilities: {"net":{"allowedHosts":[],"allowHttp":false}}
---

# calculate_tax
Calculates sales tax based on amount and rate.

## Implementation

\`\`\`javascript
export default async function run(args) {
  return { tax: args.amount * args.rate };
}
\`\`\`
`;

    const parsed = SkillMarkdownParser.parse(rawMarkdown);
    expect(parsed.metadata.name).toBe('calculate_tax');
    expect(parsed.metadata.version).toBe('1.0.0');
    expect(parsed.executableCode).toContain('args.amount * args.rate');

    const serialized = SkillMarkdownParser.serialize(parsed);
    expect(serialized).toContain('name: calculate_tax');
    expect(serialized).toContain('```javascript');
  });
});

describe('Skill Engine - Version Manager & Rollback', () => {
  it('tracks version commits and supports rollback', () => {
    const vm = new SkillVersionManager();
    const c1 = vm.commit('skill-calc', '1.0.0', 'code v1', 'initial release');
    const c2 = vm.commit('skill-calc', '1.0.1', 'code v2', 'bugfix release');

    expect(c1.hash).toBeDefined();
    expect(c2.hash).not.toBe(c1.hash);

    const rollbackResult = vm.rollback('skill-calc', 'Regression detected in v1.0.1');
    expect(rollbackResult.success).toBe(true);
    expect(rollbackResult.currentVersion).toBe('1.0.0');
    expect(rollbackResult.previousVersion).toBe('1.0.1');
  });
});

describe('Skill Engine - Synthesizer with Test Fixtures', () => {
  it('synthesizes and validates skill candidate', async () => {
    const synth = new SkillSynthesizer();
    const candidate = {
      name: 'reverse_string',
      description: 'Reverses an input string',
      code: `
        export default async function run(args) {
          return { reversed: args.text.split('').reverse().join('') };
        }
      `,
      capabilities: {},
      testCases: [
        {
          args: { text: 'hello' },
          expected: { reversed: 'olleh' },
        },
      ],
    };

    const result = await synth.synthesize(candidate, '1.0.0');
    expect(result.success).toBe(true);
    expect(result.markdown).toBeDefined();
    expect(result.skillDocument?.metadata.name).toBe('reverse_string');
  });
});
