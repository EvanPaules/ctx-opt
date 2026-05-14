import type { Message } from 'ctx-opt';

export const SAMPLE_HISTORY: Message[] = (() => {
  const out: Message[] = [
    {
      role: 'system',
      content:
        'You are CtxBot, a helpful assistant for the ctx-opt JavaScript library.',
    },
  ];
  const topics = [
    'sliding window strategy', 'summarizer setup', 'relevance scoring',
    'token counting', 'tool-call preservation', 'TypeScript types',
    'browser usage', 'OpenAI integration', 'Anthropic integration',
    'streaming', 'CJS vs ESM', 'tree-shaking', 'bundle size', 'error handling',
    'Vercel AI SDK', 'LangChain integration', 'cost savings', 'pricing models',
    'BM25 scoring', 'embedding scoring',
  ];
  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i]!;
    out.push({
      role: 'user',
      content: `I have a question about ${topic}. Can you explain how it works and what trade-offs I should be aware of?`,
    });
    out.push({
      role: 'assistant',
      content:
        `${topic} is supported in ctx-opt. The key considerations are: ` +
        'token budget enforcement, message preservation rules, configuration options, ' +
        'and integration with your chosen LLM provider. Let me know if you want me to dive deeper into any aspect.',
    });
  }
  return out;
})();
