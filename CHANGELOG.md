# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-05-14

### Added
- **Vercel AI SDK adapter** at `ctx-opt/ai-sdk`. `withOptimizer(fn, config)`
  wraps any AI SDK function (`generateText`, `streamText`, `generateObject`,
  `streamObject`) so its `messages` array is trimmed before forwarding.
  Also ships `trimMessages(messages, config)` for callers that prefer a
  one-shot preprocessor.
- **Streaming support** in the OpenAI and Anthropic adapters. `stream: true`
  on `chat.completions.create` / `messages.create` now correctly returns
  the SDK's async-iterable stream after optimization. The Anthropic
  adapter also wraps `client.messages.stream()`.
- **Native Anthropic token counting** via `countMessageTokensWithAnthropic`,
  which delegates to `client.messages.countTokens` for exact counts on
  `claude-*` models. Tradeoff is a network round-trip per call versus
  tiktoken's free local approximation.
- **Per-strategy `recentWindow` overrides**. `relevance.recentWindow` and
  `summarizer.recentWindow` can now be set independently of the top-level
  `recentWindow`. This unblocks the hybrid strategy (see below).
- `CONTRIBUTING.md`, GitHub issue templates, and a PR template.

### Fixed
- **Hybrid strategy now actually summarizes**. Previously the relevance
  and summarizer phases shared `recentWindow`, so the post-relevance set
  was entirely "system + recent" with nothing left for the summarizer to
  compress. Setting `relevance.recentWindow` larger than
  `summarizer.recentWindow` gives the summarizer real material. The
  known-limitation note from 0.2.0 is resolved.

### Changed
- New peer dep: `ai` (optional, for the Vercel AI SDK adapter).
- `tsup` now builds four entry points instead of three.

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

[0.3.0]: https://github.com/EvanPaules/ctx-opt/releases/tag/v0.3.0
[0.2.0]: https://github.com/EvanPaules/ctx-opt/releases/tag/v0.2.0
[0.1.0]: https://github.com/EvanPaules/ctx-opt/releases/tag/v0.1.0
