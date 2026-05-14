import { describe, it, expect, vi } from 'vitest';
import {
  countMessageTokensWithAnthropic,
  type AnthropicCountTokensCapable,
} from '../src/anthropic-tokens.js';
import type { Message } from '../src/types.js';

describe('countMessageTokensWithAnthropic', () => {
  it('delegates to client.messages.countTokens and returns input_tokens', async () => {
    const countTokens = vi.fn(async () => ({ input_tokens: 1234 }));
    const client: AnthropicCountTokensCapable = {
      messages: { countTokens },
    };

    const messages: Message[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ];

    const result = await countMessageTokensWithAnthropic(
      client,
      messages,
      'claude-haiku-4-5-20251001'
    );

    expect(result).toBe(1234);
    expect(countTokens).toHaveBeenCalledTimes(1);
    const params = countTokens.mock.calls[0]![0] as Record<string, unknown>;
    expect(params.model).toBe('claude-haiku-4-5-20251001');
    expect(Array.isArray(params.messages)).toBe(true);
  });

  it('hoists system role out of messages into the top-level system field', async () => {
    const countTokens = vi.fn(async () => ({ input_tokens: 50 }));
    const client: AnthropicCountTokensCapable = {
      messages: { countTokens },
    };

    const messages: Message[] = [
      { role: 'system', content: 'you are concise' },
      { role: 'user', content: 'hi' },
    ];

    await countMessageTokensWithAnthropic(
      client,
      messages,
      'claude-haiku-4-5-20251001'
    );

    const params = countTokens.mock.calls[0]![0] as {
      system?: string;
      messages: Array<{ role: string }>;
    };
    expect(params.system).toBe('you are concise');
    expect(params.messages.every((m) => m.role !== 'system')).toBe(true);
  });

  it('omits system if there are no system messages', async () => {
    const countTokens = vi.fn(async () => ({ input_tokens: 10 }));
    const client: AnthropicCountTokensCapable = {
      messages: { countTokens },
    };

    await countMessageTokensWithAnthropic(
      client,
      [{ role: 'user', content: 'hi' }],
      'claude-haiku-4-5-20251001'
    );

    const params = countTokens.mock.calls[0]![0] as Record<string, unknown>;
    expect('system' in params).toBe(false);
  });
});
