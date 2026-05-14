import { describe, it, expect, vi } from 'vitest';
import { applyRelevance } from '../../src/strategies/relevance.js';
import type { Message, OptimizerConfig, RelevanceScorerFn } from '../../src/types.js';

function mkMessages(n: number): Message[] {
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

describe('applyRelevance', () => {
  it('throws if relevance config is missing', async () => {
    const messages = mkMessages(8);
    const config: OptimizerConfig = {
      maxTokens: 200,
      strategy: 'relevance',
    };
    await expect(applyRelevance(messages, config, 'task')).rejects.toThrow(
      /relevance config required/
    );
  });

  it('throws if scorer returns wrong-length score array', async () => {
    const messages = mkMessages(10);
    const scorer: RelevanceScorerFn = vi.fn(async () => [0.5, 0.5]);
    const config: OptimizerConfig = {
      maxTokens: 200,
      strategy: 'relevance',
      relevance: { scorer },
    };
    await expect(applyRelevance(messages, config, 'task')).rejects.toThrow(
      /one score per message/
    );
  });

  it('always preserves system messages regardless of score', async () => {
    const messages = mkMessages(10);
    const scorer: RelevanceScorerFn = vi.fn(async (msgs) =>
      msgs.map(() => 0)
    );
    const config: OptimizerConfig = {
      maxTokens: 200,
      strategy: 'relevance',
      recentWindow: 2,
      relevance: { scorer, minScore: 0.1 },
    };
    const r = await applyRelevance(messages, config, 'task');
    expect(r.messages[0]?.role).toBe('system');
  });

  it('always preserves the recent window regardless of score', async () => {
    const messages = mkMessages(10);
    const recentWindow = 3;
    const scorer: RelevanceScorerFn = vi.fn(async (msgs) =>
      msgs.map(() => 0)
    );
    const config: OptimizerConfig = {
      maxTokens: 100_000,
      strategy: 'relevance',
      recentWindow,
      relevance: { scorer, minScore: 0.1 },
    };
    const r = await applyRelevance(messages, config, 'task');
    const recent = messages.slice(-recentWindow);
    for (const rm of recent) {
      expect(r.messages.some((m) => m.content === rm.content)).toBe(true);
    }
  });

  it('drops candidates with score below minScore', async () => {
    const messages = mkMessages(8);
    // High score for message at index 1, near zero for the rest.
    const scorer: RelevanceScorerFn = vi.fn(async (msgs) =>
      msgs.map((_, i) => (i === 1 ? 0.99 : 0.01))
    );
    const config: OptimizerConfig = {
      maxTokens: 100_000,
      strategy: 'relevance',
      recentWindow: 2,
      relevance: { scorer, minScore: 0.5 },
    };
    const r = await applyRelevance(messages, config, 'task');
    // The high-scored message (index 1) should be present.
    expect(r.messages.some((m) => m.content === messages[1]!.content)).toBe(true);
    // A low-scored compressible message (e.g. index 2, not in recent window) should be dropped.
    const droppedCandidate = messages[2]!;
    const isInRecentOrSystem =
      droppedCandidate.role === 'system' ||
      messages.indexOf(droppedCandidate) >= messages.length - 2;
    if (!isInRecentOrSystem) {
      expect(r.messages.some((m) => m.content === droppedCandidate.content)).toBe(false);
    }
  });

  it('passes the task string through to the scorer', async () => {
    const messages = mkMessages(12);
    const scorer = vi.fn(async (msgs: Message[]) => msgs.map(() => 0.9));
    const config: OptimizerConfig = {
      maxTokens: 100_000,
      strategy: 'relevance',
      recentWindow: 2,
      relevance: { scorer },
    };
    await applyRelevance(messages, config, 'find the bug');
    expect(scorer).toHaveBeenCalledWith(expect.any(Array), 'find the bug');
  });

  it('does not call scorer when there are no candidates to score', async () => {
    const messages: Message[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'recent 1' },
      { role: 'assistant', content: 'recent 2' },
    ];
    const scorer = vi.fn(async () => []);
    const config: OptimizerConfig = {
      maxTokens: 10_000,
      strategy: 'relevance',
      recentWindow: 4,
      relevance: { scorer },
    };
    await applyRelevance(messages, config, 'task');
    expect(scorer).not.toHaveBeenCalled();
  });

  it('keeps tool-pair partners together', async () => {
    const filler = 'tokens '.repeat(80);
    const messages: Message[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: `q ${filler}` },
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
    ];
    // Score the tool_use message high and its partner zero.
    const scorer: RelevanceScorerFn = vi.fn(async (msgs) =>
      msgs.map((_, i) => (i === 2 ? 0.99 : 0.01))
    );
    const config: OptimizerConfig = {
      maxTokens: 10_000,
      strategy: 'relevance',
      recentWindow: 2,
      relevance: { scorer, minScore: 0 },
    };
    const r = await applyRelevance(messages, config, 'task');
    const hasUse = r.messages.some(
      (m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_use')
    );
    const hasResult = r.messages.some(
      (m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_result')
    );
    expect(hasUse).toBe(hasResult);
  });

  it('respects the token budget when adding scored candidates', async () => {
    const messages = mkMessages(20);
    // All compressible candidates score equally high; budget is tight.
    const scorer: RelevanceScorerFn = vi.fn(async (msgs) =>
      msgs.map(() => 0.9)
    );
    const config: OptimizerConfig = {
      maxTokens: 600,
      strategy: 'relevance',
      recentWindow: 2,
      relevance: { scorer, minScore: 0.1 },
    };
    const r = await applyRelevance(messages, config, 'task');
    expect(r.messages.length).toBeLessThan(messages.length);
  });
});
