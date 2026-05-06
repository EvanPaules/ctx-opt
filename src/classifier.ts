import type { ClassifiedMessage, Message, MessageClass } from './types.js';
import { countSingleMessageTokens } from './token-counter.js';
import { hasToolResult, hasToolUse } from './utils.js';

export function classifyMessages(
  messages: Message[],
  recentWindow: number,
  model?: string
): ClassifiedMessage[] {
  const total = messages.length;
  const recentStart = Math.max(0, total - recentWindow);

  return messages.map((message, index) => {
    const tokenCount = countSingleMessageTokens(message, model);
    let cls: MessageClass;

    if (message.role === 'system') {
      cls = 'system';
    } else if (index >= recentStart) {
      cls = 'recent';
    } else if (isInToolPair(messages, index)) {
      cls = 'tool-pair';
    } else {
      cls = 'compressible';
    }

    return { message, index, class: cls, tokenCount };
  });
}

function isInToolPair(messages: Message[], index: number): boolean {
  const curr = messages[index];
  if (!curr) return false;

  // tool_use followed by tool_result
  if (hasToolUse(curr)) {
    const next = messages[index + 1];
    if (next && hasToolResult(next)) return true;
  }
  // tool_result preceded by tool_use
  if (hasToolResult(curr)) {
    const prev = messages[index - 1];
    if (prev && hasToolUse(prev)) return true;
  }
  // role==='tool' messages are always considered part of a pair if adjacent assistant has tool_use
  if (curr.role === 'tool') {
    const prev = messages[index - 1];
    if (prev && (hasToolUse(prev) || prev.role === 'assistant')) return true;
  }
  return false;
}

export function findToolPairPartner(messages: Message[], index: number): number | null {
  const curr = messages[index];
  if (!curr) return null;
  if (hasToolUse(curr)) {
    const next = messages[index + 1];
    if (next && hasToolResult(next)) return index + 1;
  }
  if (hasToolResult(curr) || curr.role === 'tool') {
    const prev = messages[index - 1];
    if (prev && hasToolUse(prev)) return index - 1;
  }
  return null;
}
