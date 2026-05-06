import { describe, it, expect } from 'vitest';
import { applySlidingWindow } from '../../src/strategies/sliding-window.js';
import type { Message, OptimizerConfig } from '../../src/types.js';

const baseConfig: OptimizerConfig = {
  maxTokens: 10_000,
  strategy: 'sliding-window',
  slidingWindow: { size: 4 },
};

function mkMessages(n: number): Message[] {
  const out: Message[] = [{ role: 'system', content: 'you are helpful' }];
  for (let i = 0; i < n; i++) {
    out.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `msg ${i}` });
  }
  return out;
}

describe('applySlidingWindow', () => {
  it('keeps system message + last N non-system messages', () => {
    const messages = mkMessages(10);
    const r = applySlidingWindow(messages, baseConfig);
    expect(r.messages[0]?.role).toBe('system');
    // size=4 includes system (1) so we keep 3 most recent non-system.
    const nonSystem = r.messages.filter((m) => m.role !== 'system');
    expect(nonSystem.length).toBe(3);
    expect(nonSystem[nonSystem.length - 1]?.content).toBe('msg 9');
  });

  it('drops oldest messages first', () => {
    const messages = mkMessages(6);
    const r = applySlidingWindow(messages, { ...baseConfig, slidingWindow: { size: 3 } });
    const contents = r.messages.map((m) => m.content);
    expect(contents).not.toContain('msg 0');
    expect(contents).toContain('msg 5');
  });

  it('returns all messages if shorter than window size', () => {
    const messages = mkMessages(2);
    const r = applySlidingWindow(messages, { ...baseConfig, slidingWindow: { size: 10 } });
    expect(r.messages.length).toBe(messages.length);
    expect(r.messagesDropped).toBe(0);
  });

  it('does not split a tool-pair across the window boundary', () => {
    const messages: Message[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'old' },
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 't1', name: 'search', input: {} }],
      },
      {
        role: 'tool',
        content: [{ type: 'tool_result', tool_use_id: 't1', content: 'result' }],
      },
      { role: 'user', content: 'recent 1' },
      { role: 'assistant', content: 'recent 2' },
    ];

    // size=3 includes system + 2 most recent. The tool-pair sits just before
    // the window. The keeper logic should not include only one half of it.
    const r = applySlidingWindow(messages, {
      ...baseConfig,
      slidingWindow: { size: 3 },
    });
    const hasToolUse = r.messages.some(
      (m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_use')
    );
    const hasToolResult = r.messages.some(
      (m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_result')
    );
    expect(hasToolUse).toBe(hasToolResult);
  });
});
