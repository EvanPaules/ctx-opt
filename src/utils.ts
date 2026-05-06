import type { Message, ContentBlock } from './types.js';

export function messageToText(message: Message): string {
  if (typeof message.content === 'string') {
    return message.content;
  }
  return message.content.map(blockToText).join('\n');
}

export function blockToText(block: ContentBlock): string {
  switch (block.type) {
    case 'text':
      return block.text;
    case 'tool_use':
      return `[tool_use:${block.name}] ${safeStringify(block.input)}`;
    case 'tool_result':
      return `[tool_result:${block.tool_use_id}] ${block.content}`;
  }
}

export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function hashMessages(messages: Message[]): string {
  // Lightweight non-cryptographic hash (FNV-1a) over a stable serialization.
  const serialized = messages
    .map((m) => `${m.role}::${messageToText(m)}`)
    .join('\n---\n');
  let hash = 0x811c9dc5;
  for (let i = 0; i < serialized.length; i++) {
    hash ^= serialized.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16);
}

export function hasToolUse(message: Message): boolean {
  if (typeof message.content === 'string') return false;
  return message.content.some((b) => b.type === 'tool_use');
}

export function hasToolResult(message: Message): boolean {
  if (typeof message.content === 'string') return false;
  return message.content.some((b) => b.type === 'tool_result');
}

export function isToolPairBoundary(prev: Message | undefined, curr: Message): boolean {
  if (!prev) return false;
  return hasToolUse(prev) && hasToolResult(curr);
}
