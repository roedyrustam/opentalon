---
name: math_stats_calculator
version: 1.0.0
description: "Calculates statistical metrics: sum, mean, median, min, max, standard deviation, and p95"
capabilities: {}
---

# math_stats_calculator
Performs statistical analysis across numerical datasets.

## Implementation

```javascript
export default async function run(args) {
  const numbers = (args.numbers || []).map(Number).filter(n => !isNaN(n));
  if (numbers.length === 0) {
    return { count: 0, sum: 0, mean: 0, median: 0, min: 0, max: 0, stdDev: 0, p95: 0 };
  }

  const sorted = [...numbers].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const mean = sum / count;

  // Median
  const mid = Math.floor(count / 2);
  const median = count % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  // Min / Max
  const min = sorted[0];
  const max = sorted[count - 1];

  // Standard Deviation
  const variance = sorted.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count;
  const stdDev = Math.sqrt(variance);

  // 95th Percentile
  const p95Index = Math.ceil(0.95 * count) - 1;
  const p95 = sorted[Math.max(0, p95Index)];

  const round = (num) => Math.round(num * 100) / 100;

  return {
    count,
    sum: round(sum),
    mean: round(mean),
    median: round(median),
    min: round(min),
    max: round(max),
    stdDev: round(stdDev),
    p95: round(p95)
  };
}
```

## Test Cases

```json
[
  {
    "args": { "numbers": [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] },
    "expected": {
      "count": 10,
      "sum": 550,
      "mean": 55,
      "median": 55,
      "min": 10,
      "max": 100,
      "stdDev": 28.72,
      "p95": 100
    }
  }
]
```
