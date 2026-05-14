import { describe, it, expect } from 'vitest';
import { ContextOptimizer } from '../src/optimizer.js';
import type { Message, OptimizerConfig } from '../src/types.js';
import { countMessageTokens } from '../src/token-counter.js';

function bigMessages(n: number): Message[] {
  const filler = 'lorem ipsum dolor sit amet consectetur adipiscing elit '.repeat(30);
  const out: Message[] = [{ role: 'system', content: 'you are helpful' }];
  for (let i = 0; i < n; i++) {
    out.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `[${i}] ${filler}`,
    });
  }
  return out;
}

describe('ContextOptimizer', () => {
  it('withinBudget returns true when under, false when over', () => {
    const messages = bigMessages(20);
    const tokens = countMessageTokens(messages);
    const overBudget = new ContextOptimizer({
      maxTokens: Math.floor(tokens / 2),
      strategy: 'sliding-window',
    });
    const underBudget = new ContextOptimizer({
      maxTokens: tokens * 2,
      strategy: 'sliding-window',
    });
    expect(overBudget.withinBudget(messages)).toBe(false);
    expect(underBudget.withinBudget(messages)).toBe(true);
  });

  it('sliding-window returns fewer messages when over budget', async () => {
    const messages = bigMessages(20);
    const tokens = countMessageTokens(messages);
    const opt = new ContextOptimizer({
      maxTokens: Math.floor(tokens / 4),
      strategy: 'sliding-window',
      slidingWindow: { size: 4 },
    });
    const r = await opt.optimize(messages);
    expect(r.messages.length).toBeLessThan(messages.length);
  });

  it('always preserves system message', async () => {
    const messages = bigMessages(20);
    const tokens = countMessageTokens(messages);
    const opt = new ContextOptimizer({
      maxTokens: Math.floor(tokens / 8),
      strategy: 'sliding-window',
      slidingWindow: { size: 3 },
    });
    const r = await opt.optimize(messages);
    expect(r.messages[0]?.role).toBe('system');
  });

  it('never splits a tool-pair', async () => {
    const filler = 'tokens '.repeat(200);
    const messages: Message[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: `old ${filler}` },
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 't1', name: 'x', input: {} }],
      },
      {
        role: 'tool',
        content: [{ type: 'tool_result', tool_use_id: 't1', content: 'r' }],
      },
      { role: 'user', content: `recent1 ${filler}` },
      { role: 'assistant', content: `recent2 ${filler}` },
      { role: 'user', content: `recent3 ${filler}` },
    ];
    const opt = new ContextOptimizer({
      maxTokens: 200,
      strategy: 'sliding-window',
      slidingWindow: { size: 3 },
    });
    const r = await opt.optimize(messages);
    const hasUse = r.messages.some(
      (m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_use')
    );
    const hasResult = r.messages.some(
      (m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_result')
    );
    expect(hasUse).toBe(hasResult);
  });

  it('meta has correct saved/inputTokens/outputTokens', async () => {
    const messages = bigMessages(20);
    const tokens = countMessageTokens(messages);
    const opt = new ContextOptimizer({
      maxTokens: Math.floor(tokens / 4),
      strategy: 'sliding-window',
      slidingWindow: { size: 4 },
    });
    const r = await opt.optimize(messages);
    expect(r.meta.inputTokens).toBe(tokens);
    expect(r.meta.outputTokens).toBe(countMessageTokens(r.messages));
    expect(r.meta.saved).toBe(r.meta.inputTokens - r.meta.outputTokens);
    expect(r.meta.strategyUsed).toBe('sliding-window');
  });

  it('returns original messages unchanged if already within budget', async () => {
    const messages: Message[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ];
    const opt = new ContextOptimizer({
      maxTokens: 10_000,
      strategy: 'sliding-window',
    });
    const r = await opt.optimize(messages);
    expect(r.messages).toEqual(messages);
    expect(r.meta.saved).toBe(0);
    expect(r.meta.withinBudget).toBe(true);
  });

  it('always returns meta even when no optimization is needed', async () => {
    const opt = new ContextOptimizer({
      maxTokens: 10_000,
      strategy: 'sliding-window',
    });
    const r = await opt.optimize([{ role: 'user', content: 'hi' }]);
    expect(r.meta).toBeDefined();
    expect(typeof r.meta.compressionRatio).toBe('number');
  });
});

describe('ContextOptimizer fellBackTo', () => {
  it('surfaces fellBackTo in meta when summarizer falls back to sliding-window', async () => {
    const messages = bigMessages(10);
    const tokens = countMessageTokens(messages);
    const opt = new ContextOptimizer({
      maxTokens: Math.floor(tokens / 4),
      strategy: 'summarizer',
      recentWindow: 4,
      summarizer: {
        llmCall: async () => {
          throw new Error('outage');
        },
        triggerThreshold: 0.5,
      },
    });
    const r = await opt.optimize(messages);
    expect(r.meta.fellBackTo).toBe('sliding-window');
    expect(r.meta.strategyUsed).toBe('summarizer');
  });

  it('does not set fellBackTo on a clean strategy run', async () => {
    const messages = bigMessages(10);
    const tokens = countMessageTokens(messages);
    const opt = new ContextOptimizer({
      maxTokens: Math.floor(tokens / 4),
      strategy: 'sliding-window',
      slidingWindow: { size: 4 },
    });
    const r = await opt.optimize(messages);
    expect(r.meta.fellBackTo).toBeUndefined();
  });
});

describe('ContextOptimizer config', () => {
  it('updateConfig changes future behavior', async () => {
    const messages = bigMessages(20);
    const tokens = countMessageTokens(messages);
    const config: OptimizerConfig = {
      maxTokens: tokens * 2,
      strategy: 'sliding-window',
    };
    const opt = new ContextOptimizer(config);
    expect(opt.withinBudget(messages)).toBe(true);
    opt.updateConfig({ maxTokens: Math.floor(tokens / 2) });
    expect(opt.withinBudget(messages)).toBe(false);
  });
});
