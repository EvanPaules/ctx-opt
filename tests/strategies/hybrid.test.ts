import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextOptimizer } from '../../src/optimizer.js';
import { _clearSummaryCache } from '../../src/strategies/summarizer.js';
import type { Message, RelevanceScorerFn, SummarizerLLMFn } from '../../src/types.js';
import { countMessageTokens } from '../../src/token-counter.js';

function longMessages(n: number): Message[] {
  const filler = 'lorem ipsum dolor sit amet '.repeat(40);
  const out: Message[] = [{ role: 'system', content: 'you are helpful' }];
  for (let i = 0; i < n; i++) {
    out.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `[${i}] ${filler}`,
    });
  }
  return out;
}

describe('hybrid strategy', () => {
  beforeEach(() => {
    _clearSummaryCache();
  });

  it('runs relevance first and reports hybrid as the strategy used', async () => {
    const messages = longMessages(20);
    const tokens = countMessageTokens(messages);
    const scorer: RelevanceScorerFn = vi.fn(async (msgs) =>
      msgs.map(() => 0.9)
    );
    const llmCall: SummarizerLLMFn = vi.fn(async () => 'short summary');

    const opt = new ContextOptimizer({
      maxTokens: Math.floor(tokens / 4),
      strategy: 'hybrid',
      recentWindow: 4,
      relevance: { scorer, minScore: 0.1 },
      summarizer: { llmCall, triggerThreshold: 0.5 },
    });

    const r = await opt.optimize(messages, { task: 'find the bug' });

    expect(scorer).toHaveBeenCalledTimes(1);
    expect(r.meta.strategyUsed).toBe('hybrid');
    expect(r.meta.messagesDropped).toBeGreaterThan(0);
    expect(r.meta.withinBudget).toBe(true);
  });

  it('skips summarizer if relevance alone gets us under budget', async () => {
    // Tight budget so optimization runs, but relevance has enough headroom
    // to bring us under without help from the summarizer.
    const messages = longMessages(20);
    const tokens = countMessageTokens(messages);
    const scorer: RelevanceScorerFn = vi.fn(async (msgs) =>
      msgs.map(() => 0)
    );
    const llmCall: SummarizerLLMFn = vi.fn(async () => 'summary');

    const opt = new ContextOptimizer({
      maxTokens: Math.floor(tokens / 4),
      strategy: 'hybrid',
      recentWindow: 2,
      relevance: { scorer, minScore: 0.5 },
      summarizer: { llmCall, triggerThreshold: 0.85 },
    });

    await opt.optimize(messages, { task: 'task' });
    expect(scorer).toHaveBeenCalledTimes(1);
    expect(llmCall).not.toHaveBeenCalled();
  });

  it('falls back to sliding window if both relevance and summarizer leave it over budget', async () => {
    const messages = longMessages(20);
    const tokens = countMessageTokens(messages);
    // Relevance keeps everything (max scores).
    const scorer: RelevanceScorerFn = vi.fn(async (msgs) =>
      msgs.map(() => 1)
    );
    // Summarizer returns a long summary — barely helps.
    const longSummary = 'word '.repeat(500);
    const llmCall: SummarizerLLMFn = vi.fn(async () => longSummary);

    const opt = new ContextOptimizer({
      maxTokens: Math.floor(tokens / 10),
      strategy: 'hybrid',
      recentWindow: 2,
      relevance: { scorer, minScore: 0 },
      summarizer: { llmCall, triggerThreshold: 0.5 },
    });

    const r = await opt.optimize(messages);
    // We must end up under budget thanks to the sliding-window fallback.
    expect(r.meta.outputTokens).toBeLessThanOrEqual(opt['config'].maxTokens);
    expect(r.meta.withinBudget).toBe(true);
  });

  it('works with only relevance configured (no summarizer)', async () => {
    const messages = longMessages(15);
    const scorer: RelevanceScorerFn = vi.fn(async (msgs) =>
      msgs.map((_, i) => (i % 3 === 0 ? 0.9 : 0))
    );
    const opt = new ContextOptimizer({
      maxTokens: 800,
      strategy: 'hybrid',
      recentWindow: 2,
      relevance: { scorer, minScore: 0.5 },
    });
    const r = await opt.optimize(messages);
    expect(r.meta.strategyUsed).toBe('hybrid');
    expect(r.meta.withinBudget).toBe(true);
  });

  it('works with only summarizer configured (no relevance)', async () => {
    const messages = longMessages(15);
    const tokens = countMessageTokens(messages);
    const llmCall: SummarizerLLMFn = vi.fn(async () => 'compressed');
    const opt = new ContextOptimizer({
      maxTokens: Math.floor(tokens / 3),
      strategy: 'hybrid',
      recentWindow: 4,
      summarizer: { llmCall, triggerThreshold: 0.5 },
    });
    const r = await opt.optimize(messages);
    expect(llmCall).toHaveBeenCalled();
    expect(r.meta.strategyUsed).toBe('hybrid');
  });

  it('fires the summarizer in hybrid when relevance and summarizer have different recent windows', async () => {
    // Relevance keeps a wide recent window (many always-kept messages),
    // pushing the post-relevance set over budget. Summarizer treats a
    // narrower window as recent, so the post-relevance set has real
    // compressible material for llmCall to operate on.
    const messages = longMessages(30);
    const tokens = countMessageTokens(messages);
    const scorer: RelevanceScorerFn = vi.fn(async (msgs) =>
      msgs.map(() => 0.9)
    );
    const llmCall: SummarizerLLMFn = vi.fn(async () => 'short summary text');

    const opt = new ContextOptimizer({
      maxTokens: Math.floor(tokens / 6),
      strategy: 'hybrid',
      relevance: { scorer, minScore: 0.1, recentWindow: 10 },
      summarizer: { llmCall, triggerThreshold: 0.5, recentWindow: 2 },
    });

    const r = await opt.optimize(messages, { task: 'task' });

    expect(scorer).toHaveBeenCalledTimes(1);
    expect(llmCall).toHaveBeenCalledTimes(1);
    expect(r.meta.messagesSummarized).toBeGreaterThan(0);
    expect(r.meta.strategyUsed).toBe('hybrid');
  });

  it('always preserves system message through hybrid pipeline', async () => {
    const messages = longMessages(20);
    const tokens = countMessageTokens(messages);
    const scorer: RelevanceScorerFn = vi.fn(async (msgs) =>
      msgs.map(() => 0.5)
    );
    const llmCall: SummarizerLLMFn = vi.fn(async () => 'summary');
    const opt = new ContextOptimizer({
      maxTokens: Math.floor(tokens / 5),
      strategy: 'hybrid',
      recentWindow: 2,
      relevance: { scorer, minScore: 0.1 },
      summarizer: { llmCall, triggerThreshold: 0.5 },
    });
    const r = await opt.optimize(messages);
    expect(r.messages[0]?.role).toBe('system');
  });
});
