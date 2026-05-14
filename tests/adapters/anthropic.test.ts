import { describe, it, expect, vi } from 'vitest';
import { withOptimizer, type AnthropicLike } from '../../src/adapters/anthropic.js';
import { ContextOptimizer } from '../../src/optimizer.js';

function mkMockClient(create: ReturnType<typeof vi.fn>): AnthropicLike {
  return {
    messages: { create },
  };
}

function longHistory(n: number): Array<{ role: string; content: string }> {
  const filler = 'lorem ipsum dolor sit amet '.repeat(40);
  const out: Array<{ role: string; content: string }> = [];
  for (let i = 0; i < n; i++) {
    out.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `[${i}] ${filler}`,
    });
  }
  return out;
}

describe('anthropic adapter / withOptimizer', () => {
  it('intercepts messages.create and trims history before forwarding', async () => {
    const create = vi.fn(async () => ({ id: 'msg' }));
    const client = mkMockClient(create);
    const ai = withOptimizer(client, {
      maxTokens: 600,
      strategy: 'sliding-window',
      slidingWindow: { size: 4 },
    });

    const messages = longHistory(20);
    await ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: 'you are concise',
      messages,
    });

    expect(create).toHaveBeenCalledTimes(1);
    const forwarded = create.mock.calls[0]![0] as { messages: unknown[]; system?: string };
    expect(forwarded.messages.length).toBeLessThan(messages.length);
    // System hoisted back out as a top-level field, never as a 'system' role message.
    expect(forwarded.system).toBe('you are concise');
    expect(
      (forwarded.messages as Array<{ role: string }>).every((m) => m.role !== 'system')
    ).toBe(true);
  });

  it('handles requests with no system field', async () => {
    const create = vi.fn(async () => ({}));
    const client = mkMockClient(create);
    const ai = withOptimizer(client, {
      maxTokens: 10_000,
      strategy: 'sliding-window',
    });

    await ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
    });

    const forwarded = create.mock.calls[0]![0] as Record<string, unknown>;
    expect('system' in forwarded ? forwarded.system : undefined).toBeUndefined();
  });

  it('passes through other fields on the request unchanged', async () => {
    const create = vi.fn(async () => ({}));
    const client = mkMockClient(create);
    const ai = withOptimizer(client, {
      maxTokens: 10_000,
      strategy: 'sliding-window',
    });

    await ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      temperature: 0.3,
      tools: [{ name: 'search', description: 'd', input_schema: { type: 'object' } }],
      messages: [{ role: 'user', content: 'hi' }],
    });

    const forwarded = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(forwarded.model).toBe('claude-haiku-4-5-20251001');
    expect(forwarded.max_tokens).toBe(1024);
    expect(forwarded.temperature).toBe(0.3);
    expect(forwarded.tools).toBeDefined();
  });

  it('forwards options argument unchanged', async () => {
    const create = vi.fn(async () => ({}));
    const client = mkMockClient(create);
    const ai = withOptimizer(client, {
      maxTokens: 10_000,
      strategy: 'sliding-window',
    });
    const opts = { signal: new AbortController().signal };
    await ai.messages.create(
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }],
      },
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
    await ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system: 'sys',
      messages: longHistory(20),
    });
    expect(ai.lastMeta).toBeDefined();
    expect(ai.lastMeta!.strategyUsed).toBe('sliding-window');
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
    await ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: longHistory(20),
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('skips optimization when params has no messages array', async () => {
    const create = vi.fn(async () => ({}));
    const client = mkMockClient(create);
    const ai = withOptimizer(client, {
      maxTokens: 100,
      strategy: 'sliding-window',
    });
    // @ts-expect-error — intentionally malformed
    await ai.messages.create({ model: 'claude-haiku-4-5-20251001' });
    expect(create).toHaveBeenCalledTimes(1);
    expect(ai.lastMeta).toBeUndefined();
  });

  it('handles content blocks (tool_use / tool_result) without losing them', async () => {
    const create = vi.fn(async () => ({}));
    const client = mkMockClient(create);
    const ai = withOptimizer(client, {
      maxTokens: 10_000,
      strategy: 'sliding-window',
      slidingWindow: { size: 6 },
    });

    await ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [
        { role: 'user', content: 'do a thing' },
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 't1', name: 'x', input: { q: 1 } }],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 't1', content: 'result' }],
        },
        { role: 'assistant', content: 'done' },
      ],
    });

    const forwarded = create.mock.calls[0]![0] as { messages: Array<{ content: unknown }> };
    const flat = JSON.stringify(forwarded.messages);
    expect(flat).toContain('tool_use');
    expect(flat).toContain('tool_result');
  });
});

// Compile-time type check.
import type Anthropic from '@anthropic-ai/sdk';
function _typeCompat(client: Anthropic) {
  const ai = withOptimizer(client, { maxTokens: 8000, strategy: 'sliding-window' });
  const _c: Anthropic = ai.client;
  void _c;
}
void _typeCompat;
