import type { Message } from '../src/types.js';

/**
 * Build a synthetic but realistic-looking customer-support conversation
 * with `turns` user/assistant exchanges. Each message has variable length
 * so the workload looks like a real chat history.
 */
export function buildConversation(turns: number): Message[] {
  const out: Message[] = [
    {
      role: 'system',
      content:
        'You are CtxBot, a helpful assistant for the Ctx-Opt JavaScript library. ' +
        'Answer questions clearly. Cite version numbers when relevant. ' +
        'If the user is asking about a bug, ask for a minimal reproduction.',
    },
  ];

  const topics = [
    'sliding window strategy',
    'summarizer setup',
    'relevance scoring',
    'token counting accuracy',
    'tool-call preservation',
    'TypeScript types',
    'browser usage',
    'OpenAI integration',
    'Anthropic integration',
    'LangChain integration',
    'streaming responses',
    'CJS vs ESM imports',
    'tree-shaking',
    'bundle size',
    'error handling',
  ];

  const filler = (seed: number, words: number): string => {
    const pool = [
      'token', 'message', 'budget', 'context', 'history', 'optimize', 'compress',
      'summary', 'window', 'recent', 'score', 'relevance', 'cache', 'strategy',
      'config', 'preserve', 'split', 'pair', 'system', 'assistant', 'user',
    ];
    const parts: string[] = [];
    for (let i = 0; i < words; i++) {
      parts.push(pool[(seed + i * 7) % pool.length]!);
    }
    return parts.join(' ');
  };

  for (let i = 0; i < turns; i++) {
    const topic = topics[i % topics.length]!;
    out.push({
      role: 'user',
      content: `I have a question about ${topic}. ${filler(i, 40 + (i % 20))}?`,
    });
    out.push({
      role: 'assistant',
      content:
        `Great question about ${topic}. ` +
        `${filler(i + 100, 60 + (i % 30))}. ` +
        `Let me know if that helps or if you want me to elaborate.`,
    });
  }
  return out;
}
