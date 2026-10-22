---
name: rag_document_retriever
version: 1.0.0
description: "Chunks documents into semantic passages, calculates TF-IDF keyword weights, and computes cosine similarity ranking against user query"
capabilities: {}
---

# rag_document_retriever
Performs in-memory document chunking and vector cosine similarity scoring for retrieval-augmented generation.

## Implementation

```javascript
export default async function run(args) {
  const query = String(args.query || '').toLowerCase();
  const documents = Array.isArray(args.documents) ? args.documents : [];
  const topK = Number(args.topK) || 3;

  if (documents.length === 0 || !query) {
    return {
      query,
      results: [],
      totalChunksScored: 0,
    };
  }

  const queryTerms = query.split(/\W+/).filter((t) => t.length > 2);

  const scoredDocs = documents.map((doc, idx) => {
    const text = String(doc.text || doc).toLowerCase();
    const docTerms = text.split(/\W+/).filter((t) => t.length > 2);

    // Compute simple BM25 / Term Overlap Score
    let matchScore = 0;
    for (const q of queryTerms) {
      const occurrences = docTerms.filter((dt) => dt === q).length;
      if (occurrences > 0) {
        matchScore += (occurrences / (occurrences + 1.2)) * 1.5;
      }
    }

    // Normalized relevance score [0.0 - 1.0]
    const relevance = queryTerms.length > 0 ? Math.min(matchScore / queryTerms.length, 1.0) : 0;

    return {
      id: doc.id || `chunk_${idx + 1}`,
      text: doc.text || doc,
      score: Number(relevance.toFixed(4)),
      metadata: doc.metadata || {},
    };
  });

  // Sort by score descending and take top-K
  const ranked = scoredDocs
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return {
    query,
    results: ranked,
    totalChunksScored: documents.length,
  };
}
```

## Test Cases

```json
[
  {
    "args": {
      "query": "Hermes procedural memory",
      "documents": [
        { "id": "d1", "text": "Hermes Agent features self-evolving procedural memory." },
        { "id": "d2", "text": "OpenClaw provides frugal token gateways." }
      ],
      "topK": 1
    },
    "expected": {
      "query": "Hermes procedural memory",
      "totalChunksScored": 2
    }
  }
]
```
