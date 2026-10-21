# cue

Multimodal video search. Upload hours of video, ask in plain language, get back timestamped clips, ranked and explained.

Cue indexes what is said (transcript), shown (frames) and written on screen (OCR), then answers queries with hybrid vector + keyword retrieval and a reranker.

## Stack

- **web**: Next.js
- **api**: Express
- **worker**: BullMQ on Redis, one queue per pipeline stage
- **db**: Drizzle + Neon Postgres with pgvector
- **storage**: S3-compatible (MinIO locally, R2 in prod)
- **models**: hosted APIs behind a provider interface

## Layout

```
apps/web        next.js ui
apps/api        express api
apps/worker     pipeline workers
packages/db     schema, client, migrations
packages/core   env, queues, providers, storage
```

## Quickstart

Requires Node 22+, pnpm 10 and Docker.

```bash
pnpm install
cp .env.example .env        # set DATABASE_URL to your neon url
pnpm infra:up               # redis + minio
pnpm db:migrate
pnpm dev                    # web :3000, api :4000, worker
```

MinIO console: http://localhost:9001 (`cue` / `cuecuecue`).

## Pipeline

`decode → segment → transcribe → see → index`, each stage idempotent and resumable via `stage_runs`.

## Status

Phase 0: scaffold and schema. Next: ingest pipeline, hybrid search, evals, shorts generator.
