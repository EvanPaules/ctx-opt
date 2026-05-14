/**
 * Drop-in OpenAI example.
 *
 * Replace your `new OpenAI()` with the wrapped client and every call to
 * `chat.completions.create` will run its messages through ctx-opt first.
 *
 * Run:
 *   npm install openai
 *   OPENAI_API_KEY=sk-... tsx examples/openai.ts
 */
import OpenAI from 'openai';
import { withOptimizer } from '../src/adapters/openai.js';

async function main(): Promise<void> {
  const ai = withOptimizer(new OpenAI(), {
    maxTokens: 8_000,
    strategy: 'sliding-window',
    slidingWindow: { size: 12 },
    model: 'gpt-4o',
  });

  // Pretend we have a 300-message history; we'll fake it inline here.
  const history = buildLongHistory(300);

  const res = await ai.chat.completions.create({
    model: 'gpt-4o',
    messages: history,
  });

  console.log('Response:', res.choices[0]?.message?.content);
  console.log('Optimization meta:', ai.lastMeta);
}

function buildLongHistory(n: number): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const out: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: 'You are a helpful coding assistant.' },
  ];
  for (let i = 0; i < n; i++) {
    out.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content:
        i % 2 === 0
          ? `Question ${i}: Tell me something interesting about typescript.`
          : `Answer ${i}: TypeScript adds optional static types to JavaScript.`,
    });
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
