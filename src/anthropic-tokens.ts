import type { Message } from './types.js';
import { ctxToAnthropicSplit, ctxMessagesToAnthropicInput } from './adapters/shared.js';

/**
 * Minimal structural type for the Anthropic client's `countTokens` endpoint.
 * Avoids a hard dependency on @anthropic-ai/sdk so this helper can be
 * imported without the SDK installed at type-check time.
 */
export interface AnthropicCountTokensCapable {
  messages: {
    countTokens: (params: Record<string, unknown>) => Promise<{ input_tokens: number }>;
  };
}

/**
 * Get an exact token count for a `ctx-opt` `Message[]` array by delegating
 * to Anthropic's `messages.countTokens` endpoint. More accurate than the
 * default tiktoken-based approximation for `claude-*` models, at the cost
 * of a network round-trip per call.
 *
 * @example
 * ```ts
 * import Anthropic from '@anthropic-ai/sdk';
 * import { countMessageTokensWithAnthropic } from 'ctx-opt';
 *
 * const client = new Anthropic();
 * const tokens = await countMessageTokensWithAnthropic(
 *   client,
 *   messages,
 *   'claude-haiku-4-5-20251001'
 * );
 * ```
 */
export async function countMessageTokensWithAnthropic(
  client: AnthropicCountTokensCapable,
  messages: Message[],
  model: string
): Promise<number> {
  const split = ctxToAnthropicSplit(messages);
  const params: Record<string, unknown> = {
    model,
    messages: ctxMessagesToAnthropicInput(split.messages),
  };
  if (split.system !== undefined) {
    params.system = split.system;
  }
  const result = await client.messages.countTokens(params);
  return result.input_tokens;
}
