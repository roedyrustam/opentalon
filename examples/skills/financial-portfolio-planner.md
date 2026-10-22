---
name: financial_portfolio_planner
version: 1.0.0
description: "Calculates investment portfolio asset valuations and chains convert_currency for multi-currency reporting"
capabilities: {"skills":{"allowedSkills":["convert_currency"],"maxChainDepth":3}}
---

# financial_portfolio_planner
Computes portfolio total asset valuation, weights, and leverages skill chaining to convert totals into multi-currency equivalents (EUR, IDR).

## Implementation

```javascript
export default async function run(args) {
  const assets = Array.isArray(args.assets) ? args.assets : [
    { symbol: 'BTC', quantity: 0.5, priceUsd: 90000 },
    { symbol: 'ETH', quantity: 4.0, priceUsd: 3000 },
    { symbol: 'USDC', quantity: 5000, priceUsd: 1.0 }
  ];

  let totalUsd = 0;
  const breakdown = assets.map((a) => {
    const valueUsd = Number(a.quantity || 0) * Number(a.priceUsd || 0);
    totalUsd += valueUsd;
    return {
      symbol: a.symbol,
      quantity: a.quantity,
      priceUsd: a.priceUsd,
      valueUsd
    };
  });

  // Calculate allocation weights
  const portfolio = breakdown.map((item) => ({
    ...item,
    weightPercent: totalUsd > 0 ? Number(((item.valueUsd / totalUsd) * 100).toFixed(2)) : 0
  }));

  // Procedural Skill Chaining: call convert_currency directly from sandbox
  const currencyConversion = await callSkill('convert_currency', { amount: totalUsd });

  return {
    totalUsd,
    multiCurrencyTotals: currencyConversion.converted,
    assetCount: assets.length,
    portfolio,
    timestamp: Date.now()
  };
}
```
