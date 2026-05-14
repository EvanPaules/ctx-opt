import type { Message, OptimizerConfig } from '../types.js';
import { countMessageTokens } from '../token-counter.js';
import { classifyMessages } from '../classifier.js';
import { hashMessages } from '../utils.js';
import { applySlidingWindow } from './sliding-window.js';

export interface SummarizerResult {
  messages: Message[];
  messagesDropped: number;
  messagesSummarized: number;
}

const SUMMARY_INSTRUCTION =
  'Summarize the following conversation history concisely. Preserve key decisions, facts, and context that would be useful for continuing the conversation. Output plain text only, no headers.';

const summaryCache = new Map<string, string>();

export function _clearSummaryCache(): void {
  summaryCache.clear();
}

export async function applySummarizer(
  messages: Message[],
  config: OptimizerConfig
): Promise<SummarizerResult> {
  const summarizer = config.summarizer;
  if (!summarizer) {
    throw new Error('summarizer config required for summarizer strategy');
  }
  const triggerThreshold = summarizer.triggerThreshold ?? 0.85;
  const recentWindow = summarizer.recentWindow ?? config.recentWindow ?? 6;
  const model = config.model;

  const inputTokens = countMessageTokens(messages, model);
  if (inputTokens <= triggerThreshold * config.maxTokens) {
    return { messages, messagesDropped: 0, messagesSummarized: 0 };
  }

  const classified = classifyMessages(messages, recentWindow, model);
  const compressibleIndices = classified
    .filter((c) => c.class === 'compressible')
    .map((c) => c.index);

  if (compressibleIndices.length === 0) {
    // Nothing to compress — fall back to sliding window if still over budget.
    const fallback = applySlidingWindow(messages, config);
    return {
      messages: fallback.messages,
      messagesDropped: fallback.messagesDropped,
      messagesSummarized: 0,
    };
  }

  const compressible = compressibleIndices.map((i) => messages[i]!);
  const cacheKey = hashMessages(compressible);

  let summaryText = summaryCache.get(cacheKey);
  if (summaryText === undefined) {
    summaryText = await summarizer.llmCall(compressible, SUMMARY_INSTRUCTION);
    summaryCache.set(cacheKey, summaryText);
  }

  const summaryMessage: Message = {
    role: 'assistant',
    content: `[Conversation summary: ${summaryText}]`,
  };

  // Build the new messages array: preserve order, replace the contiguous block
  // of compressible messages with a single summary message.
  const compressibleSet = new Set(compressibleIndices);
  const firstCompressible = compressibleIndices[0]!;
  const out: Message[] = [];
  let inserted = false;
  for (let i = 0; i < messages.length; i++) {
    if (compressibleSet.has(i)) {
      if (!inserted && i === firstCompressible) {
        out.push(summaryMessage);
        inserted = true;
      }
      continue;
    }
    out.push(messages[i]!);
  }
  if (!inserted) out.unshift(summaryMessage);

  // If still over budget, fall back to sliding window on the summarized result.
  let finalMessages = out;
  if (countMessageTokens(finalMessages, model) > config.maxTokens) {
    const fallback = applySlidingWindow(finalMessages, config);
    finalMessages = fallback.messages;
  }

  return {
    messages: finalMessages,
    messagesDropped: Math.max(0, messages.length - finalMessages.length),
    messagesSummarized: compressibleIndices.length,
  };
}
