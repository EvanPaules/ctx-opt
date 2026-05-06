import type { Message, OptimizerConfig } from '../types.js';
import { countMessageTokens } from '../token-counter.js';
import { findToolPairPartner } from '../classifier.js';

export interface SlidingWindowResult {
  messages: Message[];
  messagesDropped: number;
}

export function applySlidingWindow(
  messages: Message[],
  config: OptimizerConfig
): SlidingWindowResult {
  const preserveSystem = config.preserveSystem ?? true;
  const size = config.slidingWindow?.size ?? config.recentWindow ?? 6;
  const model = config.model;
  const maxTokens = config.maxTokens;

  const systemIndices = preserveSystem
    ? messages.map((m, i) => (m.role === 'system' ? i : -1)).filter((i) => i >= 0)
    : [];
  const systemSet = new Set(systemIndices);

  const nonSystemIndices = messages
    .map((_, i) => i)
    .filter((i) => !systemSet.has(i));

  // Start by taking the last `size` non-system messages plus all system messages.
  let kept = new Set<number>(systemIndices);
  const tail = nonSystemIndices.slice(-Math.max(0, size - systemIndices.length));
  for (const i of tail) kept.add(i);

  // Repair tool pairs at the boundary: if a tool_result is included but its
  // partner tool_use is excluded, drop the tool_result (don't split pairs).
  // Conversely, if a tool_use is included but its partner tool_result was
  // excluded by being too far back/forward, drop the tool_use too.
  kept = repairToolPairs(messages, kept);

  // If still over budget, trim oldest non-system kept messages until under budget.
  let current = buildOutput(messages, kept);
  while (countMessageTokens(current, model) > maxTokens) {
    const oldestNonSystem = [...kept]
      .filter((i) => !systemSet.has(i))
      .sort((a, b) => a - b)[0];
    if (oldestNonSystem === undefined) break;
    kept.delete(oldestNonSystem);
    // Drop its pair partner too.
    const partner = findToolPairPartner(messages, oldestNonSystem);
    if (partner !== null) kept.delete(partner);
    current = buildOutput(messages, kept);
  }

  const result = buildOutput(messages, kept);
  return {
    messages: result,
    messagesDropped: messages.length - result.length,
  };
}

function repairToolPairs(messages: Message[], kept: Set<number>): Set<number> {
  const next = new Set(kept);
  for (const idx of kept) {
    const partner = findToolPairPartner(messages, idx);
    if (partner !== null && !next.has(partner)) {
      next.delete(idx);
    }
  }
  return next;
}

function buildOutput(messages: Message[], kept: Set<number>): Message[] {
  return messages.filter((_, i) => kept.has(i));
}
