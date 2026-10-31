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
apps/web                 next.js ui
apps/api                 express api
apps/worker              pipeline workers
packages/db              schema, client, migrations
packages/core            env, queues, providers, storage
packages/tsconfig        shared tsconfig
packages/eslint-config   shared eslint config
infra/compose.yml        local redis and minio
docs/                    architecture and decision records
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

Page URLs (YouTube and similar) need [yt-dlp](https://github.com/yt-dlp/yt-dlp) on the path.

## Scripts

| Script             | What it does                         |
| ------------------ | ------------------------------------ |
| `pnpm dev`         | api, worker and web in watch mode    |
| `pnpm check`       | lint, typecheck and test             |
| `pnpm build`       | production build                     |
| `pnpm format`      | format with prettier                 |
| `pnpm db:generate` | generate a migration from the schema |
| `pnpm db:migrate`  | apply migrations to `DATABASE_URL`   |

## Pipeline

`decode → segment → transcribe → see → index`, each stage idempotent and resumable via `stage_runs`.
See [docs/architecture.md](docs/architecture.md), [docs/decisions](docs/decisions) and
[docs/RESOURCES.md](docs/RESOURCES.md).

## Status

Uploads, URL ingest, content-hash dedupe and video endpoints work. The pipeline stages are
stubs; transcription, frames, OCR and search come next, then evals and a shorts generator.
