import { useEffect, useMemo, useState } from 'react';
import {
  ContextOptimizer,
  countMessageTokens,
  type Message,
  type OptimizeMeta,
  type StrategyName,
} from 'ctx-opt';
import { bm25Scorer } from 'ctx-opt/scorers';
import { SAMPLE_HISTORY } from './sample.js';

const STRATEGIES: StrategyName[] = ['sliding-window', 'summarizer', 'relevance', 'hybrid'];

interface StrategyResult {
  strategy: StrategyName;
  meta: OptimizeMeta | null;
  messages: Message[];
  error?: string;
  durationMs?: number;
}

const fakeSummarizer = async (msgs: Message[]) =>
  `Earlier the user discussed ${msgs.length} topics with the assistant.`;

const scorer = bm25Scorer();

export function App() {
  const [historyJson, setHistoryJson] = useState(
    JSON.stringify(SAMPLE_HISTORY, null, 2)
  );
  const [budget, setBudget] = useState(2000);
  const [model, setModel] = useState('gpt-4o');
  const [task, setTask] = useState('How do I integrate ctx-opt with Vercel AI SDK?');
  const [results, setResults] = useState<StrategyResult[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const parsed = useMemo<Message[] | null>(() => {
    try {
      const v = JSON.parse(historyJson);
      if (!Array.isArray(v)) throw new Error('Expected an array of messages.');
      setParseError(null);
      return v as Message[];
    } catch (e) {
      setParseError((e as Error).message);
      return null;
    }
  }, [historyJson]);

  const inputTokens = useMemo(() => {
    if (!parsed) return 0;
    return countMessageTokens(parsed, model);
  }, [parsed, model]);

  useEffect(() => {
    if (!parsed) return;
    let cancelled = false;
    (async () => {
      const out: StrategyResult[] = [];
      for (const strategy of STRATEGIES) {
        const opt = new ContextOptimizer({
          maxTokens: budget,
          strategy,
          model,
          slidingWindow: { size: 8 },
          summarizer: { llmCall: fakeSummarizer, triggerThreshold: 0.85 },
          relevance: { scorer, minScore: 0.05 },
        });
        const start = performance.now();
        try {
          const r = await opt.optimize(parsed, { task });
          const durationMs = performance.now() - start;
          out.push({
            strategy,
            meta: r.meta,
            messages: r.messages,
            durationMs,
          });
        } catch (e) {
          out.push({
            strategy,
            meta: null,
            messages: [],
            error: (e as Error).message,
          });
        }
      }
      if (!cancelled) setResults(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [parsed, budget, model, task]);

  return (
    <div className="layout">
      <header>
        <h1>ctx-opt playground</h1>
        <p>
          Paste a chat history. Compare all four strategies side by side. See
          tokens saved and dollar cost in real time.
        </p>
      </header>

      <section className="config">
        <div className="row">
          <label>
            Token budget
            <input
              type="number"
              value={budget}
              min={100}
              step={100}
              onChange={(e) => setBudget(Number(e.target.value))}
            />
          </label>
          <label>
            Model
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="gpt-4o">gpt-4o</option>
              <option value="gpt-4o-mini">gpt-4o-mini</option>
              <option value="gpt-4-turbo">gpt-4-turbo</option>
              <option value="claude-haiku-4-5-20251001">claude-haiku-4-5</option>
              <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
              <option value="claude-opus-4-7">claude-opus-4-7</option>
            </select>
          </label>
          <label className="task">
            Task / current user goal
            <input
              type="text"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="used by the relevance strategy"
            />
          </label>
        </div>
        <p className="meta">
          Input: <strong>{inputTokens.toLocaleString()}</strong> tokens across{' '}
          <strong>{parsed?.length ?? 0}</strong> messages.{' '}
          {parseError && <span className="err">JSON error: {parseError}</span>}
        </p>
      </section>

      <section className="main">
        <textarea
          value={historyJson}
          onChange={(e) => setHistoryJson(e.target.value)}
          spellCheck={false}
        />
        <div className="results">
          {results.map((r) => (
            <ResultCard key={r.strategy} r={r} inputTokens={inputTokens} budget={budget} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ResultCard({
  r,
  inputTokens,
  budget,
}: {
  r: StrategyResult;
  inputTokens: number;
  budget: number;
}) {
  const ratio = inputTokens > 0 ? (r.meta?.outputTokens ?? 0) / inputTokens : 0;
  const overBudget = (r.meta?.outputTokens ?? 0) > budget;
  return (
    <div className={`card ${r.meta?.withinBudget ? 'ok' : 'bad'}`}>
      <header>
        <h3>{r.strategy}</h3>
        <span className="time">{r.durationMs?.toFixed(1)}ms</span>
      </header>
      {r.error && <p className="err">{r.error}</p>}
      {r.meta && (
        <>
          <div className="bar">
            <div
              className="fill"
              style={{ width: `${Math.min(100, ratio * 100)}%` }}
              data-over={overBudget}
            />
          </div>
          <dl>
            <div>
              <dt>output</dt>
              <dd>{r.meta.outputTokens.toLocaleString()} tok</dd>
            </div>
            <div>
              <dt>saved</dt>
              <dd>
                {r.meta.saved.toLocaleString()} tok
                {r.meta.savedUsd !== undefined && (
                  <span className="usd"> · ${r.meta.savedUsd.toFixed(5)}</span>
                )}
              </dd>
            </div>
            <div>
              <dt>compression</dt>
              <dd>{((1 - r.meta.compressionRatio) * 100).toFixed(1)}%</dd>
            </div>
            <div>
              <dt>dropped</dt>
              <dd>
                {r.meta.messagesDropped}
                {r.meta.messagesSummarized > 0 && ` (+${r.meta.messagesSummarized} summarized)`}
              </dd>
            </div>
            <div>
              <dt>under budget?</dt>
              <dd>{r.meta.withinBudget ? 'yes' : 'no'}</dd>
            </div>
          </dl>
        </>
      )}
    </div>
  );
}
