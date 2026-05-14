/* eslint-disable no-console */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ContextOptimizer } from '../src/optimizer.js';
import { countMessageTokens } from '../src/token-counter.js';
import type {
  Message,
  StrategyName,
  SummarizerLLMFn,
  RelevanceScorerFn,
} from '../src/types.js';
import { buildConversation } from './fixtures.js';

interface BenchRow {
  strategy: StrategyName;
  inputTokens: number;
  outputTokens: number;
  saved: number;
  savedUsd?: number;
  compressionRatio: number;
  messagesDropped: number;
  messagesSummarized: number;
  withinBudget: boolean;
  durationMs: number;
}

const TURNS = 60;
const TARGET_BUDGET_RATIO = 0.3;

const llmCall: SummarizerLLMFn = async (msgs) => {
  // Cheap, deterministic stand-in summary so the benchmark is reproducible.
  return `Earlier the user discussed ${msgs.length} topics including questions about the library, setup, and integration.`;
};

const scorer: RelevanceScorerFn = async (msgs, task) => {
  // Heuristic: score by overlap of message terms with the task terms.
  const taskTerms = new Set(task.toLowerCase().split(/\W+/).filter(Boolean));
  return msgs.map((m) => {
    const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    const words = text.toLowerCase().split(/\W+/).filter(Boolean);
    if (taskTerms.size === 0) return 0.5;
    let overlap = 0;
    for (const w of words) if (taskTerms.has(w)) overlap++;
    const score = Math.min(1, overlap / Math.max(8, words.length / 4));
    return score;
  });
};

async function runStrategy(
  strategy: StrategyName,
  messages: Message[],
  maxTokens: number,
  task: string
): Promise<BenchRow> {
  const opt = new ContextOptimizer({
    maxTokens,
    strategy,
    model: 'gpt-4o',
    recentWindow: 6,
    slidingWindow: { size: 8 },
    summarizer: { llmCall, triggerThreshold: 0.85 },
    relevance: { scorer, minScore: 0.1 },
  });
  const start = performance.now();
  const r = await opt.optimize(messages, { task });
  const durationMs = performance.now() - start;
  return {
    strategy,
    inputTokens: r.meta.inputTokens,
    outputTokens: r.meta.outputTokens,
    saved: r.meta.saved,
    savedUsd: r.meta.savedUsd,
    compressionRatio: r.meta.compressionRatio,
    messagesDropped: r.meta.messagesDropped,
    messagesSummarized: r.meta.messagesSummarized,
    withinBudget: r.meta.withinBudget,
    durationMs,
  };
}

function fmtTokens(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtMs(n: number): string {
  return `${n.toFixed(2)}ms`;
}

function renderMarkdown(rows: BenchRow[], inputTokens: number, budget: number): string {
  const header = `## ctx-opt strategy benchmark

**Workload:** ${TURNS} turns (${rows[0]!.inputTokens.toLocaleString()} input tokens), budget = ${budget.toLocaleString()} tokens (${Math.round(TARGET_BUDGET_RATIO * 100)}% of input). Cost basis: gpt-4o ($2.50 / 1M input tokens).

| Strategy | Output tokens | Saved | Cost saved (per call) | Cost saved (per 1k calls) | Compression | Within budget | Time |
|---|---:|---:|---:|---:|---:|:---:|---:|
`;
  const body = rows
    .map((r) => {
      const usd = r.savedUsd ?? 0;
      const usdPerThousand = usd * 1000;
      return `| \`${r.strategy}\` | ${fmtTokens(r.outputTokens)} | ${fmtTokens(r.saved)} | $${usd.toFixed(5)} | $${usdPerThousand.toFixed(2)} | ${fmtPct(1 - r.compressionRatio)} | ${r.withinBudget ? 'yes' : 'no'} | ${fmtMs(r.durationMs)} |`;
    })
    .join('\n');
  return header + body + '\n';
}

async function main(): Promise<void> {
  const messages = buildConversation(TURNS);
  const inputTokens = countMessageTokens(messages);
  const budget = Math.round(inputTokens * TARGET_BUDGET_RATIO);
  const task = 'How do I configure the summarizer strategy with OpenAI?';

  const strategies: StrategyName[] = ['sliding-window', 'summarizer', 'relevance', 'hybrid'];
  const rows: BenchRow[] = [];
  for (const s of strategies) {
    // Warmup pass — primes encodings + summary cache so we benchmark steady-state.
    await runStrategy(s, messages, budget, task);
    const row = await runStrategy(s, messages, budget, task);
    rows.push(row);
  }

  const md = renderMarkdown(rows, inputTokens, budget);
  console.log(md);
  const outPath = join(process.cwd(), 'benchmarks', 'RESULTS.md');
  writeFileSync(outPath, md, 'utf8');
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
