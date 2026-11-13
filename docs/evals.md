# Evals

`apps/eval` runs a set of labelled queries against the search API and scores what comes back. Each run is described by a config, and its results are written to JSON and a markdown table. The harness talks to the API over HTTP, so it measures the same path the UI uses.

## Run

Start the stack with `pnpm infra:up && pnpm dev`. Then:

```bash
pnpm eval smoke
```

`smoke` names a file in `apps/eval/configs/`. A path to a config file also works.

The command prints one line per query and then a summary table. It also writes both files to:

```
apps/eval/results/<config name>/<started at>.json
apps/eval/results/<config name>/<started at>.md
```

The results folder is gitignored. The JSON keeps every hit for every query along with the commit it ran on; a `-dirty` suffix means there were uncommitted changes. That makes any two runs comparable later.

## Config

```json
{
  "name": "smoke",
  "description": "optional, printed at the top of the report",
  "api": "http://localhost:4000",
  "dataset": "../datasets/local-smoke.json",
  "search": { "limit": 10, "keyframes": false },
  "k": [1, 5, 10],
  "concurrency": 1
}
```

- `name` and `dataset` are required.
- `name` must be lowercase letters, digits and dashes, because it becomes a folder name.
- `dataset` is resolved relative to the config file.
- `search` is passed straight to `POST /search`.
- `k` sets which `recall@k` values are reported.
- Keep `concurrency` low on free-tier keys, because each query costs a rerank call.

## Dataset

```json
{
  "name": "local-smoke",
  "queries": [
    {
      "id": "rust-creator",
      "q": "Graydon Hoare",
      "expect": [{ "video": "Rust in 100 Seconds", "start": "0:15", "end": "0:20" }]
    }
  ]
}
```

- **`video`:** a title, matched without case, or a video id. A run fails early if a video isn't in the library, and warns if one isn't `ready` yet.
- **`start` and `end`:** optional, but give both or neither. Each takes milliseconds or a clock string (`45`, `1:30`, `1:02:03.5`). Leave them out when the whole video counts as a hit.
- **More than one target:** a query can have several, and a hit on any of them counts.

## Metrics

| metric     | meaning                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| `recall@k` | share of queries where a clip from an expected video is in the top `k`  |
| `mrr`      | mean of `1 / rank` of the first clip from an expected video, 0 if none  |
| latency    | p50 and p95 of the API's own `totalMs`, so network time is not included |

A query that errors counts as a miss and is listed under errors. "Not reranked" counts the queries where the rerank call failed and the fused order was used instead, which usually means a rate limit.

These are video-level scores: a hit counts if it's from the right video, at any time. Timestamp scoring against the `start` / `end` spans is added in 3.3.

`local-smoke` exercises the harness against the demo library. It's not a benchmark.
