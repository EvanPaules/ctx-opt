import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applySummarizer, _clearSummaryCache } from '../../src/strategies/summarizer.js';
import type { Message, OptimizerConfig, SummarizerLLMFn } from '../../src/types.js';
import { countMessageTokens } from '../../src/token-counter.js';

function longMessages(n: number): Message[] {
  const filler = 'lorem ipsum dolor sit amet '.repeat(50);
  const out: Message[] = [{ role: 'system', content: 'you are helpful' }];
  for (let i = 0; i < n; i++) {
    out.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `msg-${i} ${filler}`,
    });
  }
  return out;
}

describe('applySummarizer', () => {
  beforeEach(() => {
    _clearSummaryCache();
  });

  it('does NOT call llmCall if already under triggerThreshold', async () => {
    const llmCall: SummarizerLLMFn = vi.fn(async () => 'summary');
    const messages: Message[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'short' },
    ];
    const config: OptimizerConfig = {
      maxTokens: 10_000,
      strategy: 'summarizer',
      summarizer: { llmCall, triggerThreshold: 0.85 },
    };
    const r = await applySummarizer(messages, config);
    expect(llmCall).not.toHaveBeenCalled();
    expect(r.messagesSummarized).toBe(0);
    expect(r.messages).toEqual(messages);
  });

  it('calls llmCall only with compressible messages, not recent or system', async () => {
    const messages = longMessages(10);
    const tokens = countMessageTokens(messages);
    let receivedCompressible: Message[] = [];
    const llmCall: SummarizerLLMFn = vi.fn(async (msgs) => {
      receivedCompressible = msgs;
      return 'compressed history';
    });
    const config: OptimizerConfig = {
      maxTokens: Math.floor(tokens * 0.5),
      strategy: 'summarizer',
      recentWindow: 4,
      summarizer: { llmCall, triggerThreshold: 0.5 },
    };
    await applySummarizer(messages, config);
    expect(llmCall).toHaveBeenCalledTimes(1);
    // No system messages should be in the compressible set.
    expect(receivedCompressible.every((m) => m.role !== 'system')).toBe(true);
    // Exclude messages within the recent window (last 4).
    const recentContents = messages.slice(-4).map((m) => m.content);
    expect(
      receivedCompressible.every((m) => !recentContents.includes(m.content))
    ).toBe(true);
  });

  it('replaces compressible messages with a single summary assistant message', async () => {
    const messages = longMessages(10);
    const tokens = countMessageTokens(messages);
    const llmCall: SummarizerLLMFn = async () => 'compressed';
    const config: OptimizerConfig = {
      maxTokens: Math.floor(tokens * 0.5),
      strategy: 'summarizer',
      recentWindow: 4,
      summarizer: { llmCall, triggerThreshold: 0.5 },
    };
    const r = await applySummarizer(messages, config);
    const summaryMatches = r.messages.filter(
      (m) => typeof m.content === 'string' && m.content.startsWith('[Conversation summary:')
    );
    expect(summaryMatches.length).toBe(1);
    expect(r.messagesSummarized).toBeGreaterThan(0);
  });

  it('falls back to sliding-window by default when llmCall throws', async () => {
    const messages = longMessages(10);
    const tokens = countMessageTokens(messages);
    const llmCall: SummarizerLLMFn = vi.fn(async () => {
      throw new Error('rate limited');
    });
    const config: OptimizerConfig = {
      maxTokens: Math.floor(tokens * 0.5),
      strategy: 'summarizer',
      recentWindow: 4,
      summarizer: { llmCall, triggerThreshold: 0.5 },
    };
    const r = await applySummarizer(messages, config);
    expect(r.fellBackTo).toBe('sliding-window');
    expect(r.messagesSummarized).toBe(0);
    expect(r.messages.length).toBeLessThan(messages.length);
  });

  it('propagates the error when onError is "throw"', async () => {
    const messages = longMessages(10);
    const tokens = countMessageTokens(messages);
    const llmCall: SummarizerLLMFn = async () => {
      throw new Error('boom');
    };
    const config: OptimizerConfig = {
      maxTokens: Math.floor(tokens * 0.5),
      strategy: 'summarizer',
      recentWindow: 4,
      summarizer: { llmCall, triggerThreshold: 0.5, onError: 'throw' },
    };
    await expect(applySummarizer(messages, config)).rejects.toThrow(/boom/);
  });

  it('calls the function onError handler with the error before falling back', async () => {
    const messages = longMessages(10);
    const tokens = countMessageTokens(messages);
    const onError = vi.fn();
    const llmCall: SummarizerLLMFn = async () => {
      throw new Error('rate limited');
    };
    const config: OptimizerConfig = {
      maxTokens: Math.floor(tokens * 0.5),
      strategy: 'summarizer',
      recentWindow: 4,
      summarizer: { llmCall, triggerThreshold: 0.5, onError },
    };
    const r = await applySummarizer(messages, config);
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]![0] as Error).message).toBe('rate limited');
    expect(r.fellBackTo).toBe('sliding-window');
  });

  it('reports fellBackTo when there is no compressible material', async () => {
    // All messages fit in the recent window so nothing is compressible.
    const messages: Message[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'one ' + 'tokens '.repeat(500) },
      { role: 'assistant', content: 'two ' + 'tokens '.repeat(500) },
    ];
    const llmCall = vi.fn(async () => 'should not be called');
    const config: OptimizerConfig = {
      maxTokens: 100,
      strategy: 'summarizer',
      recentWindow: 4,
      summarizer: { llmCall, triggerThreshold: 0.1 },
    };
    const r = await applySummarizer(messages, config);
    expect(r.fellBackTo).toBe('sliding-window');
    expect(llmCall).not.toHaveBeenCalled();
  });

  it('uses cache on second call with same compressible messages', async () => {
    const messages = longMessages(10);
    const tokens = countMessageTokens(messages);
    const llmCall = vi.fn(async () => 'compressed');
    const config: OptimizerConfig = {
      maxTokens: Math.floor(tokens * 0.5),
      strategy: 'summarizer',
      recentWindow: 4,
      summarizer: { llmCall, triggerThreshold: 0.5 },
    };
    await applySummarizer(messages, config);
    await applySummarizer(messages, config);
    expect(llmCall).toHaveBeenCalledTimes(1);
  });
});
