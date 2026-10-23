# Security Policy / Kebijakan Keamanan

## Zero-Trust Philosophy

**OpenTalon** is built from the ground up with a **Zero-Trust Sandbox** architecture (`SecurityGate` + `SandboxedVmRunner` + HMAC-SHA256 webhook verification + prompt-injection sanitization). Security is our highest priority.

## Supported Versions

| Version | Supported |
| :--- | :--- |
| `0.5.x` (Latest) | ✅ Yes |
| `0.4.x` | ✅ Security fixes |
| `< 0.4.0` | ❌ Upgrade to `>= 0.5.0` |

## Reporting a Vulnerability / Melaporkan Kerentanan

If you discover a security vulnerability (such as a sandbox escape in `@opentalon/skill-engine`, prompt injection bypass in `SecurityGate`, or authentication bypass in `@opentalon/gateway`):

1. **Do NOT open a public GitHub issue.**
2. Report the vulnerability privately via [GitHub Security Advisories](https://github.com/roedyrustam/opentalon/security/advisories/new) or contact the maintainer directly via GitHub profile [@roedyrustam](https://github.com/roedyrustam).
3. Include:
   - Affected package and version (`@opentalon/skill-engine`, `@opentalon/core`, etc.)
   - Proof-of-Concept (PoC) reproduction script
   - Potential impact and suggested remediation

We acknowledge all security reports within **48 hours** and aim to release verified patches within **7 days**.
