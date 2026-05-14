/**
 * Summarizer strategy with a real Anthropic LLM call.
 *
 * Long sessions benefit from compressing older turns into a single summary
 * message instead of just dropping them.
 *
 * Run:
 *   npm install @anthropic-ai/sdk
 *   ANTHROPIC_API_KEY=sk-... tsx examples/summarizer.ts
 */
import Anthropic from '@anthropic-ai/sdk';
import { ContextOptimizer } from '../src/optimizer.js';
import type { SummarizerLLMFn, Message } from '../src/types.js';

const client = new Anthropic();

const summarize: SummarizerLLMFn = async (messages, instruction) => {
  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: instruction,
    messages: messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content:
        typeof m.content === 'string'
          ? m.content
          : JSON.stringify(m.content),
    })),
  });
  const block = res.content[0];
  return block && block.type === 'text' ? block.text : '';
};

async function main(): Promise<void> {
  const optimizer = new ContextOptimizer({
    maxTokens: 4_000,
    strategy: 'summarizer',
    model: 'claude-haiku-4-5-20251001',
    recentWindow: 4,
    summarizer: {
      llmCall: summarize,
      maxSummaryTokens: 300,
      triggerThreshold: 0.8,
    },
  });

  const history = buildLongHistory(50);
  const { messages, meta } = await optimizer.optimize(history);

  console.log(
    `Optimized: ${meta.inputTokens} → ${meta.outputTokens} tokens (saved ${meta.saved}, ${meta.messagesSummarized} messages summarized)`
  );
  console.log(`Result has ${messages.length} messages.`);
}

function buildLongHistory(n: number): Message[] {
  const out: Message[] = [
    { role: 'system', content: 'You are a helpful assistant.' },
  ];
  for (let i = 0; i < n; i++) {
    out.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content:
        i % 2 === 0
          ? `Question ${i}: Tell me something interesting.`
          : `Answer ${i}: An interesting fact about programming.`,
    });
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
