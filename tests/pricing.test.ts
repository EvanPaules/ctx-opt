import { describe, it, expect } from 'vitest';
import { resolvePricing, tokensToUsd, DEFAULT_PRICING } from '../src/pricing.js';
import { ContextOptimizer } from '../src/optimizer.js';
import type { Message } from '../src/types.js';
import { countMessageTokens } from '../src/token-counter.js';

describe('pricing', () => {
  it('resolves a known OpenAI model', () => {
    const p = resolvePricing('gpt-4o', undefined);
    expect(p).toBeDefined();
    expect(p!.inputUsdPerMillion).toBe(2.5);
  });

  it('resolves a known Anthropic model', () => {
    const p = resolvePricing('claude-haiku-4-5-20251001', undefined);
    expect(p).toBeDefined();
    expect(p!.inputUsdPerMillion).toBe(0.8);
  });

  it('returns undefined for an unknown model', () => {
    const p = resolvePricing('unknown-model-xyz', undefined);
    expect(p).toBeUndefined();
  });

  it('returns undefined when model is omitted', () => {
    const p = resolvePricing(undefined, undefined);
    expect(p).toBeUndefined();
  });

  it('user override takes precedence over the default table', () => {
    const p = resolvePricing('gpt-4o', { 'gpt-4o': { inputUsdPerMillion: 999 } });
    expect(p!.inputUsdPerMillion).toBe(999);
  });

  it('falls back to a prefix match for versioned model IDs', () => {
    const p = resolvePricing('claude-sonnet-4-6-20260101', undefined);
    expect(p).toBeDefined();
    expect(p!.inputUsdPerMillion).toBe(3);
  });

  it('tokensToUsd computes per-million correctly', () => {
    expect(tokensToUsd(1_000_000, { inputUsdPerMillion: 2.5 })).toBeCloseTo(2.5);
    expect(tokensToUsd(500_000, { inputUsdPerMillion: 2.5 })).toBeCloseTo(1.25);
    expect(tokensToUsd(0, { inputUsdPerMillion: 2.5 })).toBe(0);
  });
});

describe('ContextOptimizer cost tracking', () => {
  function bigMessages(n: number): Message[] {
    const filler = 'lorem ipsum dolor sit amet '.repeat(40);
    const out: Message[] = [{ role: 'system', content: 'sys' }];
    for (let i = 0; i < n; i++) {
      out.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `[${i}] ${filler}`,
      });
    }
    return out;
  }

  it('populates inputCostUsd and savedUsd when model pricing is known', async () => {
    const messages = bigMessages(20);
    const tokens = countMessageTokens(messages);
    const opt = new ContextOptimizer({
      maxTokens: Math.floor(tokens / 4),
      strategy: 'sliding-window',
      slidingWindow: { size: 4 },
      model: 'gpt-4o',
    });
    const r = await opt.optimize(messages);
    expect(r.meta.inputCostUsd).toBeDefined();
    expect(r.meta.savedUsd).toBeDefined();
    expect(r.meta.savedUsd!).toBeGreaterThan(0);
    // savedUsd should equal saved tokens converted at gpt-4o pricing.
    const expected = (r.meta.saved * 2.5) / 1_000_000;
    expect(r.meta.savedUsd!).toBeCloseTo(expected);
  });

  it('omits cost fields when model is unknown', async () => {
    const messages = bigMessages(10);
    const opt = new ContextOptimizer({
      maxTokens: 100,
      strategy: 'sliding-window',
      slidingWindow: { size: 4 },
      model: 'mystery-model',
    });
    const r = await opt.optimize(messages);
    expect(r.meta.inputCostUsd).toBeUndefined();
    expect(r.meta.savedUsd).toBeUndefined();
  });

  it('honors a per-instance pricing override', async () => {
    const messages = bigMessages(10);
    const tokens = countMessageTokens(messages);
    const opt = new ContextOptimizer({
      maxTokens: Math.floor(tokens / 2),
      strategy: 'sliding-window',
      slidingWindow: { size: 4 },
      model: 'my-custom-model',
      pricing: { 'my-custom-model': { inputUsdPerMillion: 100 } },
    });
    const r = await opt.optimize(messages);
    expect(r.meta.savedUsd).toBeDefined();
    const expected = (r.meta.saved * 100) / 1_000_000;
    expect(r.meta.savedUsd!).toBeCloseTo(expected);
  });

  it('exposes the default pricing table for inspection', () => {
    expect(DEFAULT_PRICING['gpt-4o']).toBeDefined();
    expect(DEFAULT_PRICING['claude-haiku-4-5']).toBeDefined();
  });
});
