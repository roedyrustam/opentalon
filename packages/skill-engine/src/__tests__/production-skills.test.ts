import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SkillMarkdownParser, SkillSynthesizer, SandboxedVmRunner } from '../index.js';

describe('Production Skills Gallery - Verification Suite', () => {
  const sandbox = new SandboxedVmRunner();
  const synth = new SkillSynthesizer(sandbox);
  const skillsDir = path.resolve('examples/skills');

  const skillFiles = [
    'currency-converter.md',
    'http-json-fetcher.md',
    'security-sanitizer.md',
    'csv-data-pipeline.md',
    'crypto-signer.md',
    'math-stats-calculator.md',
    'doku-payment-checkout.md',
    'rag-document-retriever.md',
  ];

  for (const filename of skillFiles) {
    it(`validates and tests ${filename}`, async () => {
      const filePath = path.join(skillsDir, filename);
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = SkillMarkdownParser.parse(content);

      expect(parsed.metadata.name).toBeDefined();
      expect(parsed.metadata.version).toBe('1.0.0');
      expect(parsed.executableCode).toBeDefined();

      let testCases;
      if (parsed.testCases) {
        testCases = JSON.parse(parsed.testCases);
      }

      // Dry-run or test-fixture execution via Synthesizer
      const result = await synth.synthesize({
        name: parsed.metadata.name,
        description: parsed.metadata.description,
        code: parsed.executableCode,
        capabilities: parsed.metadata.capabilities,
        testCases,
      });

      expect(result.success).toBe(true);
      expect(result.skillDocument?.metadata.name).toBe(parsed.metadata.name);
    });
  }
});
