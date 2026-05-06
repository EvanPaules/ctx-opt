import { describe, it, expect } from 'vitest';
import { countTokens, countMessageTokens } from '../src/token-counter.js';
import type { Message } from '../src/types.js';

describe('countTokens', () => {
  it('returns a number > 0 for non-empty strings', () => {
    expect(countTokens('hello world')).toBeGreaterThan(0);
  });

  it('returns 0 for empty string', () => {
    expect(countTokens('')).toBe(0);
  });
});

describe('countMessageTokens', () => {
  it('returns 0 for an empty array', () => {
    expect(countMessageTokens([])).toBe(0);
  });

  it('includes per-message overhead beyond raw content tokens', () => {
    const text = 'this is the body of a message that has some content';
    const raw = countTokens(text);
    const messages: Message[] = [{ role: 'user', content: text }];
    const withOverhead = countMessageTokens(messages);
    expect(withOverhead).toBeGreaterThan(raw);
  });

  it('scales with the number of messages', () => {
    const one: Message[] = [{ role: 'user', content: 'one message' }];
    const three: Message[] = [
      { role: 'user', content: 'one message' },
      { role: 'assistant', content: 'two message' },
      { role: 'user', content: 'three message' },
    ];
    expect(countMessageTokens(three)).toBeGreaterThan(countMessageTokens(one));
  });
});
