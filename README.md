# ctx-opt

[![npm version](https://img.shields.io/npm/v/ctx-opt.svg)](https://www.npmjs.com/package/ctx-opt)
[![CI](https://github.com/EvanPaules/ctx-opt/actions/workflows/ci.yml/badge.svg)](https://github.com/EvanPaules/ctx-opt/actions/workflows/ci.yml)
[![install size](https://packagephobia.com/badge?p=ctx-opt)](https://packagephobia.com/result?p=ctx-opt)
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

### One-line drop-in for OpenAI or Anthropic

If you're already using one of the major SDKs, wrap your client and stop
thinking about it:

```ts
import OpenAI from 'openai';
import { withOptimizer } from 'ctx-opt/openai';

const ai = withOptimizer(new OpenAI(), {
  maxTokens: 8_000,
  strategy: 'sliding-window',
});

// chat.completions.create now auto-trims `messages` to fit the budget.
const res = await ai.chat.completions.create({
  model: 'gpt-4o',
  messages: longHistory,
});

console.log(ai.lastMeta); // { saved, compressionRatio, ... }
```

```ts
import Anthropic from '@anthropic-ai/sdk';
import { withOptimizer } from 'ctx-opt/anthropic';

const ai = withOptimizer(new Anthropic(), {
  maxTokens: 8_000,
  strategy: 'sliding-window',
  model: 'claude-haiku-4-5-20251001',
});

const res = await ai.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 1024,
  system: 'you are concise',
  messages: longHistory,
});
```

```ts
import { generateText } from 'ai';
import { withOptimizer } from 'ctx-opt/ai-sdk';

const trimmedGenerate = withOptimizer(generateText, {
  maxTokens: 8_000,
  strategy: 'sliding-window',
});

const { text } = await trimmedGenerate({
  model: openai('gpt-4o'),
  messages: longHistory,
});
```

`openai`, `@anthropic-ai/sdk`, and `ai` are **optional peer deps** — install
only the one(s) you use. See [`examples/`](./examples) for OpenAI, Anthropic,
summarizer-with-real-LLM, and LangChain.js integrations.

## Strategies

| Strategy         | Speed     | Quality   | Needs LLM call? | When to use |
|------------------|-----------|-----------|-----------------|-------------|
| `sliding-window` | Fastest   | Good      | No              | Default. Cheap, predictable, lossy at the tails. |
| `summarizer`     | Slow      | Best      | Yes             | Long sessions where older context still matters. |
| `relevance`      | Medium    | High      | Yes (scorer)    | Heterogeneous histories where some turns clearly aren't relevant. |
| `hybrid`         | Slow      | Best      | Yes (both)      | Production: relevance-filter first, then summarize the rest if still over budget. |

All strategies preserve the system prompt by default and never split a tool-use /
tool-result pair across the boundary.

### Benchmarks

Reproducible workload: a 60-turn synthetic support conversation
(9.8k input tokens), budget = 30% of input (2.9k tokens). Cost basis:
gpt-4o ($2.50 per 1M input tokens). Run `npm run bench` to regenerate.

| Strategy | Output tokens | Saved | $ saved/call | $ saved/1k calls | Compression | Time |
|---|---:|---:|---:|---:|---:|---:|
| `sliding-window` | 717 | 9,147 | $0.02287 | **$22.87** | 92.7% | 10ms |
| `summarizer` | 628 | 9,236 | $0.02309 | **$23.09** | 93.6% | 23ms |
| `relevance` | 2,644 | 7,220 | $0.01805 | **$18.05** | 73.2% | 18ms |
| `hybrid` | 2,644 | 7,220 | $0.01805 | **$18.05** | 73.2% | 21ms |

Numbers are wall-clock on a single laptop with mock LLM + scorer (so they
isolate `ctx-opt`'s own overhead from network latency). In production the
LLM-using strategies will be dominated by the model round-trip, not
ctx-opt.

### Try it in your browser

Open the [interactive playground](./playground) to paste a chat history
and watch all four strategies trim it side-by-side, with live token and
dollar savings.

```bash
cd playground && npm install && npm run dev
```

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

### Built-in relevance scorers

Don't want to write your own scorer? Two are shipped under `ctx-opt/scorers`:

```ts
import { ContextOptimizer } from 'ctx-opt';
import { bm25Scorer, createEmbeddingScorer } from 'ctx-opt/scorers';

// Pure-JS BM25 keyword scoring. Zero deps, zero network calls.
new ContextOptimizer({
  maxTokens: 8_000,
  strategy: 'relevance',
  relevance: { scorer: bm25Scorer(), minScore: 0.05 },
});

// Embedding-based scoring. Bring your own embed function.
import OpenAI from 'openai';
const openai = new OpenAI();
new ContextOptimizer({
  maxTokens: 8_000,
  strategy: 'relevance',
  relevance: {
    scorer: createEmbeddingScorer({
      embed: async (texts) => {
        const res = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: texts,
        });
        return res.data.map((d) => d.embedding);
      },
    }),
    minScore: 0.3,
  },
});
```

The embedding scorer caches per-message vectors in-process so subsequent
`optimize()` calls only embed new messages.

### Cost tracking

When `model` is set to a known model, `meta` includes the dollar cost
of the optimized input and the dollars saved versus the unoptimized
array:

```ts
const { meta } = await optimizer.optimize(history);
console.log(`saved $${meta.savedUsd?.toFixed(4)} this call`);
```

Built-in pricing covers GPT-4o family, GPT-4 Turbo, GPT-3.5, o1/o3, the
Claude 3.5 / 4.x family, and Gemini 1.5 / 2.0. Override or add your own
via the `pricing` config option.

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
| `inputCostUsd`       | Dollar cost of the optimized input. Undefined if model pricing is unknown. |
| `savedUsd`           | Dollars saved on input cost vs the unoptimized array. Undefined if model pricing is unknown. |

## Token counting accuracy

`ctx-opt` uses [`js-tiktoken`](https://github.com/dqbd/tiktoken) for token counts.

- **OpenAI models** — model-specific encoding when known, falling back to `cl100k_base`.
- **Anthropic models** — `cl100k_base` is the closest publicly available approximation.
  Counts will be within a few percent of the official tokenizer.
- A **per-message overhead** of 4 tokens is added to each message to approximate the
  role and formatting tokens (per OpenAI's chat-completion cookbook formula).

For exact Anthropic counts, use the built-in helper that delegates to
Anthropic's `messages.countTokens` endpoint:

```ts
import Anthropic from '@anthropic-ai/sdk';
import { countMessageTokensWithAnthropic } from 'ctx-opt';

const client = new Anthropic();
const tokens = await countMessageTokensWithAnthropic(
  client,
  messages,
  'claude-haiku-4-5-20251001'
);
```

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for the release history.

## License

MIT
