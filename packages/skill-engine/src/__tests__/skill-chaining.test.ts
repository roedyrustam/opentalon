import { describe, it, expect, vi } from 'vitest';
import { SandboxedVmRunner } from '../sandbox/quickjs-sandbox.js';

describe('Skill Chaining & Procedural Mesh in SandboxedVmRunner', () => {
  it('allows skill to call another skill via callSkill() when authorized', async () => {
    const runner = new SandboxedVmRunner();

    const mockChildSkill = vi.fn().mockResolvedValue({ converted: 1500000, currency: 'IDR' });

    const parentCode = `
      export default async function(args) {
        const result = await callSkill('convert_currency', { amount: 100, to: 'IDR' });
        return {
          status: 'success',
          finalAmount: result.converted,
          targetCurrency: result.currency,
        };
      }
    `;

    const res = await runner.execute({
      code: parentCode,
      args: {},
      capabilities: {
        skills: {
          allowedSkills: ['convert_currency'],
          maxChainDepth: 3,
        },
      },
      callSkill: mockChildSkill,
    });

    expect(res.success).toBe(true);
    expect(res.data).toEqual({
      status: 'success',
      finalAmount: 1500000,
      targetCurrency: 'IDR',
    });
    expect(mockChildSkill).toHaveBeenCalledWith('convert_currency', { amount: 100, to: 'IDR' }, 1);
  });

  it('allows calling via skills.call() syntax', async () => {
    const runner = new SandboxedVmRunner();
    const mockChildSkill = vi.fn().mockResolvedValue({ sanitized: 'clean text' });

    const parentCode = `
      export default async function(args) {
        const res = await skills.call('text_sanitizer', { input: args.text });
        return res;
      }
    `;

    const res = await runner.execute({
      code: parentCode,
      args: { text: '<script>alert(1)</script>' },
      capabilities: {
        skills: {
          allowedSkills: ['text_sanitizer'],
        },
      },
      callSkill: mockChildSkill,
    });

    expect(res.success).toBe(true);
    expect(res.data).toEqual({ sanitized: 'clean text' });
  });

  it('allows calling any skill when wildcard ["*"] is specified in allowedSkills', async () => {
    const runner = new SandboxedVmRunner();
    const mockChildSkill = vi.fn().mockResolvedValue({ ok: true });

    const parentCode = `
      export default async function() {
        return await callSkill('any_arbitrary_skill', { query: 'test' });
      }
    `;

    const res = await runner.execute({
      code: parentCode,
      capabilities: {
        skills: {
          allowedSkills: ['*'],
        },
      },
      callSkill: mockChildSkill,
    });

    expect(res.success).toBe(true);
    expect(res.data).toEqual({ ok: true });
  });

  it('blocks skill chaining when target skill is not in whitelist', async () => {
    const runner = new SandboxedVmRunner();
    const mockChild = vi.fn();

    const parentCode = `
      export default async function() {
        return await callSkill('unauthorized_skill', {});
      }
    `;

    const res = await runner.execute({
      code: parentCode,
      capabilities: {
        skills: {
          allowedSkills: ['convert_currency'],
        },
      },
      callSkill: mockChild,
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('is not in allowed skills whitelist');
    expect(mockChild).not.toHaveBeenCalled();
  });

  it('blocks skill chaining when no skills capability grant is declared', async () => {
    const runner = new SandboxedVmRunner();
    const mockChild = vi.fn();

    const parentCode = `
      export default async function() {
        return await callSkill('any_skill', {});
      }
    `;

    const res = await runner.execute({
      code: parentCode,
      capabilities: {}, // No skills capability
      callSkill: mockChild,
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('Skill chaining denied');
    expect(mockChild).not.toHaveBeenCalled();
  });

  it('enforces maximum chaining recursion depth', async () => {
    const runner = new SandboxedVmRunner();

    const parentCode = `
      export default async function() {
        return await callSkill('deep_skill', {});
      }
    `;

    const res = await runner.execute({
      code: parentCode,
      chainDepth: 3, // Already at max
      capabilities: {
        skills: {
          allowedSkills: ['*'],
          maxChainDepth: 3,
        },
      },
      callSkill: vi.fn(),
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('Maximum skill chaining recursion depth of 3 reached');
  });
});
