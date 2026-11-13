# cue

Multimodal video search. Upload hours of video, ask in plain language, get back timestamped clips, ranked and explained.

Cue indexes what is said (transcript), shown (frames) and written on screen (OCR), then answers queries with hybrid vector + keyword retrieval, a reranker and short answers that
cite the exact moments.

## Results

On 37 hand-labelled moments in a 6-video library of short talks, explainers and a screen recording:

| signals                           | right video | starts within 5 s | clip IoU ≥ 0.3 | p50 search | cost / 1k searches |
| --------------------------------- | ----------- | ----------------- | -------------- | ---------- | ------------------ |
| transcript only                   | 94.6%       | 40.5%             | 62.2%          | 0.7 s      | $0                 |
| + frames, on-screen text, keyword | 100%        | 78.4%             | 62.2%          | 0.6 s      | $0                 |
| **+ rerank** (default)            | **100%**    | **91.9%**         | **94.6%**      | 3.3 s      | $1.41              |

Indexing takes **87 min per hour of video** and costs **$0.42 per hour** at paid-tier prices, mostly OCR. Everything here runs on free tiers.

The set is small and built on the demo library, so read it as evidence of what each part adds rather than a benchmark score.

On **MSR-VTT** (100 clips from the 1k-A test split, mostly visual), fused search finds the right clip first **55%** of the time and in the top 10 **86%** of the time. The text-only rerank used to drop that to 39% because it couldn't see frames; it now leaves frame-only matches in place, which keeps 68 of the 100 queries at the fused result. The other 32 are still unmeasured. [docs/results.md](docs/results.md) has every table, including each signal on its own, latency by phase and cost by operation. [docs/evals.md](docs/evals.md) covers how to rerun them.

![cue high level design](docs/diagrams/architecture.png)

## Stack

- **web**: Next.js
- **api**: Express
- **worker**: BullMQ on Redis, one queue per pipeline stage
- **db**: Drizzle + Neon Postgres with pgvector
- **storage**: S3-compatible (MinIO, locally and on the deploy box)
- **models**: free tiers of Groq (speech) and Gemini (embeddings, OCR, rerank, answers), behind
  provider interfaces

## Layout

```
apps/web                 next.js ui
apps/api                 express api
apps/worker              pipeline workers
apps/eval                eval harness
packages/db              schema, client, migrations
packages/core            env, queues, providers, storage
packages/tsconfig        shared tsconfig
packages/eslint-config   shared eslint config
infra/compose.yml        local redis and minio
infra/compose.prod.yml   full stack behind caddy for a vm
docs/                    architecture, api, components and decision records
```

## Quickstart

Requires Node 22+, pnpm 10, Docker, a Neon database and free Groq and Gemini keys.

```bash
pnpm install
cp .env.example .env        # set DATABASE_URL, GROQ_API_KEY, GEMINI_API_KEY
pnpm infra:up               # redis + minio
pnpm db:migrate
pnpm dev                    # web :3000, api :4000, worker
```

Full setup, env reference and resets are in [docs/local.md](docs/local.md). To put it on a
server, see [docs/deploy.md](docs/deploy.md).

## Scripts

| Script             | What it does                         |
| ------------------ | ------------------------------------ |
| `pnpm dev`         | api, worker and web in watch mode    |
| `pnpm check`       | lint, typecheck and test             |
| `pnpm build`       | production build                     |
| `pnpm format`      | format with prettier                 |
| `pnpm db:generate` | generate a migration from the schema |
| `pnpm db:migrate`  | apply migrations to `DATABASE_URL`   |
| `pnpm eval <name>` | run an eval config against the api   |

## How it works

`decode → segment → transcribe → see → index`, each stage idempotent and resumable via `stage_runs`.
Search runs filters, hybrid retrieval, rerank and clip assembly on every query.

| Doc                                          | What it covers                      |
| -------------------------------------------- | ----------------------------------- |
| [docs/architecture.md](docs/architecture.md) | how the parts fit together          |
| [docs/api.md](docs/api.md)                   | every HTTP endpoint                 |
| [docs/local.md](docs/local.md)               | running it on your machine          |
| [docs/deploy.md](docs/deploy.md)             | running it on any linux vm          |
| [docs/results.md](docs/results.md)           | eval results: quality, speed, cost  |
| [docs/evals.md](docs/evals.md)               | running and reading evals           |
| [docs/components](docs/components/README.md) | how search, rerank and answers work |
| [docs/decisions](docs/decisions/README.md)   | why the big choices were made       |
| [docs/RESOURCES.md](docs/RESOURCES.md)       | reading list for the build          |

## Status

Ingest and search work end to end:

- **Ingest**: upload or link, content-hash dedupe, scene detection, transcription with word
  timings, keyframe embeddings and OCR, text embeddings with a cache, live progress in the UI.
- **Search**: hybrid retrieval, rerank with reasons, clips snapped to word boundaries, grounded
  answers with clickable citations.
- **Evals**: a labelled timestamp set, signal ablations, an MSR-VTT subset, per-call cost
  tracking, and ingest and search speed. Results are above.
- **Reliability**: provider rate limiting with shared backoff, a failed-jobs view with retry, and
  a dry-run-first cleanup of orphaned storage.

Open ends: a full MSR-VTT run with the reranker on, keyframe rerank on MSR-VTT, and faster OCR (it is most of the indexing time). The shorts generator in the original plan is out of scope.
