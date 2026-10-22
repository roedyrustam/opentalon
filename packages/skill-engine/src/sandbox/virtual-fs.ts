import path from 'node:path';
import { type CapabilityGrant } from '../types.js';
import { CapabilityValidator, CapabilityViolationError } from './capability-validator.js';

export interface IVirtualFs {
  readFile(filePath: string): string;
  writeFile(filePath: string, content: string): void;
  exists(filePath: string): boolean;
  listFiles(dirPath?: string): string[];
  deleteFile(filePath: string): boolean;
}

export class VirtualFs implements IVirtualFs {
  private files: Map<string, string> = new Map();
  private capabilities?: CapabilityGrant['fs'];

  constructor(capabilities?: CapabilityGrant['fs']) {
    this.capabilities = capabilities;
  }

  /**
   * Normalizes a virtual path to eliminate directory traversal tricks ('..' or '.').
   */
  public static normalizePath(targetPath: string): string {
    if (!targetPath || typeof targetPath !== 'string') {
      throw new CapabilityViolationError('fs', 'Invalid path string');
    }

    // Convert backslashes to forward slashes
    let normalized = targetPath.replace(/\\/g, '/');

    // Ensure leading slash
    if (!normalized.startsWith('/')) {
      normalized = '/' + normalized;
    }

    // Resolve dots using posix-style resolution
    normalized = path.posix.normalize(normalized);

    // Detect if normalization attempted to escape root
    if (normalized.startsWith('/../') || normalized === '/..') {
      throw new CapabilityViolationError('fs', `Path traversal detected in "${targetPath}"`);
    }

    return normalized;
  }

  public readFile(filePath: string): string {
    const cleanPath = VirtualFs.normalizePath(filePath);
    CapabilityValidator.assertFsAllowed(cleanPath, 'read', this.capabilities);

    const content = this.files.get(cleanPath);
    if (content === undefined) {
      throw new Error(`[VirtualFS] File not found: "${cleanPath}"`);
    }
    return content;
  }

  public writeFile(filePath: string, content: string): void {
    const cleanPath = VirtualFs.normalizePath(filePath);
    CapabilityValidator.assertFsAllowed(cleanPath, 'write', this.capabilities);

    this.files.set(cleanPath, String(content));
  }

  public exists(filePath: string): boolean {
    try {
      const cleanPath = VirtualFs.normalizePath(filePath);
      CapabilityValidator.assertFsAllowed(cleanPath, 'read', this.capabilities);
      return this.files.has(cleanPath);
    } catch {
      return false;
    }
  }

  public listFiles(dirPath = '/'): string[] {
    const cleanDir = VirtualFs.normalizePath(dirPath);
    CapabilityValidator.assertFsAllowed(cleanDir, 'read', this.capabilities);

    const results: string[] = [];
    const prefix = cleanDir.endsWith('/') ? cleanDir : cleanDir + '/';

    for (const key of this.files.keys()) {
      if (key.startsWith(prefix) || (cleanDir === '/' && key.startsWith('/'))) {
        results.push(key);
      }
    }
    return results;
  }

  public deleteFile(filePath: string): boolean {
    const cleanPath = VirtualFs.normalizePath(filePath);
    CapabilityValidator.assertFsAllowed(cleanPath, 'write', this.capabilities);

    return this.files.delete(cleanPath);
  }

  public clear(): void {
    this.files.clear();
  }
}
