# ctx-opt playground

Interactive web UI for comparing all four ctx-opt strategies side by side.
Paste a chat history, set a token budget, watch each strategy trim it in
real time. Shows tokens saved and dollar cost per strategy.

## Run locally

```bash
cd playground
npm install
npm run dev
```

Opens on http://localhost:5173. The playground imports ctx-opt directly
from `../src/` via a Vite alias, so changes to the library are reflected
immediately.

## Deploy

```bash
npm run build
# dist/ is a static SPA. Deploy with vercel, netlify, gh-pages, anything.
vercel deploy --prod ./dist
```

## What it shows

- All four strategies running on the same input.
- Per-strategy: output tokens, tokens saved, compression ratio,
  messages dropped, messages summarized, time taken, and dollar
  savings (when the model has known pricing).
- A green/red bar per strategy showing how close output is to budget.

The summarizer strategy uses a deterministic stand-in (no real LLM
call) so the playground works offline without API keys. The relevance
strategy uses the BM25 scorer for the same reason.
