## ctx-opt strategy benchmark

**Workload:** 60 turns (9,864 input tokens), budget = 2,959 tokens (30% of input). Cost basis: gpt-4o ($2.50 / 1M input tokens).

| Strategy | Output tokens | Saved | Cost saved (per call) | Cost saved (per 1k calls) | Compression | Within budget | Time |
|---|---:|---:|---:|---:|---:|:---:|---:|
| `sliding-window` | 717 | 9,147 | $0.02287 | $22.87 | 92.7% | yes | 9.84ms |
| `summarizer` | 628 | 9,236 | $0.02309 | $23.09 | 93.6% | yes | 22.54ms |
| `relevance` | 2,644 | 7,220 | $0.01805 | $18.05 | 73.2% | yes | 18.00ms |
| `hybrid` | 2,644 | 7,220 | $0.01805 | $18.05 | 73.2% | yes | 21.00ms |
