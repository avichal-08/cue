# Results

These numbers come from the eval harness ([evals.md](evals.md)) and were measured on 2026-11-13, after the visual similarity floor was lowered to 0.55 ([search: fusion](components/search.md#4-fusion)). Each section gives the command that reproduces it.

**The library** has 6 short videos, 16 minutes in total:

- 3 Fireship explainers: Rust, Go and Python;
- a PCA and ICA lesson;
- a screen recording about Raft consensus;
- a talk on reading books.

**The query set** is 37 hand-labelled moments spread over the first 5 videos. The Python video only serves as a distractor. Each moment's span is labelled from the word timings and from when on-screen text appears, not from cue's own segments.

This is a small set built on the demo library. Read it as evidence of how each part behaves, not as a benchmark score. [MSR-VTT](#msr-vtt) is the public benchmark.

## Search quality

`pnpm eval ablation` adds one signal at a time. Top-1 results:

| signals                    | recall@1 | hit@1 ±5s | R@1 IoU≥0.3 | R@1 IoU≥0.5 | mIoU@1 | p50   | cost / 1k searches |
| -------------------------- | -------- | --------- | ----------- | ----------- | ------ | ----- | ------------------ |
| transcript                 | 94.6%    | 40.5%     | 62.2%       | 13.5%       | 0.346  | 0.7 s | $0                 |
| + frames                   | 100%     | 37.8%     | 48.6%       | 24.3%       | 0.331  | 0.6 s | $0                 |
| + on-screen text           | 100%     | 62.2%     | 59.5%       | 37.8%       | 0.395  | 0.6 s | $0                 |
| + keyword                  | 100%     | 78.4%     | 62.2%       | 40.5%       | 0.437  | 0.6 s | $0                 |
| **+ rerank** (default)     | 100%     | **91.9%** | **94.6%**   | 62.2%       | 0.615  | 3.3 s | $1.41              |
| + keyframes in the rerank¹ | 100%     | 81.1%     | 83.8%       | 64.9%       | 0.575  | 4.7 s | $5.27              |

¹ Measured at the old 0.65 visual floor. The free-tier rerank quota ran out before it could be rerun.

- **What the metrics mean.** `recall@1` asks whether the top clip is from the right video. `hit@1 ±5s` asks whether it starts playing within 5 s of the labelled moment, which is what a person clicking a result feels. The IoU columns ask whether the clip is also the right length.
- **Every signal adds something.** Together they nearly double `hit@1` compared with transcript alone. On their own, frames cost a little here: this library is mostly talk and slides, so the extra frame matches mostly stretch clips. They still fix the two moments that only appear on screen ("C code calling malloc", a speaker's name card), because the slides themselves get embedded. Keyword search gives the second-biggest jump, on exact terms such as "covariance matrix" and "go build".
- **The rerank buys clip quality.** R@1 IoU≥0.3 goes from 62% to 95%, for about 2.7 s per search.
- **Keyframes in the rerank aren't worth turning on.** At the old floor they were even with text-only rerank, at 3.7× the cost and with a much longer tail (p95 15 s). That's why they're off by default.
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

## MSR-VTT

`pnpm eval:msrvtt 100 && pnpm eval msrvtt` runs text-to-video retrieval on 100 clips, evenly spaced through the standard 1k-A test split. Each caption is a query, and the clip it describes is the only right answer. Results are ranked by video, with the 6 demo videos left in as extra distractors.

| variant                       | recall@1 | recall@5 | recall@10 | mrr   | p50   |
| ----------------------------- | -------- | -------- | --------- | ----- | ----- |
| frames only                   | 59%      | 82%      | 88%       | 0.697 | 0.5 s |
| all signals, fused            | **55%**  | **82%**  | **86%**   | 0.671 | 0.6 s |
| + text rerank, before the fix | 39%      | 57%      | 59%       | 0.467 | 3.1 s |
| + text rerank, after the fix¹ | 55%      | 82%      | 86%       | 0.671 | 1.1 s |

¹ Partly measured. 68 queries had only frame-matched candidates, so the rerank now leaves them in fused order by design. The other 32 needed the model, and every call hit a spent daily Flash-Lite quota and kept the fused order too. The row is therefore fused search plus the rule, not a full measurement of the reranker.

- **A 100-clip gallery is 10× easier than the full 1,000.** Published 1k-A numbers aren't comparable.
- **Frames do the work.** Most clips are cooking, sports, music or gameplay with little useful speech. Adding transcript, on-screen text and keyword search to frames costs 4 points of recall@1.
- **The text rerank used to hurt here.** It reads only transcripts and on-screen text, so it can't see why a visual match is right. In 30 of the 100 queries it scored the right clip below its cutoff and dropped it, and in 11 more it pushed it down; it helped in 8.
- **The fix.** The text rerank now keeps candidates matched only by their frame in their fused slot instead of judging them ([rerank: evidence rule](components/rerank.md#evidence-rule)). On 68 of the 100 queries that means no rerank call at all, so those can no longer lose the right clip. Whether the rerank helps or hurts on the other 32 is still open.
- **Keyframes in the rerank** couldn't be measured: in both runs the free-tier Flash-Lite quota ran out within the first few queries.
- **The visual floor.** Before it was lowered from 0.65 to 0.55, fused recall@1 was 35% and recall@10 only 41%, because the floor discarded two thirds of the true frame matches ([search: fusion](components/search.md#4-fusion)).
- **Ingest.** The 100 clips (about 25 minutes of video) indexed with no failures.
