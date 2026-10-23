import {
  generateKeyPairSync,
  sign,
  verify,
  randomUUID,
  randomBytes,
  createPublicKey,
  createPrivateKey,
} from 'node:crypto';
import { type IMemoryPort, type AgentIdentity } from '@opentalon/memory';
import { type SignedHeaders, type VerificationResult } from './types.js';

export interface IdentityManagerOptions {
  agentName?: string;
  maxClockSkewMs?: number; // default: 60,000ms (60s)
  nonceTtlMs?: number;     // default: 300,000ms (5m)
}

/**
 * Deterministically serializes an object into canonical JSON with alphabetically sorted keys
 * to ensure 100% byte-identical stringification across platforms and runtimes.
 */
export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJsonStringify).join(',') + ']';
  }

  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map((key) => {
    const val = (obj as Record<string, unknown>)[key];
    return JSON.stringify(key) + ':' + canonicalJsonStringify(val);
  });

  return '{' + pairs.join(',') + '}';
}

export class AgentIdentityManager {
  private memory: IMemoryPort;
  private options: Required<IdentityManagerOptions>;
  private cachedIdentity: AgentIdentity | null = null;
  private seenNonces = new Map<string, number>();

  constructor(memory: IMemoryPort, options?: IdentityManagerOptions) {
    this.memory = memory;
    this.options = {
      agentName: options?.agentName || process.env.TALON_AGENT_NAME || 'OpenTalon Node',
      maxClockSkewMs: options?.maxClockSkewMs ?? 60_000,
      nonceTtlMs: options?.nonceTtlMs ?? 300_000,
    };
  }

  /**
   * Retrieves or automatically generates and persists this node's Ed25519 identity.
   */
  public async getOrCreateIdentity(overrideName?: string): Promise<AgentIdentity> {
    if (this.cachedIdentity) {
      return this.cachedIdentity;
    }

    const existing = await this.memory.getAgentIdentity();
    if (existing) {
      this.cachedIdentity = existing;
      return existing;
    }

    // Auto-generate fresh Ed25519 keypair
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');

    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

    const identity: AgentIdentity = {
      id: `urn:talon:agent:${randomUUID()}`,
      name: overrideName || this.options.agentName,
      publicKey: publicKeyPem,
      privateKey: privateKeyPem,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.memory.saveAgentIdentity(identity);
    this.cachedIdentity = identity;
    return identity;
  }

  public static cleanPublicKeyBase64(keyStr: string): string {
    return keyStr.replace(/-----BEGIN [A-Z ]+-----|-----END [A-Z ]+-----|[\r\n\s]/g, '');
  }

  public static parsePublicKey(keyStr: string) {
    if (keyStr.includes('-----BEGIN')) {
      return createPublicKey(keyStr);
    }
    const clean = this.cleanPublicKeyBase64(keyStr);
    const derBuffer = Buffer.from(clean, 'base64');
    return createPublicKey({ key: derBuffer, format: 'der', type: 'spki' });
  }

  /**
   * Signs a payload with this agent's Ed25519 private key.
   */
  public async signPayload(payload: unknown): Promise<SignedHeaders> {
    const identity = await this.getOrCreateIdentity();
    const timestamp = Date.now();
    const nonce = randomBytes(16).toString('hex');

    const canonicalData = this.buildCanonicalSigningString(payload, timestamp, nonce);
    const privateKeyObj = createPrivateKey(identity.privateKey);

    const signatureBuffer = sign(null, Buffer.from(canonicalData, 'utf-8'), privateKeyObj);
    const signature = signatureBuffer.toString('base64');

    return {
      agentId: identity.id,
      publicKey: AgentIdentityManager.cleanPublicKeyBase64(identity.publicKey),
      signature,
      timestamp,
      nonce,
    };
  }

  /**
   * Verifies an asymmetric Ed25519 signature from an inbound request.
   * Performs clock skew check, nonce replay prevention, and cryptographic verification.
   */
  public verifyRequestSignature(
    payload: unknown,
    headers: SignedHeaders
  ): VerificationResult {
    const now = Date.now();

    // 1. Clock skew validation (± maxClockSkewMs)
    if (Math.abs(now - headers.timestamp) > this.options.maxClockSkewMs) {
      return {
        valid: false,
        error: `ERR_CLOCK_SKEW: Request timestamp ${headers.timestamp} deviated more than ${this.options.maxClockSkewMs}ms from server time ${now}`,
      };
    }

    // 2. Nonce replay prevention
    this.pruneExpiredNonces(now);
    if (this.seenNonces.has(headers.nonce)) {
      return {
        valid: false,
        error: `ERR_NONCE_REPLAY: Nonce ${headers.nonce} has already been processed within the active replay window`,
      };
    }
    this.seenNonces.set(headers.nonce, now + this.options.nonceTtlMs);

    // 3. Cryptographic signature check
    try {
      const canonicalData = this.buildCanonicalSigningString(payload, headers.timestamp, headers.nonce);
      const publicKeyObj = AgentIdentityManager.parsePublicKey(headers.publicKey);

      const isValid = verify(
        null,
        Buffer.from(canonicalData, 'utf-8'),
        publicKeyObj,
        Buffer.from(headers.signature, 'base64')
      );

      if (!isValid) {
        return {
          valid: false,
          error: 'ERR_INVALID_SIGNATURE: Ed25519 signature mismatch for provided payload and public key',
        };
      }

      return {
        valid: true,
        signerAgentId: headers.agentId,
      };
    } catch (err: unknown) {
      return {
        valid: false,
        error: `ERR_CRYPTO_EXCEPTION: Failed to parse public key or verify signature: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Constructs the deterministic canonical signing string.
   */
  public buildCanonicalSigningString(payload: unknown, timestamp: number, nonce: string): string {
    const canonicalPayload = canonicalJsonStringify(payload);
    return `TIMESTAMP:${timestamp}\nNONCE:${nonce}\nPAYLOAD:${canonicalPayload}`;
  }

  /**
   * Removes expired nonces from memory to avoid unbounded map growth.
   */
  private pruneExpiredNonces(now: number): void {
    for (const [nonce, expiresAt] of this.seenNonces.entries()) {
      if (now > expiresAt) {
        this.seenNonces.delete(nonce);
      }
    }
  }

  /**
   * Clears internal state (for testing).
   */
  public resetCache(): void {
    this.cachedIdentity = null;
    this.seenNonces.clear();
  }
}
