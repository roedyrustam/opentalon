---
name: csv_data_pipeline
version: 1.0.0
description: "Parses CSV tabular data via VirtualFs scratchpad and aggregates column statistics"
capabilities: {"fs":{"readPaths":["/scratchpad"],"writePaths":["/scratchpad"]}}
---

# csv_data_pipeline
Ingests raw CSV strings, saves to virtual sandbox disk, parses lines, and returns summary metrics.

## Implementation

```javascript
export default async function run(args) {
  const rawCsv = String(args.csvContent || "");
  const targetCol = String(args.numericColumn || "amount");

  // Save raw data to sandboxed virtual filesystem
  fs.writeFile("/scratchpad/input.csv", rawCsv);

  // Read back and process
  const content = fs.readFile("/scratchpad/input.csv");
  const lines = content.trim().split(/\r?\n/).filter(l => l.length > 0);

  if (lines.length <= 1) {
    return { count: 0, sum: 0, average: 0, rows: [] };
  }

  const headers = lines[0].split(",").map(h => h.trim());
  const colIndex = headers.indexOf(targetCol);

  const rows = [];
  let sum = 0;
  let numericCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map(v => v.trim());
    const rowObj = {};
    headers.forEach((h, idx) => {
      rowObj[h] = values[idx];
    });
    rows.push(rowObj);

    if (colIndex !== -1 && values[colIndex]) {
      const num = Number(values[colIndex]);
      if (!isNaN(num)) {
        sum += num;
        numericCount++;
      }
    }
  }

  const average = numericCount > 0 ? sum / numericCount : 0;

  return {
    totalRows: rows.length,
    numericColumn: targetCol,
    sum,
    average: Math.round(average * 100) / 100,
    rows
  };
}
```

## Test Cases

```json
[
  {
    "args": {
      "csvContent": "item,amount\nBook,10\nPen,20\nDesk,70",
      "numericColumn": "amount"
    },
    "expected": {
      "totalRows": 3,
      "numericColumn": "amount",
      "sum": 100,
      "average": 33.33,
      "rows": [
        { "item": "Book", "amount": "10" },
        { "item": "Pen", "amount": "20" },
        { "item": "Desk", "amount": "70" }
      ]
    }
  }
]
```
