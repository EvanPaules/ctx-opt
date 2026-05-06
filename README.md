# ctx-opt

[![npm version](https://img.shields.io/npm/v/ctx-opt.svg)](https://www.npmjs.com/package/ctx-opt)
[![CI](https://github.com/EvanPaules/ctx-opt/actions/workflows/ci.yml/badge.svg)](https://github.com/EvanPaules/ctx-opt/actions/workflows/ci.yml)
[![bundle size](https://img.shields.io/bundlephobia/minzip/ctx-opt)](https://bundlephobia.com/package/ctx-opt)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Intelligent context window optimization middleware for LLM applications. Drop it in
front of any chat-completion call: it takes a `messages[]` array, trims or compresses
it to fit a token budget, and returns the optimized array plus metadata describing
exactly what it did.

- Framework-agnostic — works with the OpenAI SDK, Anthropic SDK, or anything else that
  consumes a chat `messages[]` array.
- Strict TypeScript types. ESM and CJS builds. Node 18+ and browser-friendly.
- No required peer dependencies — bring your own LLM client.

## Install

```bash
npm install ctx-opt
```

## Quick start

```ts
import { ContextOptimizer } from 'ctx-opt';

const optimizer = new ContextOptimizer({
  maxTokens: 8_000,
  strategy: 'sliding-window',
  slidingWindow: { size: 12 },
});

const { messages, meta } = await optimizer.optimize(history);

// Now pass `messages` to your LLM client.
console.log(`saved ${meta.saved} tokens (${meta.compressionRatio.toFixed(2)}x)`);
```

## Strategies

| Strategy         | Speed     | Quality   | Needs LLM call? | When to use |
|------------------|-----------|-----------|-----------------|-------------|
| `sliding-window` | Fastest   | Good      | No              | Default. Cheap, predictable, lossy at the tails. |
| `summarizer`     | Slow      | Best      | Yes             | Long sessions where older context still matters. |
| `relevance`      | Medium    | High      | Yes (scorer)    | Heterogeneous histories where some turns clearly aren't relevant. |
| `hybrid`         | Slow      | Best      | Yes (both)      | Production: relevance-filter first, then summarize the rest if still over budget. |

All strategies preserve the system prompt by default and never split a tool-use /
tool-result pair across the boundary.

## API

### `new ContextOptimizer(config)`

```ts
interface OptimizerConfig {
  maxTokens: number;                    // hard token budget for the output
  strategy: 'sliding-window' | 'summarizer' | 'relevance' | 'hybrid';
  model?: string;                       // for token-counting accuracy (default: 'gpt-4o')
  preserveSystem?: boolean;             // default: true
  recentWindow?: number;                // never-drop window size (default: 6)

  slidingWindow?: { size: number };

  summarizer?: {
    llmCall: SummarizerLLMFn;           // your LLM call — see "Plugging in your LLM"
    maxSummaryTokens?: number;          // default: 400
    triggerThreshold?: number;          // 0..1, default: 0.85
  };

  relevance?: {
    scorer: RelevanceScorerFn;          // your scorer — returns one score per message
    minScore?: number;                  // default: 0.2
  };
}
```

### `optimize(messages, input?)`

Returns `{ messages, meta }`. If the input is already within budget, the array is
returned unchanged but `meta` is still populated.

```ts
interface OptimizeInput {
  task?: string;                        // current user goal — used by relevance strategy
  forceStrategy?: StrategyName;         // override config strategy for this call
}
```

### `countTokens(messages)`

Token count for a messages array, including per-message overhead.

### `withinBudget(messages)`

Returns `true` if `countTokens(messages) <= maxTokens`.

### `updateConfig(patch)`

Apply a partial update to the config without creating a new instance.

## Plugging in your LLM

The summarizer and relevance strategies need you to provide the actual model call.
This keeps `ctx-opt` zero-dependency on any specific SDK.

### Anthropic example

```ts
import Anthropic from '@anthropic-ai/sdk';
import type { SummarizerLLMFn } from 'ctx-opt';

const client = new Anthropic();

const llmCall: SummarizerLLMFn = async (messages, instruction) => {
  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: instruction,
    messages: messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    })),
  });
  const block = res.content[0];
  return block && block.type === 'text' ? block.text : '';
};
```

### OpenAI example

```ts
import OpenAI from 'openai';
import type { SummarizerLLMFn } from 'ctx-opt';

const client = new OpenAI();

const llmCall: SummarizerLLMFn = async (messages, instruction) => {
  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: instruction },
      ...messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      })) as any,
    ],
  });
  return res.choices[0]?.message?.content ?? '';
};
```

## The metadata object

Every call to `optimize()` returns a `meta` describing what happened:

| Field                | Meaning |
|----------------------|---------|
| `inputTokens`        | Token count of the input `messages[]`. |
| `outputTokens`       | Token count after optimization. |
| `saved`              | `inputTokens - outputTokens`. |
| `compressionRatio`   | `outputTokens / inputTokens`. |
| `strategyUsed`       | Which strategy actually ran (useful when `forceStrategy` is set). |
| `messagesDropped`    | Number of messages removed from the array. |
| `messagesSummarized` | Number of messages that were folded into a summary. |
| `withinBudget`       | `true` if `outputTokens <= maxTokens`. |

## Token counting accuracy

`ctx-opt` uses [`js-tiktoken`](https://github.com/dqbd/tiktoken) for token counts.

- **OpenAI models** — model-specific encoding when known, falling back to `cl100k_base`.
- **Anthropic models** — `cl100k_base` is the closest publicly available approximation.
  Counts will be within a few percent of the official tokenizer.
- A **per-message overhead** of 4 tokens is added to each message to approximate the
  role and formatting tokens (per OpenAI's chat-completion cookbook formula).

For exact Anthropic counts, call Anthropic's `messages.countTokens` API and pass that
through your own wrapper.

## License

MIT
