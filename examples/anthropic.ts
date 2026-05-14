/**
 * Drop-in Anthropic example.
 *
 * The wrapper hoists `system` into the optimizer view as a system-role
 * message, runs optimization, then splits it back out for Anthropic's API.
 *
 * Run:
 *   npm install @anthropic-ai/sdk
 *   ANTHROPIC_API_KEY=sk-... tsx examples/anthropic.ts
 */
import Anthropic from '@anthropic-ai/sdk';
import { withOptimizer } from '../src/adapters/anthropic.js';

async function main(): Promise<void> {
  const ai = withOptimizer(new Anthropic(), {
    maxTokens: 8_000,
    strategy: 'sliding-window',
    slidingWindow: { size: 12 },
    model: 'claude-haiku-4-5-20251001',
  });

  const history = buildLongHistory(300);

  const res = await ai.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: 'You are a helpful coding assistant.',
    messages: history,
  });

  const block = res.content[0];
  console.log('Response:', block && block.type === 'text' ? block.text : '<non-text>');
  console.log('Optimization meta:', ai.lastMeta);
}

function buildLongHistory(n: number): Array<{ role: 'user' | 'assistant'; content: string }> {
  const out: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (let i = 0; i < n; i++) {
    out.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content:
        i % 2 === 0
          ? `Question ${i}: Tell me something interesting about TypeScript.`
          : `Answer ${i}: TypeScript adds optional static types to JavaScript.`,
    });
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
