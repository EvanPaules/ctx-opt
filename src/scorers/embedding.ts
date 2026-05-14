import type { Message, RelevanceScorerFn } from '../types.js';
import { messageToText } from '../utils.js';

export type EmbedFn = (texts: string[]) => Promise<number[][]>;

export interface EmbeddingScorerOptions {
  /** Your embed function. Takes an array of texts, returns an array of vectors. */
  embed: EmbedFn;
  /**
   * Optional cache key prefix. If two scorers should share an embedding cache,
   * give them the same cacheKey. Defaults to a unique value per scorer instance.
   */
  cacheKey?: string;
}

const moduleCache = new Map<string, number[]>();

/**
 * Build an embedding-based relevance scorer. Each message and the task
 * are embedded, then scored by cosine similarity to the task embedding.
 *
 * Bring your own embed function — works with OpenAI's
 * `client.embeddings.create`, Anthropic's Voyage embeddings, sentence
 * transformers, Cohere, anything that maps text to a vector.
 *
 * Embeddings for previously-seen messages are cached in-process to keep
 * subsequent optimize() calls cheap.
 *
 * @example
 * ```ts
 * import OpenAI from 'openai';
 * import { ContextOptimizer } from 'ctx-opt';
 * import { createEmbeddingScorer } from 'ctx-opt/scorers';
 *
 * const openai = new OpenAI();
 * const scorer = createEmbeddingScorer({
 *   embed: async (texts) => {
 *     const res = await openai.embeddings.create({
 *       model: 'text-embedding-3-small',
 *       input: texts,
 *     });
 *     return res.data.map((d) => d.embedding);
 *   },
 * });
 *
 * const optimizer = new ContextOptimizer({
 *   maxTokens: 8_000,
 *   strategy: 'relevance',
 *   relevance: { scorer, minScore: 0.3 },
 * });
 * ```
 */
export function createEmbeddingScorer(
  opts: EmbeddingScorerOptions
): RelevanceScorerFn {
  const { embed } = opts;
  const cacheKey = opts.cacheKey ?? `embedding-scorer-${Math.random().toString(36).slice(2)}`;

  return async function score(messages: Message[], task: string): Promise<number[]> {
    if (!task) return messages.map(() => 0);

    const texts = messages.map(messageToText);
    const cacheHits: (number[] | undefined)[] = texts.map((t) => moduleCache.get(`${cacheKey}::${t}`));
    const missingIndices: number[] = [];
    const missingTexts: string[] = [];
    cacheHits.forEach((hit, i) => {
      if (!hit) {
        missingIndices.push(i);
        missingTexts.push(texts[i]!);
      }
    });

    // Always embed the task fresh; cache key includes task so different tasks don't collide.
    const taskCacheKey = `${cacheKey}::__task__::${task}`;
    let taskEmbedding: number[] | undefined = moduleCache.get(taskCacheKey);

    const toEmbed: string[] = [];
    if (!taskEmbedding) toEmbed.push(task);
    toEmbed.push(...missingTexts);

    if (toEmbed.length > 0) {
      const fresh = await embed(toEmbed);
      let cursor = 0;
      if (!taskEmbedding) {
        taskEmbedding = fresh[cursor++];
        if (taskEmbedding) moduleCache.set(taskCacheKey, taskEmbedding);
      }
      for (const idx of missingIndices) {
        const vec = fresh[cursor++];
        if (vec) {
          moduleCache.set(`${cacheKey}::${texts[idx]}`, vec);
          cacheHits[idx] = vec;
        }
      }
    }

    if (!taskEmbedding) return messages.map(() => 0);

    return texts.map((_, i) => {
      const vec = cacheHits[i];
      if (!vec) return 0;
      return cosine(vec, taskEmbedding!);
    });
  };
}

/** Clear the in-process embedding cache. Test helper. */
export function _clearEmbeddingCache(): void {
  moduleCache.clear();
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  // Cosine sim is in [-1, 1]; map to [0, 1] for relevance compatibility.
  const sim = dot / denom;
  return (sim + 1) / 2;
}
