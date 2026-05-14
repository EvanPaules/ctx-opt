import type { Message, RelevanceScorerFn } from '../types.js';
import { messageToText } from '../utils.js';

export interface BM25Options {
  /** Term-frequency saturation. Default 1.5. Higher = more saturation. */
  k1?: number;
  /** Length normalization. Default 0.75. 0 = ignore length, 1 = full normalization. */
  b?: number;
}

/**
 * Build a BM25-based relevance scorer. BM25 is a classical ranking function
 * that scores documents by how well their term frequencies match a query,
 * with saturation and length normalization.
 *
 * Pure JavaScript, zero dependencies, zero network calls. Lower quality
 * than embedding-based scoring for paraphrased queries, but free and fast.
 *
 * @example
 * ```ts
 * import { ContextOptimizer } from 'ctx-opt';
 * import { bm25Scorer } from 'ctx-opt/scorers';
 *
 * const optimizer = new ContextOptimizer({
 *   maxTokens: 8_000,
 *   strategy: 'relevance',
 *   relevance: { scorer: bm25Scorer(), minScore: 0.05 },
 * });
 * ```
 */
export function bm25Scorer(opts: BM25Options = {}): RelevanceScorerFn {
  const k1 = opts.k1 ?? 1.5;
  const b = opts.b ?? 0.75;

  return async function score(messages: Message[], task: string): Promise<number[]> {
    const queryTerms = tokenize(task);
    if (queryTerms.length === 0) return messages.map(() => 0);

    const docs = messages.map((m) => tokenize(messageToText(m)));
    const docLengths = docs.map((d) => d.length);
    const totalDocs = docs.length;
    const avgDocLength =
      totalDocs > 0 ? docLengths.reduce((s, n) => s + n, 0) / totalDocs : 0;

    // Document-frequency table for query terms.
    const df = new Map<string, number>();
    for (const term of new Set(queryTerms)) {
      let count = 0;
      for (const doc of docs) {
        if (doc.includes(term)) count++;
      }
      df.set(term, count);
    }

    const rawScores = docs.map((doc, i) => {
      let score = 0;
      const docLen = docLengths[i] ?? 0;
      const tfTable = termFrequencies(doc);
      for (const term of queryTerms) {
        const tf = tfTable.get(term) ?? 0;
        if (tf === 0) continue;
        const dfCount = df.get(term) ?? 0;
        const idf = Math.log(1 + (totalDocs - dfCount + 0.5) / (dfCount + 0.5));
        const denom =
          tf + k1 * (1 - b + (b * docLen) / Math.max(1, avgDocLength));
        score += idf * ((tf * (k1 + 1)) / Math.max(1e-9, denom));
      }
      return score;
    });

    // Normalize to [0, 1] for compatibility with the relevance strategy's
    // minScore comparison. If all scores are zero, return zeros.
    const max = Math.max(0, ...rawScores);
    if (max === 0) return rawScores;
    return rawScores.map((s) => s / max);
  };
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length > 0);
}

function termFrequencies(tokens: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of tokens) {
    out.set(t, (out.get(t) ?? 0) + 1);
  }
  return out;
}
