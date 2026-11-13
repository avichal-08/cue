# Evals

`apps/eval` runs a set of labelled queries against the search API and scores what comes back. Each run is described by a config, and its results are written to JSON and a markdown table. The harness talks to the API over HTTP, so it measures the same path the UI uses.

## Run

Start the stack with `pnpm infra:up && pnpm dev`. Then:

```bash
pnpm eval moments
```

`moments` names a file in `apps/eval/configs/`. A path to a config file also works.

The command prints one line per query and then a summary table. It also writes both files to:

```
apps/eval/results/<config name>/<started at>.json
apps/eval/results/<config name>/<started at>.md
```

The results folder is gitignored. The JSON keeps every hit for every query along with the commit it ran on; a `-dirty` suffix means there were uncommitted changes. That makes any two runs comparable later.

## Config

```json
{
  "name": "moments",
  "description": "optional, printed at the top of the report",
  "api": "http://localhost:4000",
  "dataset": "../datasets/local-moments.json",
  "search": { "limit": 10, "keyframes": false },
  "k": [1, 5, 10],
  "windowSec": 5,
  "iou": [0.3, 0.5],
  "concurrency": 1,
  "retries": 2,
  "retryDelayMs": 5000
}
```

- `name` and `dataset` are required.
- `name` must be lowercase letters, digits and dashes, because it becomes a folder name.
- `dataset` is resolved relative to the config file.
- `search` is passed to `POST /search`. It takes `limit` (10), `keyframes` (false), `rerank` (true) and `modalities` (all four signals when left out).
- `k` sets the cutoffs for every ranked metric.
- `windowSec` is the tolerance for `hit@k`, and `iou` sets the thresholds for `R@k`.
- Keep `concurrency` low on free-tier keys, because each query costs a rerank call.
- When a variant wants a rerank but the rerank fails (Gemini rate limits and 503s), the query is retried up to `retries` times, `retryDelayMs` apart. Only the misses that remain count as "not reranked".

## Ablations

A config can list `variants`. Each one layers its own `search` options over the shared `search`, and runs the whole dataset:

```json
{
  "search": { "rerank": false },
  "variants": [
    { "name": "transcript", "search": { "modalities": ["transcript"] } },
    { "name": "+ frames", "search": { "modalities": ["transcript", "visual"] } },
    { "name": "+ rerank", "search": { "rerank": true } }
  ]
}
```

With more than one variant, the report has one row per variant with every `@1` metric and `mrr`, followed by a grid of each query's top-clip IoU per variant. The grid shows which queries each signal wins or loses. `pnpm eval ablation` runs this ladder over `local-moments`:

1. transcript
2. \+ frames
3. \+ on-screen text
4. \+ keyword
5. \+ rerank
6. \+ keyframes in the rerank

Keyword search reads both the transcript and the on-screen text, so it comes after the vector signals rather than inside step 1.

## Dataset

```json
{
  "name": "local-moments",
  "queries": [
    {
      "id": "rust-name",
      "q": "where does the name rust come from",
      "expect": [{ "video": "Rust in 100 Seconds", "start": "19.0", "end": "21.6" }]
    }
  ]
}
```

- **`video`:** a title, matched without case, or a video id. A run fails early if a video isn't in the library, and warns if one isn't `ready` yet.
- **`start` and `end`:** optional, but give both or neither. Each takes milliseconds or a clock string (`45`, `1:30`, `1:02:03.5`). Leave them out when the whole video counts as a hit.
- **More than one target:** a query can have several, and a hit on any of them counts.

## Labelling moments

- **Mark the moment that answers the query,** not the segment cue happened to cut. Spans come from word timings and from when on-screen text appears.
- **Keep spans tight,** usually 3–20 seconds, because a loose span inflates IoU.
- **Mix the query types,** so each signal is tested:
  - paraphrases that share no words with the transcript;
  - exact terms;
  - text that only appears on screen.
- **Repeated moments:** if a moment happens twice, list both spans as targets.

`local-moments` follows these rules over the 5 demo videos.

## Metrics

| metric      | meaning                                                                                             |
| ----------- | --------------------------------------------------------------------------------------------------- |
| `recall@k`  | share of queries where a clip from an expected video is in the top `k`                              |
| `mrr`       | mean of `1 / rank` of the first clip from an expected video, 0 if none                              |
| `hit@k ±Ns` | share of queries where a top-`k` clip **starts** inside a labelled span or within `N` seconds of it |
| `R@k iou≥t` | share of queries where a top-`k` clip overlaps a labelled span with temporal IoU of at least `t`    |
| `mIoU@1`    | mean IoU between the top clip and its best-matching span, 0 for a wrong video                       |
| latency     | p50 and p95 of the API's own `totalMs`, so network time is not included                             |

`hit@k` asks whether playback starts in the right place, which is what a person clicking a result feels. IoU asks whether the clip is the right length as well, so it penalises a clip that starts on time but runs far past the moment.

The timestamp metrics only count queries that have spans; the `queries` column in the report shows how many. A query that errors counts as a miss and is listed under errors. "Not reranked" counts the queries where the rerank call failed and the fused order was used instead, which usually means a rate limit. Rerun those before reading too much into a score.

## Cost and speed

Every Groq and Gemini call is metered in `@cue/core` and saved to `provider_calls`, tagged `worker` (with its video and stage), `search` or `answer`. Each row records the operation, latency and usage: audio seconds for speech, tokens in and out for Flash, and images and characters for embeddings.

**Ingest.** `pnpm eval ingest` reads `GET /stats/ingest` and reports, per hour of video:

- index time, overall and by stage;
- cost at paid-tier prices, by operation;
- the number of provider calls.

It also prints a per-video table.

- **Index time** runs from the first stage start to the last stage finish, so it includes queue waits. For a linked video, the `decode` stage includes the download.
- **Cost** only counts videos indexed after tracking was added. A re-run that hits the transcript or embedding cache makes fewer calls, so a video only gives a cold cost the first time it's indexed.

**Search.** `pnpm eval latency` runs the moments set 3 times, with and without the rerank. It reports:

- p50 and p95 for the whole search and for each phase (embed, retrieve, rerank, clips);
- the cost per 1,000 searches, from the `search` calls made during each variant.

Retried searches count toward the cost.

**Prices** live in `apps/eval/prices.json`, keyed by `provider/model`. Each entry records its source page and the date it was checked. The free tier costs nothing, so these are what the same calls would cost on a paid plan.

- Gemini embeddings return no token count, so text tokens are estimated as characters / 4. A `~` after a cost marks an estimate.
- A model missing from the file is reported with `?` rather than as free.

`local-smoke` only exercises the harness. `local-moments` is the timestamp set. Neither is a public benchmark.
