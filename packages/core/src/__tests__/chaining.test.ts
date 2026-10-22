import { describe, it, expect, beforeEach } from 'vitest';
import { DualBrainRouter } from '../router/dual-brain-router.js';
import { MockLLMDriver } from '../drivers/mock-driver.js';
import { LibSqlMemoryAdapter } from '@opentalon/memory';
import { SandboxedVmRunner } from '@opentalon/skill-engine';

describe('DualBrainRouter - End-to-End Skill Chaining Mesh', () => {
  let memory: LibSqlMemoryAdapter;
  let sandbox: SandboxedVmRunner;
  let mockLLM: MockLLMDriver;
  let router: DualBrainRouter;

  beforeEach(async () => {
    memory = new LibSqlMemoryAdapter({ url: ':memory:' });
    await memory.initialize();

    sandbox = new SandboxedVmRunner();
    mockLLM = new MockLLMDriver();

    router = new DualBrainRouter({
      memory,
      sandbox,
      llm: mockLLM,
    });
  });

  it('allows a procedural skill to recursively chain another skill from memory', async () => {
    // 1. Register child skill: tax_calculator
    await memory.saveSkill({
      id: 'skill-tax',
      name: 'tax_calculator',
      description: 'Calculates tax based on rate and subtotal',
      capabilities: {},
      version: '1.0.0',
      hash: 'hash-tax',
      code: `
        export default async function(args) {
          const subtotal = Number(args.subtotal || 0);
          const rate = Number(args.rate || 0.1);
          return {
            subtotal,
            taxAmount: subtotal * rate,
            total: subtotal + (subtotal * rate),
          };
        }
      `,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // 2. Register parent skill: invoice_processor which chains into tax_calculator
    await memory.saveSkill({
      id: 'skill-invoice',
      name: 'invoice_processor',
      description: 'Processes invoice line items and calculates tax and total',
      capabilities: {
        skills: {
          allowedSkills: ['tax_calculator'],
          maxChainDepth: 3,
        },
      },
      version: '1.0.0',
      hash: 'hash-invoice',
      code: `
        export default async function(args) {
          const amount = Number(args.amount || 100);
          const taxRes = await callSkill('tax_calculator', { subtotal: amount, rate: 0.12 });
          return {
            invoiceId: 'INV-2026-001',
            taxResult: taxRes,
            status: 'PROCESSED',
          };
        }
      `,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // 3. Mock LLM to invoke parent tool 'invoice_processor'
    mockLLM.mockResponse = {
      content: 'I will process this invoice for you.',
      toolCalls: [
        {
          id: 'call_1',
          name: 'invoice_processor',
          args: { amount: 500 },
        },
      ],
      tokensUsed: { promptTokens: 30, completionTokens: 20, totalTokens: 50 },
      model: 'mock-llm',
    };

    const result = await router.executeFastPath({
      sessionId: 'test_chaining_session',
      input: 'Process invoice for 500 dollars',
    });

    expect(result.toolCallsMade).toHaveLength(1);
    expect(result.toolCallsMade[0].toolName).toBe('invoice_processor');

    const outputData = result.toolCallsMade[0].result as {
      invoiceId: string;
      status: string;
      taxResult: { subtotal: number; taxAmount: number; total: number };
    };

    expect(outputData.status).toBe('PROCESSED');
    expect(outputData.taxResult.subtotal).toBe(500);
    expect(outputData.taxResult.taxAmount).toBe(60); // 500 * 0.12
    expect(outputData.taxResult.total).toBe(560);
  });
});
