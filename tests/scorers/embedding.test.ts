import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createEmbeddingScorer,
  _clearEmbeddingCache,
  _embeddingCacheSize,
} from '../../src/scorers/embedding.js';
import type { Message } from '../../src/types.js';

describe('createEmbeddingScorer', () => {
  beforeEach(() => {
    _clearEmbeddingCache();
  });

  it('returns one score per message in [0, 1]', async () => {
    const embed = vi.fn(async (texts: string[]) => texts.map(() => [1, 0, 0]));
    const score = createEmbeddingScorer({ embed });
    const messages: Message[] = [
      { role: 'user', content: 'a' },
      { role: 'user', content: 'b' },
    ];
    const r = await score(messages, 'task');
    expect(r).toHaveLength(2);
    for (const s of r) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it('scores identical-vector messages higher than orthogonal ones', async () => {
    // Task vector = [1, 0]. Message 1 vector = [1, 0] (cosine = 1).
    // Message 2 vector = [0, 1] (cosine = 0).
    const embed = vi.fn(async (texts: string[]) => {
      return texts.map((t) => {
        if (t === 'task') return [1, 0];
        if (t === 'aligned') return [1, 0];
        return [0, 1];
      });
    });
    const score = createEmbeddingScorer({ embed });
    const r = await score(
      [
        { role: 'user', content: 'aligned' },
        { role: 'user', content: 'orthogonal' },
      ],
      'task'
    );
    expect(r[0]!).toBeGreaterThan(r[1]!);
  });

  it('caches message embeddings across calls', async () => {
    const embed = vi.fn(async (texts: string[]) => texts.map(() => [1, 0]));
    const score = createEmbeddingScorer({ embed, cacheKey: 'cache-test' });
    const messages: Message[] = [
      { role: 'user', content: 'a' },
      { role: 'user', content: 'b' },
    ];
    await score(messages, 'task');
    embed.mockClear();
    await score(messages, 'task');
    // Second call should be a full cache hit (task + both messages cached).
    expect(embed).not.toHaveBeenCalled();
  });

  it('only calls embed for the missing texts on subsequent calls', async () => {
    const embed = vi.fn(async (texts: string[]) => texts.map(() => [1, 0]));
    const score = createEmbeddingScorer({ embed, cacheKey: 'cache-partial' });
    await score([{ role: 'user', content: 'a' }], 'task');
    embed.mockClear();
    await score(
      [
        { role: 'user', content: 'a' },
        { role: 'user', content: 'b' },
      ],
      'task'
    );
    // Only 'b' should be embedded (task + 'a' are cached).
    expect(embed).toHaveBeenCalledTimes(1);
    const args = embed.mock.calls[0]![0] as string[];
    expect(args).toContain('b');
    expect(args).not.toContain('a');
  });

  it('caps the cache at maxCacheSize via LRU eviction', async () => {
    const embed = vi.fn(async (texts: string[]) => texts.map(() => [1, 0]));
    const score = createEmbeddingScorer({
      embed,
      cacheKey: 'cache-lru',
      maxCacheSize: 3,
    });

    // 5 unique messages + 1 task = 6 unique cache entries we try to store.
    // With a cap of 3 only the most-recent 3 should survive.
    await score(
      [
        { role: 'user', content: 'a' },
        { role: 'user', content: 'b' },
        { role: 'user', content: 'c' },
        { role: 'user', content: 'd' },
        { role: 'user', content: 'e' },
      ],
      'task'
    );

    expect(_embeddingCacheSize()).toBeLessThanOrEqual(3);
  });

  it('disables caching when maxCacheSize is 0', async () => {
    const embed = vi.fn(async (texts: string[]) => texts.map(() => [1, 0]));
    const score = createEmbeddingScorer({
      embed,
      cacheKey: 'cache-disabled',
      maxCacheSize: 0,
    });

    await score([{ role: 'user', content: 'a' }], 'task');
    expect(_embeddingCacheSize()).toBe(0);

    // Second call must re-embed because nothing was cached.
    embed.mockClear();
    await score([{ role: 'user', content: 'a' }], 'task');
    expect(embed).toHaveBeenCalled();
  });

  it('returns zeros for an empty task string', async () => {
    const embed = vi.fn(async (texts: string[]) => texts.map(() => [1, 0]));
    const score = createEmbeddingScorer({ embed });
    const r = await score([{ role: 'user', content: 'a' }], '');
    expect(r).toEqual([0]);
    expect(embed).not.toHaveBeenCalled();
  });
});
