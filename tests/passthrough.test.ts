import { describe, it, expect, vi } from 'vitest';
import { withOptimizer as openaiAdapter, type OpenAILike } from '../src/adapters/openai.js';
import { withOptimizer as anthropicAdapter, type AnthropicLike } from '../src/adapters/anthropic.js';
import { countMessageTokens } from '../src/token-counter.js';
import type { Message } from '../src/types.js';

describe('passthrough content blocks', () => {
  it('counts passthrough blocks at their estimatedTokens', () => {
    const withImage: Message[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'describe this' },
          { type: 'passthrough', raw: { type: 'image' }, estimatedTokens: 850, kind: 'image' },
        ],
      },
    ];
    const withoutImage: Message[] = [
      { role: 'user', content: [{ type: 'text', text: 'describe this' }] },
    ];
    const delta =
      countMessageTokens(withImage) - countMessageTokens(withoutImage);
    expect(delta).toBeGreaterThanOrEqual(850);
  });

  it('uses 500 as the default passthrough estimate when omitted', () => {
    const withBlock: Message[] = [
      {
        role: 'user',
        content: [{ type: 'passthrough', raw: { type: 'mystery' } }],
      },
    ];
    const empty: Message[] = [{ role: 'user', content: [{ type: 'text', text: '' }] }];
    const delta = countMessageTokens(withBlock) - countMessageTokens(empty);
    expect(delta).toBeGreaterThanOrEqual(500);
  });
});

describe('OpenAI adapter preserves image_url blocks through optimization', () => {
  it('forwards the original image_url block raw to the underlying client', async () => {
    const create = vi.fn(async () => ({}));
    const client: OpenAILike = {
      chat: { completions: { create } },
    };
    const ai = openaiAdapter(client, {
      maxTokens: 10_000,
      strategy: 'sliding-window',
    });

    const imageBlock = {
      type: 'image_url',
      image_url: { url: 'https://example.com/cat.jpg', detail: 'low' },
    };

    await ai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'whats in this image' }, imageBlock],
        },
      ],
    });

    const forwarded = create.mock.calls[0]![0] as {
      messages: Array<{ content: Array<Record<string, unknown>> }>;
    };
    const forwardedBlocks = forwarded.messages[0]!.content;
    const forwardedImage = forwardedBlocks.find((b) => b.type === 'image_url');
    expect(forwardedImage).toEqual(imageBlock);
  });
});

describe('Anthropic adapter preserves image blocks through optimization', () => {
  it('forwards the original image block raw to the underlying client', async () => {
    const create = vi.fn(async () => ({}));
    const client: AnthropicLike = {
      messages: { create },
    };
    const ai = anthropicAdapter(client, {
      maxTokens: 10_000,
      strategy: 'sliding-window',
    });

    const imageBlock = {
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'aGVsbG8=' },
    };

    await ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'whats in this image' }, imageBlock],
        },
      ],
    });

    const forwarded = create.mock.calls[0]![0] as {
      messages: Array<{ content: Array<Record<string, unknown>> }>;
    };
    const forwardedBlocks = forwarded.messages[0]!.content;
    const forwardedImage = forwardedBlocks.find((b) => b.type === 'image');
    expect(forwardedImage).toEqual(imageBlock);
  });
});
