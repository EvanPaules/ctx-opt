# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-05-14

This release is the "give it to a paying customer" hardening pass: the
library now survives the real-world failure modes that would have bitten
a production user on 0.4.

### Added
- **Multi-modal content preservation.** New `passthrough` ContentBlock
  type carries provider-specific blocks (images, files, audio,
  documents) verbatim through optimization. The OpenAI, Anthropic, and
  Vercel AI SDK adapters now wrap unrecognized blocks in `passthrough`
  on the way in and unwrap them on the way back to the SDK. Token
  counting respects `passthrough.estimatedTokens` (defaults to 500;
  per-block defaults to 850 for OpenAI images, 1500 for Anthropic
  images, 1000 for AI SDK image/file parts).
- **Configurable summarizer error recovery.** `summarizer.onError`
  accepts `'fall-back'` (default), `'throw'`, or a custom handler. When
  the LLM call fails, the optimizer falls back to `sliding-window` for
  that call instead of throwing the user's request.
- **LRU-capped embedding cache.** `createEmbeddingScorer` accepts
  `maxCacheSize` (default 1000, set to 0 to disable). Cache evicts
  least-recently-used entries when the cap is exceeded, fixing an
  unbounded-memory issue in long-running processes.
- **`meta.fellBackTo`** is now set whenever the requested strategy
  couldn't run cleanly and fell back to another. Summarizer reports
  `'sliding-window'` when there's no compressible material or when
  `llmCall` errors and `onError` is `'fall-back'`. Hybrid reports the
  final fallback when its three-phase pipeline still leaves the result
  over budget.
- **Status: pre-1.0 section** in README documenting breaking-change
  policy and browser bundle-size caveat.
- **Deploy instructions** for the playground (Vercel, Netlify,
  GitHub Pages).

### Changed
- 21 → 101 tests across the 0.2 → 0.5 arc.

## [0.4.0] - 2026-05-14

### Added
- **Cost tracking in `meta`**. When `model` is set to a known model,
  `meta.savedUsd` and `meta.inputCostUsd` are populated with dollar
  amounts. Built-in pricing table covers the GPT-4o family, GPT-4
  Turbo, GPT-3.5, o1/o3, the Claude 3.5 / 4.x family, and Gemini
  1.5 / 2.0. Override or extend via the new `pricing` config option.
- **Built-in relevance scorers** at `ctx-opt/scorers`:
  - `bm25Scorer()` — pure-JS BM25 keyword scoring with saturation and
    length normalization. Zero deps, zero network calls.
  - `createEmbeddingScorer({ embed })` — bring-your-own embedding
    function, scores by cosine similarity. In-process LRU cache so
    repeat optimize() calls only embed new messages.
- **Interactive web playground** under [`playground/`](./playground).
  Vite + React app that imports ctx-opt directly from `src/`. Paste a
  chat history, see all four strategies trim it side-by-side with
  tokens, savings, and cost.
- **Vercel AI SDK adapter** at `ctx-opt/ai-sdk`. `withOptimizer(fn, config)`
  wraps any AI SDK function (`generateText`, `streamText`,
  `generateObject`, `streamObject`) so its `messages` array is trimmed
  before forwarding. Also ships `trimMessages(messages, config)` for
  callers that prefer a one-shot preprocessor.
- **Streaming support** in the OpenAI and Anthropic adapters. `stream: true`
  on `chat.completions.create` / `messages.create` correctly returns
  the SDK's async-iterable stream after optimization. The Anthropic
  adapter also wraps `client.messages.stream()`.
- **Native Anthropic token counting** via `countMessageTokensWithAnthropic`,
  which delegates to `client.messages.countTokens` for exact counts on
  `claude-*` models. Tradeoff is a network round-trip per call versus
  tiktoken's free local approximation.
- **Per-strategy `recentWindow` overrides**. `relevance.recentWindow`
  and `summarizer.recentWindow` can now be set independently of the
  top-level `recentWindow`.
- `CONTRIBUTING.md`, GitHub issue templates, and a PR template.

### Fixed
- **Hybrid strategy now actually summarizes.** Previously the relevance
  and summarizer phases shared `recentWindow`, so the post-relevance
  set was entirely "system + recent" with nothing left for the
  summarizer to compress. Setting `relevance.recentWindow` larger than
  `summarizer.recentWindow` gives the summarizer real material. The
  known-limitation note from 0.2.0 is resolved.

### Changed
- New peer deps: `ai` (Vercel AI SDK), all optional.
- `tsup` now builds five entry points: `index`, `adapters/openai`,
  `adapters/anthropic`, `adapters/ai-sdk`, `scorers/index`.
- New subpath export `ctx-opt/scorers`.
- 21 → 89 tests across releases.

## [0.2.0] - 2026-05-14

### Added
- **Drop-in SDK adapters** for OpenAI and Anthropic. Wrap a client with
  `withOptimizer` and every call to `chat.completions.create` (OpenAI) or
  `messages.create` (Anthropic) auto-trims its message history before
  forwarding.
  - `import { withOptimizer } from 'ctx-opt/openai'`
  - `import { withOptimizer } from 'ctx-opt/anthropic'`
  - The Anthropic adapter hoists `system` into the optimizer view and
    splits it back out for the API.
  - Both adapters expose `client`, `optimizer`, and `lastMeta` on the
    wrapped object for debugging and observability.
- **`examples/` directory** with runnable scripts for OpenAI, Anthropic,
  LangChain.js, and a real-Anthropic summarizer setup.
- **`benchmarks/` directory** with a reproducible workload that compares
  all four strategies head-to-head. Run `npm run bench`.
- **Test coverage** for the `relevance` and `hybrid` strategies, plus
  full adapter test suites. 52 tests total, up from 21.
- `peerDependencies` for `openai` and `@anthropic-ai/sdk`, marked
  optional via `peerDependenciesMeta` — the core library still ships
  with zero required peers.

### Changed
- `tsup` now builds three entry points (`index`, `adapters/openai`,
  `adapters/anthropic`) for subpath exports.
- `package.json` `exports` field exposes `./openai` and `./anthropic`
  subpaths.

### Known limitations
- In the `hybrid` strategy, `applyRelevance` and `applySummarizer`
  share `recentWindow`, so the post-relevance set rarely contains
  "compressible" messages for the summarizer to operate on, and the
  pipeline falls through to a sliding-window pass. *Fixed in 0.3.0
  via per-strategy `recentWindow` overrides.*

## [0.1.0] - 2026-05-01

### Added
- Initial release.
- `ContextOptimizer` with `sliding-window`, `summarizer`, `relevance`,
  and `hybrid` strategies.
- Token counting via `js-tiktoken` with per-message overhead modelling
  OpenAI's chat-completion formula.
- Tool-pair preservation across boundary trims.
- ESM + CJS builds, TypeScript types, Node 18+.

[0.5.0]: https://github.com/EvanPaules/ctx-opt/releases/tag/v0.5.0
[0.4.0]: https://github.com/EvanPaules/ctx-opt/releases/tag/v0.4.0
[0.2.0]: https://github.com/EvanPaules/ctx-opt/releases/tag/v0.2.0
[0.1.0]: https://github.com/EvanPaules/ctx-opt/releases/tag/v0.1.0
