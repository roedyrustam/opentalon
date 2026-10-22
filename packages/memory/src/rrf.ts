/**
 * Calculates cosine similarity between two numeric vectors.
 * Returns a value between -1.0 and 1.0.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

export interface RankedItem<T> {
  item: T;
  id: string;
}

/**
 * Reciprocal Rank Fusion (RRF)
 * Standard formula: RRF_Score(d) = sum(1 / (k + rank_i(d)))
 * Default k = 60
 */
export function reciprocalRankFusion<T>(
  ftsRankings: RankedItem<T>[],
  vectorRankings: RankedItem<T>[],
  k = 60
): { item: T; ftsRank?: number; vectorRank?: number; rrfScore: number }[] {
  const scores = new Map<
    string,
    {
      item: T;
      ftsRank?: number;
      vectorRank?: number;
      rrfScore: number;
    }
  >();

  // Process FTS rankings (rank is 1-indexed)
  for (let i = 0; i < ftsRankings.length; i++) {
    const entry = ftsRankings[i];
    const rank = i + 1;
    const existing = scores.get(entry.id);
    const rrfComponent = 1 / (k + rank);

    if (existing) {
      existing.ftsRank = rank;
      existing.rrfScore += rrfComponent;
    } else {
      scores.set(entry.id, {
        item: entry.item,
        ftsRank: rank,
        rrfScore: rrfComponent,
      });
    }
  }

  // Process Vector rankings (rank is 1-indexed)
  for (let i = 0; i < vectorRankings.length; i++) {
    const entry = vectorRankings[i];
    const rank = i + 1;
    const existing = scores.get(entry.id);
    const rrfComponent = 1 / (k + rank);

    if (existing) {
      existing.vectorRank = rank;
      existing.rrfScore += rrfComponent;
    } else {
      scores.set(entry.id, {
        item: entry.item,
        vectorRank: rank,
        rrfScore: rrfComponent,
      });
    }
  }

  // Sort descending by RRF score
  return Array.from(scores.values()).sort((a, b) => b.rrfScore - a.rrfScore);
}
