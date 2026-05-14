## ctx-opt strategy benchmark

**Workload:** 60 turns (9,864 input tokens), budget = 2,959 tokens (30% of input).

| Strategy | Output tokens | Saved | Compression | Dropped | Summarized | Within budget | Time |
|---|---:|---:|---:|---:|---:|:---:|---:|
| `sliding-window` | 717 | 9,147 | 92.7% | 113 | 0 | yes | 11.36ms |
| `summarizer` | 628 | 9,236 | 93.6% | 113 | 114 | yes | 22.66ms |
| `relevance` | 2,644 | 7,220 | 73.2% | 86 | 0 | yes | 18.53ms |
| `hybrid` | 2,644 | 7,220 | 73.2% | 86 | 0 | yes | 22.16ms |
