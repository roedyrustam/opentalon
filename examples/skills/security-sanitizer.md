---
name: security_sanitizer
version: 1.0.0
description: "Sanitizes raw user input against XSS, SQL injection keywords, and directory traversal tokens"
capabilities: {}
---

# security_sanitizer
Cleans and normalizes untrusted strings before database insertion or HTML rendering.

## Implementation

```javascript
export default async function run(args) {
  const input = String(args.text || "");

  // 1. Strip HTML tags and script injections
  const cleanHtml = input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "");

  // 2. Escape SQL injection prone characters
  const cleanSql = cleanHtml
    .replace(/'/g, "''")
    .replace(/--/g, "")
    .replace(/\/\*/g, "")
    .replace(/\*\//g, "");

  // 3. Neutralize directory traversal sequences
  const cleanPath = cleanSql
    .replace(/\.\.\//g, "")
    .replace(/\.\.\\/g, "");

  return {
    original: input,
    sanitized: cleanPath.trim(),
    length: cleanPath.trim().length,
    modified: input !== cleanPath.trim()
  };
}
```

## Test Cases

```json
[
  {
    "args": { "text": "<script>alert('xss')</script>Hello World" },
    "expected": { "original": "<script>alert('xss')</script>Hello World", "sanitized": "Hello World", "length": 11, "modified": true }
  }
]
```
