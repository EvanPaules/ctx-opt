# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
  pipeline falls through to a sliding-window pass. A future release
  will let each phase have its own window.

## [0.1.0] - 2026-05-01

### Added
- Initial release.
- `ContextOptimizer` with `sliding-window`, `summarizer`, `relevance`,
  and `hybrid` strategies.
- Token counting via `js-tiktoken` with per-message overhead modelling
  OpenAI's chat-completion formula.
- Tool-pair preservation across boundary trims.
- ESM + CJS builds, TypeScript types, Node 18+.

[0.2.0]: https://github.com/EvanPaules/ctx-opt/releases/tag/v0.2.0
[0.1.0]: https://github.com/EvanPaules/ctx-opt/releases/tag/v0.1.0
