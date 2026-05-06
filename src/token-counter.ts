import { getEncoding, encodingForModel, type TiktokenEncoding, type TiktokenModel } from 'js-tiktoken';
import type { Message } from './types.js';
import { messageToText } from './utils.js';

// Per-message overhead: 4 tokens approximates role + formatting tokens
// per OpenAI's chat-completion cookbook formula (im_start, role, im_end, sep).
const PER_MESSAGE_OVERHEAD = 4;

const encodingCache = new Map<string, ReturnType<typeof getEncoding>>();

function resolveEncoding(model?: string): ReturnType<typeof getEncoding> {
  const key = model ?? 'gpt-4o';
  const cached = encodingCache.get(key);
  if (cached) return cached;

  let enc: ReturnType<typeof getEncoding>;

  if (!model || isAnthropicModel(model)) {
    // For Anthropic models, cl100k_base is the closest available approximation.
    enc = getEncoding('cl100k_base');
  } else {
    try {
      enc = encodingForModel(model as TiktokenModel);
    } catch {
      // Fallback for unknown OpenAI-style models.
      enc = getEncoding('cl100k_base' as TiktokenEncoding);
    }
  }

  encodingCache.set(key, enc);
  return enc;
}

function isAnthropicModel(model: string): boolean {
  return /^claude/i.test(model);
}

export function encodeText(text: string, model?: string): Uint32Array {
  if (!text) return new Uint32Array();
  const enc = resolveEncoding(model);
  return Uint32Array.from(enc.encode(text));
}

export function countTokens(text: string, model?: string): number {
  if (!text) return 0;
  const enc = resolveEncoding(model);
  return enc.encode(text).length;
}

export function countMessageTokens(messages: Message[], model?: string): number {
  if (messages.length === 0) return 0;
  let total = 0;
  for (const m of messages) {
    total += PER_MESSAGE_OVERHEAD;
    total += countTokens(messageToText(m), model);
    if (m.name) total += countTokens(m.name, model);
  }
  return total;
}

export function countSingleMessageTokens(message: Message, model?: string): number {
  return PER_MESSAGE_OVERHEAD + countTokens(messageToText(message), model) + (message.name ? countTokens(message.name, model) : 0);
}
