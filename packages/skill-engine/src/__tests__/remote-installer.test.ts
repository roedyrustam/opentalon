import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemoteSkillInstaller } from '../installer/remote-skill-installer.js';

describe('RemoteSkillInstaller', () => {
  describe('normalizeUrl', () => {
    it('normalizes GitHub shorthand format to raw githubusercontent', () => {
      const url = RemoteSkillInstaller.normalizeUrl('github:roedyrustam/opentalon/examples/skills/convert_currency.md');
      expect(url).toBe('https://raw.githubusercontent.com/roedyrustam/opentalon/main/examples/skills/convert_currency.md');
    });

    it('honors custom branch in GitHub shorthand format', () => {
      const url = RemoteSkillInstaller.normalizeUrl('github:roedyrustam/opentalon@feat-branch/skills/test.md');
      expect(url).toBe('https://raw.githubusercontent.com/roedyrustam/opentalon/feat-branch/skills/test.md');
    });

    it('converts GitHub blob URLs to raw user content URLs', () => {
      const url = RemoteSkillInstaller.normalizeUrl('https://github.com/roedyrustam/opentalon/blob/main/examples/skills/crypto-signer.md');
      expect(url).toBe('https://raw.githubusercontent.com/roedyrustam/opentalon/main/examples/skills/crypto-signer.md');
    });

    it('normalizes Gist shorthand', () => {
      const url = RemoteSkillInstaller.normalizeUrl('gist:123456789abcdef/my-skill.md');
      expect(url).toBe('https://gist.githubusercontent.com/raw/123456789abcdef/my-skill.md');
    });

    it('preserves direct raw HTTPS URLs', () => {
      const direct = 'https://raw.githubusercontent.com/user/repo/main/skill.md';
      expect(RemoteSkillInstaller.normalizeUrl(direct)).toBe(direct);
    });

    it('throws on unsupported format', () => {
      expect(() => RemoteSkillInstaller.normalizeUrl('ftp://invalid.com')).toThrow();
    });
  });

  describe('auditCapabilities', () => {
    it('approves safe capabilities without warnings', () => {
      const audit = RemoteSkillInstaller.auditCapabilities({
        net: { allowedHosts: ['api.exchangerate.host'] },
      });
      expect(audit.isSafe).toBe(true);
      expect(audit.warnings).toHaveLength(0);
    });

    it('flags wildcard network permissions', () => {
      const audit = RemoteSkillInstaller.auditCapabilities({
        net: { allowedHosts: ['*'] },
      });
      expect(audit.isSafe).toBe(false);
      expect(audit.warnings[0]).toContain('Unrestricted wildcard network access');
    });

    it('allows wildcard network permissions if force is true', () => {
      const audit = RemoteSkillInstaller.auditCapabilities(
        { net: { allowedHosts: ['*'] } },
        true
      );
      expect(audit.isSafe).toBe(true);
      expect(audit.warnings).toHaveLength(1);
    });
  });

  describe('install', () => {
    let mockMemory: any;
    let savedSkill: any;

    beforeEach(() => {
      savedSkill = null;
      mockMemory = {
        getSkill: vi.fn().mockImplementation((name: string) => {
          if (name === 'already_exists') {
            return { name: 'already_exists', version: '0.9.0' };
          }
          return null;
        }),
        saveSkill: vi.fn().mockImplementation((skill) => {
          savedSkill = skill;
        }),
      };
    });

    it('downloads, verifies, and installs a remote skill successfully', async () => {
      const sampleSkillMd = `---
name: remote_weather_fetcher
version: 1.0.0
description: "Fetches current weather"
capabilities: {"net":{"allowedHosts":["api.weather.com"]}}
---
# remote_weather_fetcher
\`\`\`javascript
export default async function(args) {
  return { city: args.city || 'Jakarta', temp: 28, condition: 'Sunny' };
}
\`\`\`
`;

      // Mock global fetch
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: async () => sampleSkillMd,
      } as any);

      const result = await RemoteSkillInstaller.install(
        'https://example.com/remote_weather_fetcher.md',
        mockMemory
      );

      expect(result.success).toBe(true);
      expect(result.skillName).toBe('remote_weather_fetcher');
      expect(savedSkill).toBeDefined();
      expect(savedSkill.name).toBe('remote_weather_fetcher');
      expect(savedSkill.capabilities.net.allowedHosts).toContain('api.weather.com');

      fetchSpy.mockRestore();
    });

    it('blocks installation if skill already exists without overwrite flag', async () => {
      const sampleSkillMd = `---
name: already_exists
version: 1.0.0
description: "Duplicate"
capabilities: {}
---
\`\`\`javascript
export default async function() { return {}; }
\`\`\`
`;

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: async () => sampleSkillMd,
      } as any);

      const result = await RemoteSkillInstaller.install(
        'https://example.com/already_exists.md',
        mockMemory,
        undefined,
        { overwrite: false }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('already registered');

      fetchSpy.mockRestore();
    });
  });
});
