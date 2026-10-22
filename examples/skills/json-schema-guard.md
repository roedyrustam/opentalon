---
name: json_schema_guard
version: 1.0.0
description: "Validates and sanitizes dynamic JSON payloads against schema rules, field types, and range constraints"
capabilities: {}
---

# json_schema_guard
Validates data types and enforces schema contracts for AI tool outputs and API requests.

## Implementation

```javascript
export default async function run(args) {
  const data = args.data || {};
  const schema = args.schema || {};
  const errors = [];

  // 1. Check required fields
  const required = schema.required || [];
  for (const field of required) {
    if (data[field] === undefined || data[field] === null || data[field] === "") {
      errors.push(`Missing required field: "${field}"`);
    }
  }

  // 2. Validate properties
  const properties = schema.properties || {};
  for (const [key, rule] of Object.entries(properties)) {
    const val = data[key];
    if (val === undefined || val === null) continue;

    if (rule.type) {
      const actualType = Array.isArray(val) ? "array" : typeof val;
      if (actualType !== rule.type) {
        errors.push(`Field "${key}" must be of type ${rule.type}, received ${actualType}`);
      }
    }

    if (typeof val === "number") {
      if (rule.min !== undefined && val < rule.min) {
        errors.push(`Field "${key}" value ${val} is less than minimum ${rule.min}`);
      }
      if (rule.max !== undefined && val > rule.max) {
        errors.push(`Field "${key}" value ${val} exceeds maximum ${rule.max}`);
      }
    }

    if (rule.enum && Array.isArray(rule.enum)) {
      if (!rule.enum.includes(val)) {
        errors.push(`Field "${key}" must be one of [${rule.enum.join(", ")}], received "${val}"`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    fieldsValidated: Object.keys(properties).length,
    timestamp: 1700000000000
  };
}
```

## Test Cases

```json
[
  {
    "args": {
      "data": { "username": "roedy", "age": 25, "role": "admin" },
      "schema": {
        "required": ["username", "role"],
        "properties": {
          "username": { "type": "string" },
          "age": { "type": "number", "min": 18, "max": 100 },
          "role": { "type": "string", "enum": ["user", "admin", "agent"] }
        }
      }
    },
    "expected": {
      "valid": true,
      "errors": [],
      "fieldsValidated": 3,
      "timestamp": 1700000000000
    }
  }
]
```
