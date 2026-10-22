import { describe, it, expect } from 'vitest';
import { VirtualFs, CapabilityViolationError, SandboxedVmRunner } from '../index.js';

describe('VirtualFs - Scoped Capability Isolation', () => {
  it('allows read and write inside granted paths', () => {
    const vfs = new VirtualFs({
      readPaths: ['/scratchpad', '/data'],
      writePaths: ['/scratchpad'],
    });

    vfs.writeFile('/scratchpad/notes.txt', 'Hello virtual world');
    expect(vfs.exists('/scratchpad/notes.txt')).toBe(true);
    expect(vfs.readFile('/scratchpad/notes.txt')).toBe('Hello virtual world');

    const files = vfs.listFiles('/scratchpad');
    expect(files).toContain('/scratchpad/notes.txt');

    expect(vfs.deleteFile('/scratchpad/notes.txt')).toBe(true);
    expect(vfs.exists('/scratchpad/notes.txt')).toBe(false);
  });

  it('blocks writes outside granted writePaths', () => {
    const vfs = new VirtualFs({
      readPaths: ['/data'],
      writePaths: ['/scratchpad'],
    });

    expect(() => vfs.writeFile('/data/readonly.txt', 'malicious content')).toThrow(
      CapabilityViolationError
    );
  });

  it('prevents directory traversal attempts', () => {
    const vfs = new VirtualFs({
      readPaths: ['/scratchpad'],
      writePaths: ['/scratchpad'],
    });

    expect(() => vfs.writeFile('/scratchpad/../../etc/passwd', 'root:x:0:0')).toThrow(
      CapabilityViolationError
    );
  });
});

describe('Sandbox VM - Virtual Filesystem Execution', () => {
  const sandbox = new SandboxedVmRunner();

  it('executes skill code that uses virtual fs within granted capabilities', async () => {
    const code = `
      export default async function run(args) {
        fs.writeFile('/scratchpad/result.json', JSON.stringify({ computed: args.x * 2 }));
        const content = fs.readFile('/scratchpad/result.json');
        return JSON.parse(content);
      }
    `;

    const result = await sandbox.execute({
      code,
      args: { x: 21 },
      capabilities: {
        fs: {
          readPaths: ['/scratchpad'],
          writePaths: ['/scratchpad'],
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ computed: 42 });
  });

  it('fails sandbox execution if skill code attempts unauthorized file access', async () => {
    const code = `
      export default async function run() {
        fs.writeFile('/etc/shadow', 'forbidden');
        return true;
      }
    `;

    const result = await sandbox.execute({
      code,
      capabilities: {
        fs: {
          readPaths: ['/scratchpad'],
          writePaths: ['/scratchpad'],
        },
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('CapabilityViolationError');
  });
});
