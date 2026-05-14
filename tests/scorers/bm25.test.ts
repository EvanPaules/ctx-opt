import { describe, it, expect } from 'vitest';
import { bm25Scorer } from '../../src/scorers/bm25.js';
import type { Message } from '../../src/types.js';

describe('bm25Scorer', () => {
  it('returns one score per message', async () => {
    const score = bm25Scorer();
    const messages: Message[] = [
      { role: 'user', content: 'how do I use the summarizer strategy' },
      { role: 'assistant', content: 'configure it with an llmCall' },
    ];
    const r = await score(messages, 'summarizer');
    expect(r).toHaveLength(2);
  });

  it('scores higher for messages that share terms with the task', async () => {
    const score = bm25Scorer();
    const messages: Message[] = [
      { role: 'user', content: 'how do I configure the summarizer strategy with anthropic' },
      { role: 'user', content: 'what time is it' },
      { role: 'assistant', content: 'two thirty' },
    ];
    const r = await score(messages, 'summarizer configuration');
    expect(r[0]!).toBeGreaterThan(r[1]!);
    expect(r[0]!).toBeGreaterThan(r[2]!);
  });

  it('returns all zeros when the task has no terms', async () => {
    const score = bm25Scorer();
    const messages: Message[] = [{ role: 'user', content: 'hello' }];
    const r = await score(messages, '   ');
    expect(r).toEqual([0]);
  });

  it('returns all zeros when no message contains any query term', async () => {
    const score = bm25Scorer();
    const messages: Message[] = [
      { role: 'user', content: 'apples are tasty' },
      { role: 'user', content: 'rivers flow downhill' },
    ];
    const r = await score(messages, 'submarine warfare doctrine');
    expect(r.every((s) => s === 0)).toBe(true);
  });

  it('normalizes scores to [0, 1]', async () => {
    const score = bm25Scorer();
    const messages: Message[] = [
      { role: 'user', content: 'token budget context window optimization' },
      { role: 'user', content: 'token token token token token token token' },
      { role: 'user', content: 'unrelated content here' },
    ];
    const r = await score(messages, 'token budget');
    for (const s of r) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
    expect(Math.max(...r)).toBe(1);
  });
});
