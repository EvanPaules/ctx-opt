import type { Message, OptimizerConfig } from '../types.js';
import { countMessageTokens, countSingleMessageTokens } from '../token-counter.js';
import { classifyMessages, findToolPairPartner } from '../classifier.js';

export interface RelevanceResult {
  messages: Message[];
  messagesDropped: number;
}

export async function applyRelevance(
  messages: Message[],
  config: OptimizerConfig,
  task: string | undefined
): Promise<RelevanceResult> {
  const relevance = config.relevance;
  if (!relevance) {
    throw new Error('relevance config required for relevance strategy');
  }
  const recentWindow = relevance.recentWindow ?? config.recentWindow ?? 6;
  const model = config.model;
  const minScore = relevance.minScore ?? 0.2;

  const classified = classifyMessages(messages, recentWindow, model);

  // Always-keep set.
  const alwaysKeep = new Set<number>();
  for (const c of classified) {
    if (c.class === 'system' || c.class === 'recent') {
      alwaysKeep.add(c.index);
    }
  }
  // Keep tool-pair partners of any always-kept message.
  for (const idx of [...alwaysKeep]) {
    const partner = findToolPairPartner(messages, idx);
    if (partner !== null) alwaysKeep.add(partner);
  }

  const candidateIndices = classified
    .filter((c) => !alwaysKeep.has(c.index))
    .map((c) => c.index);

  // Score candidates. The scorer receives the full messages array and returns
  // a score per message. We only consult the scores for candidate indices.
  const scores = candidateIndices.length > 0
    ? await relevance.scorer(messages, task ?? '')
    : [];

  // Validate scores length.
  if (candidateIndices.length > 0 && scores.length !== messages.length) {
    throw new Error(
      `relevance scorer must return one score per message (got ${scores.length}, expected ${messages.length})`
    );
  }

  // Drop anything below minScore outright.
  const surviving = candidateIndices.filter((i) => (scores[i] ?? 0) >= minScore);

  // Add candidates back in score order until budget reached.
  const sortedByScore = [...surviving].sort(
    (a, b) => (scores[b] ?? 0) - (scores[a] ?? 0)
  );

  const kept = new Set<number>(alwaysKeep);
  let currentTokens = countMessageTokens(
    messages.filter((_, i) => kept.has(i)),
    model
  );
  for (const idx of sortedByScore) {
    if (kept.has(idx)) continue;
    const partner = findToolPairPartner(messages, idx);
    const cost =
      countSingleMessageTokens(messages[idx]!, model) +
      (partner !== null && !kept.has(partner)
        ? countSingleMessageTokens(messages[partner]!, model)
        : 0);
    if (currentTokens + cost > config.maxTokens) continue;
    kept.add(idx);
    if (partner !== null) kept.add(partner);
    currentTokens += cost;
  }

  // Preserve chronological order.
  const result = messages.filter((_, i) => kept.has(i));
  return {
    messages: result,
    messagesDropped: messages.length - result.length,
  };
}
