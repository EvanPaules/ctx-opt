# ctx-opt examples

Each file in this directory is a self-contained, runnable script demonstrating
one way to use `ctx-opt`.

| File | What it shows |
|---|---|
| [`openai.ts`](./openai.ts) | Drop-in OpenAI wrapper — one-line swap of `new OpenAI()` for an optimized client. |
| [`anthropic.ts`](./anthropic.ts) | Drop-in Anthropic wrapper. Hoists `system` correctly. |
| [`summarizer.ts`](./summarizer.ts) | The `summarizer` strategy with a real Anthropic LLM call. |
| [`langchain.ts`](./langchain.ts) | ctx-opt as a LangChain.js `Runnable` that trims `BaseMessage[]` before the model. |

## Running

These files import directly from `../src/` for development. To run them
against the published package, swap `../src/adapters/openai.js` for
`ctx-opt/openai`, and `../src/optimizer.js` for `ctx-opt`.

```bash
# From the repo root, after npm install:
tsx examples/openai.ts        # needs OPENAI_API_KEY
tsx examples/anthropic.ts     # needs ANTHROPIC_API_KEY
tsx examples/summarizer.ts    # needs ANTHROPIC_API_KEY
tsx examples/langchain.ts     # needs OPENAI_API_KEY + langchain deps
```
