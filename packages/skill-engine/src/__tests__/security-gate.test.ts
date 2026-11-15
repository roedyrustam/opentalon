import { describe, it, expect } from 'vitest';
import {
  CapabilityValidator,
  SandboxedVmRunner,
  SecurityGate,
  SkillSynthesizer,
} from '../index.js';

describe('Zero-Trust SecurityGate & SSRF Sandbox Shield (v0.7.0)', () => {
  it('passes clean procedural skill code with score 100', () => {
    const cleanCode = `
      export default async function run(args) {
        return { greeting: 'Hello, ' + (args.name || 'OpenTalon') };
      }
    `;
    const report = SecurityGate.auditSkillCode(cleanCode, {
      net: { allowedHosts: ['api.example.com'], allowHttp: false },
    });

    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
    expect(report.violations).toHaveLength(0);
    expect(report.scannedAt).toBeGreaterThan(0);
  });

  it('detects SEC-001 prototype pollution / constructor escape', () => {
    const code = `
      export default async function run() {
        const obj = {};
        obj.__proto__.polluted = true;
        return obj;
      }
    `;
    const report = SecurityGate.auditSkillCode(code);
    expect(report.passed).toBe(false);
    expect(report.violations.some((v) => v.ruleId === 'SEC-001' && v.severity === 'critical')).toBe(
      true
    );
  });

  it('detects SEC-002 dynamic code evaluation (eval / new Function)', () => {
    const code = `
      export default async function run(args) {
        const fn = new Function('return ' + args.expr);
        return { value: eval('1 + 1') + fn() };
      }
    `;
    const report = SecurityGate.auditSkillCode(code);
    expect(report.passed).toBe(false);
    expect(report.violations.some((v) => v.ruleId === 'SEC-002' && v.severity === 'critical')).toBe(
      true
    );
  });

  it('detects SEC-003 restricted host module access (child_process)', () => {
    const code = `
      const cp = require('child_process');
      export default async function run() {
        return cp.execSync('whoami').toString();
      }
    `;
    const report = SecurityGate.auditSkillCode(code);
    expect(report.passed).toBe(false);
    expect(report.violations.some((v) => v.ruleId === 'SEC-003' && v.severity === 'critical')).toBe(
      true
    );
  });

  it('detects SEC-004 cloud metadata SSRF endpoint in code and capabilities', () => {
    const code = `
      export default async function run() {
        return { url: 'http://169.254.169.254/latest/meta-data/' };
      }
    `;
    const report = SecurityGate.auditSkillCode(code);
    expect(report.passed).toBe(false);
    expect(report.violations.some((v) => v.ruleId === 'SEC-004' && v.severity === 'critical')).toBe(
      true
    );

    const capReport = SecurityGate.auditSkillCode('export default async function run() { return {}; }', {
      net: { allowedHosts: ['169.254.169.254'], allowHttp: true },
    });
    expect(capReport.passed).toBe(false);
    expect(capReport.violations.some((v) => v.ruleId === 'SEC-004')).toBe(true);
  });

  it('detects SEC-005 wildcard host grant and SEC-006 path traversal', () => {
    const report = SecurityGate.auditSkillCode('export default async function run() { return {}; }', {
      net: { allowedHosts: ['*'], allowHttp: false },
      fs: { readPaths: ['../etc/passwd'], writePaths: [] },
    });

    expect(report.passed).toBe(false);
    expect(report.violations.some((v) => v.ruleId === 'SEC-005' && v.severity === 'high')).toBe(
      true
    );
    expect(report.violations.some((v) => v.ruleId === 'SEC-006' && v.severity === 'high')).toBe(
      true
    );
  });

  it('detects SEC-007 unbounded while(true) loop with severity high and allows bounded loops', () => {
    const unbounded = `export default async function run() { while (true) {} }`;
    const badReport = SecurityGate.auditSkillCode(unbounded);
    expect(badReport.passed).toBe(false);
    expect(badReport.score).toBe(80);
    expect(badReport.violations.some((v) => v.ruleId === 'SEC-007' && v.severity === 'high')).toBe(
      true
    );

    const bounded = `
      export default async function run() {
        let i = 0;
        while (true) {
          i++;
          if (i >= 3) break;
        }
        return { i };
      }
    `;
    const goodReport = SecurityGate.auditSkillCode(bounded);
    expect(goodReport.passed).toBe(true);
  });

  it('CapabilityValidator blocks SSRF metadata hosts and wildcard "*" network grants', () => {
    expect(CapabilityValidator.isCloudMetadataOrForbiddenHost('169.254.169.254')).toBe(true);
    expect(CapabilityValidator.isCloudMetadataOrForbiddenHost('metadata.google.internal')).toBe(true);
    expect(CapabilityValidator.isCloudMetadataOrForbiddenHost('api.github.com')).toBe(false);

    expect(() =>
      CapabilityValidator.assertNetworkAllowed('http://169.254.169.254/latest/meta-data/', {
        allowedHosts: ['169.254.169.254'],
        allowHttp: true,
      })
    ).toThrow();

    expect(() =>
      CapabilityValidator.assertNetworkAllowed('https://api.example.com/data', {
        allowedHosts: ['*'],
        allowHttp: false,
      })
    ).toThrow();
  });

  it('SandboxedVmRunner pre-blocks critical SecurityGate violations before VM execution', async () => {
    const runner = new SandboxedVmRunner();
    const res = await runner.execute({
      code: `
        export default async function run() {
          return eval('2 + 2');
        }
      `,
      args: {},
      capabilities: {},
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('SEC-002');
  });

  it('SkillSynthesizer blocks candidates that fail SecurityGate (including high-severity SEC-007)', async () => {
    const synth = new SkillSynthesizer();
    const result = await synth.synthesize(
      {
        name: 'infinite_loop_skill',
        description: 'Unsafe skill with unbounded loop',
        code: 'export default async function run() { while (true) {} }',
        capabilities: {},
        testCases: [{ args: {}, expected: {} }],
      },
      '1.0.0'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('SEC-007');
  });
});
