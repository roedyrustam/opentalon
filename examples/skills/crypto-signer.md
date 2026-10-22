---
name: crypto_signer
version: 1.0.0
description: "Generates deterministic hex hashes and checksums for webhook and payload validation"
capabilities: {}
---

# crypto_signer
Computes deterministic cryptographic hashes and checksums without native external libraries.

## Implementation

```javascript
export default async function run(args) {
  const payload = String(args.payload || "");
  const algorithm = String(args.algorithm || "djb2");

  // Deterministic 32-bit FNV-1a checksum
  let fnvHash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    fnvHash ^= payload.charCodeAt(i);
    fnvHash += (fnvHash << 1) + (fnvHash << 4) + (fnvHash << 7) + (fnvHash << 8) + (fnvHash << 24);
  }
  const fnvHex = (fnvHash >>> 0).toString(16).padStart(8, '0');

  // Simple DJB2 checksum
  let djbHash = 5381;
  for (let i = 0; i < payload.length; i++) {
    djbHash = ((djbHash << 5) + djbHash) + payload.charCodeAt(i);
    djbHash |= 0;
  }
  const djbHex = (djbHash >>> 0).toString(16).padStart(8, '0');

  return {
    payloadLength: payload.length,
    algorithm,
    checksums: {
      fnv1a: fnvHex,
      djb2: djbHex
    }
  };
}
```

## Test Cases

```json
[
  {
    "args": { "payload": "OpenTalon Webhook Event" },
    "expected": {
      "payloadLength": 23,
      "algorithm": "djb2",
      "checksums": {
        "fnv1a": "61ae619b",
        "djb2": "69f237f3"
      }
    }
  }
]
```
