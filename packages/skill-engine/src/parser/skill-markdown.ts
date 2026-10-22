import { type ParsedSkillDocument, type SkillMetadata, SkillCapabilitiesSchema } from '../types.js';

export class SkillMarkdownParser {
  /**
   * Parses a raw SKILL.md document into metadata, documentation, and executable code.
   */
  public static parse(content: string): ParsedSkillDocument {
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      throw new Error('Invalid SKILL.md format: Missing YAML frontmatter delimited by ---');
    }

    const rawFrontmatter = match[1];
    const body = match[2];

    const metadata = this.parseFrontmatter(rawFrontmatter);

    // Extract code block: looks for ```javascript or ```typescript
    const codeBlockRegex = /```(?:javascript|typescript|js|ts)\r?\n([\s\S]*?)\r?\n```/;
    const codeMatch = body.match(codeBlockRegex);

    if (!codeMatch) {
      throw new Error('Invalid SKILL.md format: Missing executable code block (```javascript or ```typescript)');
    }

    const executableCode = codeMatch[1].trim();

    // Check for optional test cases block
    const testCasesRegex = /```(?:json|tests?)\r?\n([\s\S]*?)\r?\n```/g;
    let testCases: string | undefined;
    let testMatch: RegExpExecArray | null;
    while ((testMatch = testCasesRegex.exec(body)) !== null) {
      if (testMatch[0].includes('test') || testMatch[0].includes('fixture')) {
        testCases = testMatch[1].trim();
      }
    }

    // Strip code blocks to extract pure documentation
    const documentation = body
      .replace(codeBlockRegex, '')
      .replace(/```(?:json|tests?)\r?\n[\s\S]*?\r?\n```/g, '')
      .trim();

    return {
      metadata,
      documentation,
      executableCode,
      testCases,
    };
  }

  /**
   * Serializes a ParsedSkillDocument back into a clean SKILL.md format.
   */
  public static serialize(doc: ParsedSkillDocument): string {
    const yamlLines = [
      '---',
      `name: ${doc.metadata.name}`,
      `version: ${doc.metadata.version}`,
      `description: "${doc.metadata.description.replace(/"/g, '\\"')}"`,
    ];

    if (doc.metadata.author) {
      yamlLines.push(`author: "${doc.metadata.author}"`);
    }

    yamlLines.push(`capabilities: ${JSON.stringify(doc.metadata.capabilities)}`);
    yamlLines.push('---');

    return [
      yamlLines.join('\n'),
      '',
      `# ${doc.metadata.name}`,
      '',
      doc.documentation,
      '',
      '## Implementation',
      '',
      '```javascript',
      doc.executableCode,
      '```',
      doc.testCases ? `\n## Test Cases\n\n\`\`\`json\n${doc.testCases}\n\`\`\`\n` : '',
    ].join('\n');
  }

  private static parseFrontmatter(rawYaml: string): SkillMetadata {
    const lines = rawYaml.split(/\r?\n/);
    const parsed: Record<string, string> = {};

    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      let value = line.slice(colonIdx + 1).trim();

      // Strip surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      parsed[key] = value;
    }

    if (!parsed.name || !parsed.version || !parsed.description) {
      throw new Error('Frontmatter must specify name, version, and description');
    }

    let capabilities = {};
    if (parsed.capabilities) {
      try {
        capabilities = JSON.parse(parsed.capabilities);
      } catch {
        capabilities = {};
      }
    }

    const validatedCaps = SkillCapabilitiesSchema.parse(capabilities);

    return {
      id: parsed.id || `skill-${parsed.name}`,
      name: parsed.name,
      version: parsed.version,
      description: parsed.description,
      author: parsed.author,
      capabilities: validatedCaps,
      createdAt: parsed.createdAt ? Number(parsed.createdAt) : Date.now(),
      updatedAt: Date.now(),
    };
  }
}
