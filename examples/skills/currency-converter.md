---
name: convert_currency
version: 1.0.0
description: "Converts USD amount to EUR and IDR using real-time fixed peg"
capabilities: {"net":{"allowedHosts":[],"allowHttp":false}}
---

# convert_currency
Converts currency amounts between USD, EUR, and IDR.

## Implementation

```javascript
export default async function run(args) {
  const amount = Number(args.amount) || 1;
  const rates = {
    EUR: 0.92,
    IDR: 15800,
  };
  return {
    source: "USD",
    amount,
    converted: {
      EUR: amount * rates.EUR,
      IDR: amount * rates.IDR,
    }
  };
}
```
