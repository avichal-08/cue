# Results

These numbers come from the eval harness ([evals.md](evals.md)) and were measured on 2026-11-13 at commit `d38d73f`. Each section gives the command that reproduces it.

**The library** has 6 short videos, 16 minutes in total:

- 3 Fireship explainers: Rust, Go and Python;
- a PCA and ICA lesson;
- a screen recording about Raft consensus;
- a talk on reading books.

**The query set** is 37 hand-labelled moments spread over the first 5 videos. The Python video only serves as a distractor. Each moment's span is labelled from the word timings and from when on-screen text appears, not from cue's own segments.

This is a small set built on the demo library. Read it as evidence of how each part behaves, not as a benchmark score. The public benchmark, MSR-VTT, is still to come.

## Search quality

`pnpm eval ablation` adds one signal at a time. Top-1 results:

| signals                   | recall@1 | hit@1 ±5s | R@1 IoU≥0.3 | R@1 IoU≥0.5 | mIoU@1 | p50   | cost / 1k searches |
| ------------------------- | -------- | --------- | ----------- | ----------- | ------ | ----- | ------------------ |
| transcript                | 94.6%    | 40.5%     | 62.2%       | 13.5%       | 0.346  | 0.7 s | $0                 |
| + frames                  | 100%     | 48.6%     | 64.9%       | 27.0%       | 0.417  | 0.7 s | $0                 |
| + on-screen text          | 100%     | 62.2%     | 64.9%       | 37.8%       | 0.413  | 0.8 s | $0                 |
| + keyword                 | 100%     | 78.4%     | 70.3%       | 43.2%       | 0.459  | 0.8 s | $0                 |
| **+ rerank** (default)    | 100%     | **83.8%** | **91.9%**   | 59.5%       | 0.585  | 3.1 s | $1.41              |
| + keyframes in the rerank | 100%     | 81.1%     | 83.8%       | 64.9%       | 0.575  | 4.7 s | $5.27              |

- **What the metrics mean.** `recall@1` asks whether the top clip is from the right video. `hit@1 ±5s` asks whether it starts playing within 5 s of the labelled moment, which is what a person clicking a result feels. The IoU columns ask whether the clip is also the right length.
- **Every signal adds something.** Together they double `hit@1` compared with transcript alone. Frames fix the two moments that only appear on screen ("C code calling malloc", a speaker's name card), because the slides themselves get embedded. Keyword search gives the second-biggest jump, on exact terms such as "covariance matrix" and "go build".
- **The rerank buys clip quality.** R@1 IoU≥0.3 goes from 70% to 92%, for about 2.3 s per search.
- **Keyframes in the rerank aren't worth turning on.** They're even with text-only rerank, at 3.7× the cost and with a much longer tail (p95 15 s). That's why they're off by default.
- **Noise.** The four signal steps without rerank are deterministic. The rerank isn't, and its rows moved by a query or two between runs; on 37 queries, one query is 2.7 points.

**Clip assembly.** Growing each clip from its best segment, and merging only neighbours that score at least 0.9 of it, raised `hit@1 ±5s` from 57% to 81% on the 5-video set. Average clip length fell from 28 s to 12 s ([search: clips](components/search.md#6-clips)).

## Search speed and cost

`pnpm eval latency` runs the 37 queries 3 times (111 searches per variant). Query embeddings are cached after the first search.

| variant     | p50    | p95   | embed p50 | retrieve p50 | rerank p50 | clips p50 | cost / 1k searches |
| ----------- | ------ | ----- | --------- | ------------ | ---------- | --------- | ------------------ |
| fused only  | 0.98 s | 1.6 s | 274 ms    | 136 ms       | 129 ms¹    | 379 ms    | $0                 |
| with rerank | 3.8 s  | 6.3 s | 322 ms    | 221 ms       | 2.6 s      | 354 ms    | $1.35              |

¹ Loading the candidate rows, with no model call.

The rerank is most of a search's time and all of its cost.

## Ingest speed and cost

`pnpm eval ingest` reports per hour of video. Cost is counted at paid-tier prices ([prices.json](../apps/eval/prices.json)). The free tier used here costs nothing.

| per hour of video | value                                                                     |
| ----------------- | ------------------------------------------------------------------------- |
| index time        | **87 min**: see 38, decode 32, segment 8, transcribe 4, index 3           |
| cost              | **$0.42**: OCR $0.30, keyframe embeddings $0.07, speech $0.04, text $0.01 |
| provider calls    | about 780                                                                 |

- **Where these come from.** Index time is measured on all 6 videos. Cost comes only from the Python video, the one indexed after call tracking was added. For it, every call was metered: 1 transcription, 24 OCR reads, 24 keyframe embeddings and 46 text embeddings.
- **Checking the meter.** Speech came to exactly $0.040 per hour, Groq's listed price.
- **What's slow.** OCR is both the main cost and the main time sink: frames are read one at a time, about 2.5 s each. For videos ingested from a link, decode includes the download.
