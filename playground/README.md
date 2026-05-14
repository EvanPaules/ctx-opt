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

## Deploy to Vercel

```bash
# One-time setup if you don't have vercel CLI:
npm install -g vercel

# From the playground/ directory:
npm run build
vercel deploy --prod dist
```

Vercel will prompt for project linking the first time, then return a
public URL. Put it in the main README's playground link.

## Deploy to Netlify

```bash
npm install -g netlify-cli
npm run build
netlify deploy --prod --dir dist
```

## Deploy via GitHub Pages

`npm run build` produces a fully-static `dist/` directory. Push that to
a `gh-pages` branch with your tool of choice and serve it from
`https://<user>.github.io/<repo>/playground`.

## What it shows

- All four strategies running on the same input.
- Per-strategy: output tokens, tokens saved, compression ratio,
  messages dropped, messages summarized, time taken, and dollar
  savings (when the model has known pricing).
- A green/red bar per strategy showing how close output is to budget.

The summarizer strategy uses a deterministic stand-in (no real LLM
call) so the playground works offline without API keys. The relevance
strategy uses the BM25 scorer for the same reason.
