import { describe, it, expect, vi } from 'vitest';
import { withOptimizer, trimMessages } from '../../src/adapters/ai-sdk.js';
import { ContextOptimizer } from '../../src/optimizer.js';

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

describe('ai-sdk adapter / withOptimizer', () => {
  it('trims messages before forwarding to the wrapped function', async () => {
    const fn = vi.fn(async (params: { messages: unknown[] }) => ({
      text: 'ok',
      params,
    }));
    const wrapped = withOptimizer(fn, {
      maxTokens: 600,
      strategy: 'sliding-window',
      slidingWindow: { size: 4 },
    });

    const result = await wrapped({
      model: { fakeModel: true } as never,
      messages: longHistory(20),
    });

    expect(fn).toHaveBeenCalledTimes(1);
    const forwarded = fn.mock.calls[0]![0] as { messages: unknown[] };
    expect(forwarded.messages.length).toBeLessThan(20);
    expect(result.text).toBe('ok');
  });

  it('splits top-level system back out after optimization', async () => {
    const fn = vi.fn(async (params: unknown) => ({ params }));
    const wrapped = withOptimizer(fn, {
      maxTokens: 600,
      strategy: 'sliding-window',
      slidingWindow: { size: 4 },
    });

    await wrapped({
      model: { fakeModel: true } as never,
      system: 'you are concise',
      messages: longHistory(20),
    });

    const forwarded = fn.mock.calls[0]![0] as {
      system?: string;
      messages: Array<{ role: string }>;
    };
    expect(forwarded.system).toBe('you are concise');
    expect(forwarded.messages.every((m) => m.role !== 'system')).toBe(true);
  });

  it('passes other params through unchanged', async () => {
    const fn = vi.fn(async (params: unknown) => params);
    const wrapped = withOptimizer(fn, {
      maxTokens: 10_000,
      strategy: 'sliding-window',
    });

    await wrapped({
      model: { fakeModel: true } as never,
      temperature: 0.7,
      maxOutputTokens: 200,
      messages: [{ role: 'user', content: 'hi' }],
    });

    const forwarded = fn.mock.calls[0]![0] as Record<string, unknown>;
    expect(forwarded.temperature).toBe(0.7);
    expect(forwarded.maxOutputTokens).toBe(200);
  });

  it('exposes lastMeta after a call', async () => {
    const fn = vi.fn(async () => ({}));
    const wrapped = withOptimizer(fn, {
      maxTokens: 600,
      strategy: 'sliding-window',
      slidingWindow: { size: 4 },
    });
    expect(wrapped.lastMeta).toBeUndefined();
    await wrapped({ model: {} as never, messages: longHistory(20) });
    expect(wrapped.lastMeta).toBeDefined();
    expect(wrapped.lastMeta!.strategyUsed).toBe('sliding-window');
  });

  it('exposes the optimizer instance', async () => {
    const optimizer = new ContextOptimizer({
      maxTokens: 600,
      strategy: 'sliding-window',
    });
    const wrapped = withOptimizer(vi.fn(async () => ({})), optimizer);
    expect(wrapped.optimizer).toBe(optimizer);
  });

  it('skips optimization when params has no messages array', async () => {
    const fn = vi.fn(async (p) => p);
    const wrapped = withOptimizer(fn, {
      maxTokens: 100,
      strategy: 'sliding-window',
    });
    await wrapped({ model: {} as never, prompt: 'hello' });
    expect(fn).toHaveBeenCalledWith({ model: {}, prompt: 'hello' });
    expect(wrapped.lastMeta).toBeUndefined();
  });
});

describe('ai-sdk adapter / trimMessages', () => {
  it('returns a shorter array when over budget', async () => {
    const out = await trimMessages(longHistory(20), {
      maxTokens: 600,
      strategy: 'sliding-window',
      slidingWindow: { size: 4 },
    });
    expect(out.length).toBeLessThan(20);
  });

  it('passes through when under budget', async () => {
    const input = [{ role: 'user', content: 'hi' }];
    const out = await trimMessages(input, {
      maxTokens: 10_000,
      strategy: 'sliding-window',
    });
    expect(out.length).toBe(1);
  });

  it('accepts a pre-built optimizer', async () => {
    const optimizer = new ContextOptimizer({
      maxTokens: 600,
      strategy: 'sliding-window',
      slidingWindow: { size: 4 },
    });
    const out = await trimMessages(longHistory(20), optimizer);
    expect(out.length).toBeLessThan(20);
  });
});
