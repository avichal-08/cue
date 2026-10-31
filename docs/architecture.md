# Architecture

Cue turns long videos into a searchable index of moments. A video goes in through an upload or
a URL, a pipeline of workers pulls out what is said, shown and written on screen, and search
returns timestamped clips.

## Components

| Part            | Role                                                     |
| --------------- | -------------------------------------------------------- |
| `apps/web`      | Next.js UI: upload, ingest progress, search, clip player |
| `apps/api`      | Express API: videos, uploads, jobs, search               |
| `apps/worker`   | BullMQ workers, one queue per pipeline stage             |
| `packages/db`   | Drizzle schema, Neon client and migrations               |
| `packages/core` | Env, queue contracts, provider interfaces, S3 storage    |
| `infra/compose` | Local Redis and MinIO                                    |

## Ingest

```
upload ──► presigned PUT to storage ──► complete ──► sha256 dedupe ──┐
url ─────► video row ────────────────────────────────────────────────┤
                                                                     ▼
              decode ──► segment ──► transcribe ──► see ──► index
```

- **Upload.** The API creates the video row and returns a presigned URL; the browser uploads
  straight to storage. Completing the upload hashes the object and returns the existing video
  if the same bytes were seen before.
- **URL.** The decode stage downloads direct media links itself and uses yt-dlp for pages,
  then applies the same hash dedupe.
- **Stages.** Each stage is its own queue. A job is keyed by video and stage, so enqueueing
  twice does not run twice. `stage_runs` records status and input hashes so a failed stage
  reruns alone (see [0003](decisions/0003-one-queue-per-stage.md)).

## Data

- `videos`: source, storage key, content hash, media metadata, status.
- `segments`: time range, transcript and OCR text, a generated `tsvector`, and three vectors
  (transcript, keyframe, OCR) with HNSW cosine indexes.
- `transcript_words`: word timings, used to cut clips on word boundaries.
- `frames`, `embedding_cache`, `stage_runs`.

## Search (planned)

Vector search per modality plus keyword search, fused by reciprocal rank, reranked by an LLM,
then adjacent hits are merged into clips snapped to word boundaries.
