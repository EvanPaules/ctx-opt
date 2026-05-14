# Contributing to ctx-opt

Thanks for your interest. This is a small library, so I try to keep the
contribution surface simple.

## Quick start

```bash
git clone https://github.com/EvanPaules/ctx-opt.git
cd ctx-opt
npm install
npm test
```

## Useful commands

| Command | What it does |
|---|---|
| `npm test` | Run the vitest suite once. |
| `npm run test:watch` | Run vitest in watch mode while iterating. |
| `npm run typecheck` | Strict TS typecheck without emitting. |
| `npm run build` | Produce the ESM + CJS + .d.ts dist. |
| `npm run bench` | Run the strategy benchmark and write `benchmarks/RESULTS.md`. |

CI runs typecheck, test, and build on Node 18, 20, and 22. All three must
pass before a PR is mergeable.

## What I'm looking for

- **Bug fixes** with a regression test.
- **New strategies** that fit the existing `Strategy` interface and come
  with their own test file.
- **SDK adapters** for new ecosystems (LangChain, Mastra, etc). Use the
  existing `src/adapters/openai.ts` and `src/adapters/anthropic.ts` as
  templates and add a subpath export to `package.json`.
- **Docs and examples** that make a real workflow easier to get started with.

## What I'm probably going to push back on

- Refactors with no user-facing benefit.
- Optional features behind flags that aren't requested by users.
- Removing the zero-required-dependency property of the core package.

## Style

- TypeScript strict mode is on. No `any` without an explanatory comment.
- Prefer named exports over default exports (except `ContextOptimizer`).
- Tests use vitest. Mock SDKs over real network calls.
- Keep public API surface small. Add to `src/index.ts` deliberately.

## Releasing (maintainer notes)

1. Land all changes on `main` via PR.
2. Bump `version` in `package.json`.
3. Update `CHANGELOG.md`.
4. Tag and push: `git tag v0.x.0 && git push --tags`.
5. `npm publish`.

## License

By contributing you agree your contributions are licensed under MIT,
matching the project license.
