import { describe, it, expect, vi } from 'vitest';
import { withOptimizer, type OpenAILike } from '../../src/adapters/openai.js';
import { ContextOptimizer } from '../../src/optimizer.js';
import type { Message } from '../../src/types.js';

function mkMockClient(create: ReturnType<typeof vi.fn>): OpenAILike {
  return {
    chat: {
      completions: { create },
    },
  };
}

function longHistory(n: number): Array<{ role: string; content: string }> {
  const filler = 'lorem ipsum dolor sit amet '.repeat(40);
  const out: Array<{ role: string; content: string }> = [
    { role: 'system', content: 'you are helpful' },
  ];
  for (let i = 0; i < n; i++) {
    out.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `[${i}] ${filler}`,
    });
  }
  return out;
}

describe('openai adapter / withOptimizer', () => {
  it('intercepts chat.completions.create and trims messages before forwarding', async () => {
    const create = vi.fn(async () => ({ id: 'res' }));
    const client = mkMockClient(create);
    const ai = withOptimizer(client, {
      maxTokens: 600,
      strategy: 'sliding-window',
      slidingWindow: { size: 4 },
    });

    const messages = longHistory(20);
    await ai.chat.completions.create({ model: 'gpt-4o', messages });

    expect(create).toHaveBeenCalledTimes(1);
    const forwarded = create.mock.calls[0]![0] as { messages: unknown[] };
    expect(forwarded.messages.length).toBeLessThan(messages.length);
  });

  it('preserves the system message after optimization', async () => {
    const create = vi.fn(async () => ({}));
    const client = mkMockClient(create);
    const ai = withOptimizer(client, {
      maxTokens: 400,
      strategy: 'sliding-window',
      slidingWindow: { size: 3 },
    });

    await ai.chat.completions.create({
      model: 'gpt-4o',
      messages: longHistory(20),
    });

    const forwarded = create.mock.calls[0]![0] as { messages: Array<{ role: string }> };
    expect(forwarded.messages[0]?.role).toBe('system');
  });

  it('passes through other fields on the request unchanged', async () => {
    const create = vi.fn(async () => ({}));
    const client = mkMockClient(create);
    const ai = withOptimizer(client, {
      maxTokens: 10_000,
      strategy: 'sliding-window',
    });

    await ai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.7,
      max_tokens: 100,
      tools: [{ type: 'function', function: { name: 'x' } }],
    });

    const forwarded = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(forwarded.temperature).toBe(0.7);
    expect(forwarded.max_tokens).toBe(100);
    expect(forwarded.tools).toBeDefined();
    expect(forwarded.model).toBe('gpt-4o');
  });

  it('forwards options argument unchanged', async () => {
    const create = vi.fn(async () => ({}));
    const client = mkMockClient(create);
    const ai = withOptimizer(client, {
      maxTokens: 10_000,
      strategy: 'sliding-window',
    });

    const opts = { signal: new AbortController().signal, headers: { 'x-test': '1' } };
    await ai.chat.completions.create(
      { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] },
      opts
    );
    expect(create.mock.calls[0]![1]).toBe(opts);
  });

  it('exposes lastMeta after a call', async () => {
    const create = vi.fn(async () => ({}));
    const client = mkMockClient(create);
    const ai = withOptimizer(client, {
      maxTokens: 600,
      strategy: 'sliding-window',
      slidingWindow: { size: 4 },
    });

    expect(ai.lastMeta).toBeUndefined();
    await ai.chat.completions.create({ model: 'gpt-4o', messages: longHistory(20) });
    expect(ai.lastMeta).toBeDefined();
    expect(ai.lastMeta!.strategyUsed).toBe('sliding-window');
    expect(ai.lastMeta!.inputTokens).toBeGreaterThan(ai.lastMeta!.outputTokens);
  });

  it('accepts a pre-built ContextOptimizer instance', async () => {
    const create = vi.fn(async () => ({}));
    const client = mkMockClient(create);
    const optimizer = new ContextOptimizer({
      maxTokens: 600,
      strategy: 'sliding-window',
      slidingWindow: { size: 4 },
    });
    const ai = withOptimizer(client, optimizer);
    expect(ai.optimizer).toBe(optimizer);
    await ai.chat.completions.create({ model: 'gpt-4o', messages: longHistory(20) });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('skips optimization when params has no messages array', async () => {
    const create = vi.fn(async () => ({}));
    const client = mkMockClient(create);
    const ai = withOptimizer(client, {
      maxTokens: 100,
      strategy: 'sliding-window',
    });
    // @ts-expect-error — intentionally malformed input to verify pass-through
    await ai.chat.completions.create({ model: 'gpt-4o' });
    expect(create).toHaveBeenCalledWith({ model: 'gpt-4o' }, undefined);
    expect(ai.lastMeta).toBeUndefined();
  });

  it('exposes the wrapped client via .client', () => {
    const create = vi.fn(async () => ({}));
    const client = mkMockClient(create);
    const ai = withOptimizer(client, {
      maxTokens: 1000,
      strategy: 'sliding-window',
    });
    expect(ai.client).toBe(client);
  });
});

// Compile-time type check: should accept the real OpenAI SDK type.
// We don't construct a real client (no API key needed) — just ensure the
// generic signature accepts the surface.
import type OpenAI from 'openai';
function _typeCompat(client: OpenAI) {
  const ai = withOptimizer(client, { maxTokens: 8000, strategy: 'sliding-window' });
  // ai.client should preserve the OpenAI type.
  const _c: OpenAI = ai.client;
  void _c;
  void (() => ai.chat.completions.create({ model: 'gpt-4o', messages: [] as Message[] }));
}
void _typeCompat;
