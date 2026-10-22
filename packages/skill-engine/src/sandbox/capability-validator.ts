import { type CapabilityGrant } from '../types.js';

export class CapabilityViolationError extends Error {
  constructor(public readonly capability: 'net' | 'fs' | 'env', message: string) {
    super(`[CapabilityViolationError] Unauthorized access to ${capability}: ${message}`);
    this.name = 'CapabilityViolationError';
  }
}

export class CapabilityValidator {
  /**
   * Asserts that a URL or hostname is permitted under the declared net capabilities.
   */
  public static assertNetworkAllowed(targetUrl: string, grant?: CapabilityGrant['net']): void {
    if (!grant || !grant.allowedHosts || grant.allowedHosts.length === 0) {
      throw new CapabilityViolationError(
        'net',
        `Network access denied. No hosts allowed for "${targetUrl}"`
      );
    }

    let urlObj: URL;
    try {
      urlObj = new URL(targetUrl);
    } catch {
      throw new CapabilityViolationError('net', `Invalid URL format: "${targetUrl}"`);
    }

    if (urlObj.protocol === 'http:' && !grant.allowHttp) {
      throw new CapabilityViolationError(
        'net',
        `Insecure HTTP connection disallowed for "${targetUrl}". HTTPS required.`
      );
    }

    const hostname = urlObj.hostname.toLowerCase();
    const isAllowed = grant.allowedHosts.some((allowed) => {
      const cleanAllowed = allowed.toLowerCase().trim();
      return (
        hostname === cleanAllowed ||
        (cleanAllowed.startsWith('*.') && hostname.endsWith(cleanAllowed.slice(2)))
      );
    });

    if (!isAllowed) {
      throw new CapabilityViolationError(
        'net',
        `Host "${hostname}" is not in allowed hosts whitelist [${grant.allowedHosts.join(', ')}]`
      );
    }
  }

  /**
   * Asserts that a filesystem path is permitted under the declared fs capabilities.
   */
  public static assertFsAllowed(
    targetPath: string,
    operation: 'read' | 'write',
    grant?: CapabilityGrant['fs']
  ): void {
    if (!grant) {
      throw new CapabilityViolationError('fs', `Filesystem access denied for "${targetPath}"`);
    }

    const allowedList = operation === 'read' ? grant.readPaths : grant.writePaths;
    if (!allowedList || allowedList.length === 0) {
      throw new CapabilityViolationError(
        'fs',
        `No ${operation} paths configured for "${targetPath}"`
      );
    }

    // Normalize slashes
    const normalizedTarget = targetPath.replace(/\\/g, '/');
    const isPermitted = allowedList.some((allowed) => {
      const normalizedAllowed = allowed.replace(/\\/g, '/');
      return normalizedTarget.startsWith(normalizedAllowed);
    });

    if (!isPermitted) {
      throw new CapabilityViolationError(
        'fs',
        `Path "${targetPath}" is outside allowed ${operation} whitelist [${allowedList.join(', ')}]`
      );
    }
  }

  /**
   * Asserts that an environment variable key is permitted.
   */
  public static assertEnvAllowed(key: string, grant?: string[]): void {
    if (!grant || !grant.includes(key)) {
      throw new CapabilityViolationError(
        'env',
        `Environment variable "${key}" access denied. Allowed: [${(grant || []).join(', ')}]`
      );
    }
  }
}
