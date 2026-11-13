# API

The Express API in [`apps/api`](../apps/api) listens on `API_PORT` (default 4000). Requests and
responses are JSON. Request bodies are validated with zod.

## Conventions

- **Errors** are `{ "error": "message" }` with a 4xx or 5xx status. A body that fails validation
  returns 400 with `{ "error": "invalid request", "issues": [...] }`.
- **Times** are integers in milliseconds from the start of the video.
- **Ids** are UUIDs. An id that is not a UUID gets the same 404 as one that does not exist.
- **URLs** for media (`uploadUrl`, `playbackUrl`, `keyframeUrl`) are presigned and expire after an
  hour.
- **CORS** allows `WEB_ORIGIN` (default `http://localhost:3000`).
- **Logs**: one JSON line per request with method, path, status and time; `/search` and `/answer`
  add their step timings. `/health` and `/events` are not logged.

## Endpoints

| Method | Path                     | Purpose                                      |
| ------ | ------------------------ | -------------------------------------------- |
| GET    | `/health`                | database and Redis status                    |
| POST   | `/videos/uploads`        | start an upload, get a presigned PUT URL     |
| POST   | `/videos/:id/complete`   | finish an upload: hash, dedupe, ingest       |
| POST   | `/videos/url`            | ingest from a link                           |
| GET    | `/videos`                | list videos                                  |
| GET    | `/videos/:id`            | one video with stage status and playback URL |
| GET    | `/videos/:id/segments`   | segments with transcript, OCR and keyframes  |
| POST   | `/videos/:id/retry`      | rerun a failed video from its failed stage   |
| GET    | `/jobs/failed`           | stage jobs that ran out of attempts          |
| POST   | `/jobs/:stage/:id/retry` | retry one failed job's video                 |
| DELETE | `/jobs/:stage/:id`       | discard one failed job                       |
| GET    | `/events`                | server-sent ingest progress                  |
| POST   | `/search`                | ranked, explained clips for a query          |
| POST   | `/answer`                | grounded answer with citations to clips      |
| GET    | `/stats/ingest`          | per-video stage times and provider usage     |
| GET    | `/stats/usage`           | provider usage in a time window              |

### GET /health

`200 { ok: true, db: "ok", redis: "ok" }`, or 503 with the failing check's message.

### POST /videos/uploads

Body: `{ filename: string, contentType: "video/…", title?: string }`.

`201 { videoId, uploadUrl }`. The client then sends the file with
`PUT uploadUrl` and `content-type` set to the same `contentType`, straight to storage.

### POST /videos/:id/complete

Hashes the uploaded object. If the same bytes were uploaded before, the new row and object are
deleted and the existing video is returned.

`200 { videoId, duplicate: false }` and ingest starts, or `200 { videoId: <existing>, duplicate: true }`.
404 for an unknown video, 409 if it is not an upload or the object is missing.

### POST /videos/url

Body: `{ url: "http(s)://…", title?: string }`. Direct media links are downloaded as is; pages
(YouTube and similar) need yt-dlp.

`201 { videoId, duplicate: false }`, or `200 { videoId, duplicate: true }` if the same URL was added
before.

### GET /videos

Query: `limit` 1 to 100 (default 50), `offset` (default 0). Newest first.

`200 { videos: [{ id, title, sourceType, sourceUrl, status, durationMs, error, createdAt }], limit, offset }`.
`status` is `pending`, `processing`, `ready` or `failed`.

### GET /videos/:id

`200 { id, title, sourceType, sourceUrl, status, error, durationMs, width, height, fps, createdAt,
playbackUrl, stages: [{ stage, status, progress, attempts, error, startedAt, finishedAt }] }`.
Stages are `decode`, `segment`, `transcribe`, `see`, `index`; status `queued`, `running`, `done`
or `failed`.

### GET /videos/:id/segments

`200 { videoId, segments: [{ id, idx, startMs, endMs, transcriptText, ocrText, keyframeUrl }] }`,
in order.

### POST /videos/:id/retry

Only for videos with status `failed` that are not duplicates.

`202 { videoId, from }` where `from` is the first stage that will run. 409 otherwise.

### GET /jobs/failed

`?limit=` (1 to 200, default 50). Failed jobs across all stage queues, newest first:

```json
{
  "jobs": [
    {
      "id": "…-see",
      "stage": "see",
      "videoId": "…",
      "title": "Rust in 100 Seconds",
      "videoStatus": "failed",
      "error": "gemini 429: quota per day used up for …",
      "attempts": 1,
      "failedAt": "2026-11-13T13:43:55.076Z"
    }
  ]
}
```

A job stays here until it is retried or discarded, or until the queue's 5,000 most recent
failures push it out. `title` is `null` when the video row is gone.

### POST /jobs/:stage/:id/retry

Resets the video to `pending` and resumes it from its first unfinished stage, like
`POST /videos/:id/retry`. `202 { videoId, from }`. 404 if there is no failed job with that id,
410 if its video is gone (the job is discarded).

### DELETE /jobs/:stage/:id

Removes one failed job from its queue. The video row and its files are left alone. 204, or 404.

### GET /events

Server-sent events. Optional `?video=<id>` limits the stream to one video. Each message's
`data` is one of:

```json
{ "type": "stage", "videoId": "…", "stage": "transcribe", "status": "running" }
{ "type": "stage", "videoId": "…", "stage": "see", "status": "failed", "error": "…" }
{ "type": "progress", "videoId": "…", "stage": "see", "progress": 50 }
{ "type": "ready", "videoId": "…" }
```

A comment line is sent every 15 s to keep the connection open.

### POST /search

Body: `{ q: string (1-500), videoId?, fromMs?, toMs?, limit?: 1-50 (10), keyframes?: boolean (false), modalities?: ("transcript" | "ocr" | "visual" | "keyword")[], rerank?: boolean (true) }`.
`q` may contain `video:<id>`, `from:<time>` and `to:<time>` filters; body fields override them.

`modalities` limits retrieval to the listed signals, and all four are used when it's left out. `rerank: false` skips the model and keeps the fused order. Both exist for ablations: the UI never sets them. `meta.modalities` echoes the signals used.

`200 { query, filters, clips: [...], meta: {...} }`. See [components/search](components/search.md)
for the full clip shape. 400 when there is no search text, 429 when Gemini is rate limited, 503
when `GEMINI_API_KEY` is missing. An empty `clips` list means nothing relevant was found.

### POST /answer

Body: `{ q: string (1-500), clips: 1 to 8 of { videoId, startMs, endMs } }`.

`200 { answer, grounded, citations: [{ n, videoId, startMs, endMs }], model, ms }`. See
[components/answers](components/answers.md). 429, 502 and 503 as for search.

### GET /stats/ingest

`200 { videos: [{ id, title, status, durationMs, createdAt, stages: [{ stage, status, attempts, startedAt, finishedAt }], usage: [...] }] }`.

Each `usage` row groups one video's provider calls by `provider`, `model` and `operation`. It holds `calls` and `failed`, plus the summed `ms`, `audioMs`, `inputTokens`, `outputTokens`, `images`, `texts` and `chars`. The eval cost report reads this endpoint.

### GET /stats/usage

Query: `since` (ISO time, required), `until` (ISO time), `source` (`worker`, `search` or `answer`).

`200 { since, until, usage: [...] }`, with the same rows as above plus `source`.
