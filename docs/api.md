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

| Method | Path                   | Purpose                                      |
| ------ | ---------------------- | -------------------------------------------- |
| GET    | `/health`              | database and Redis status                    |
| POST   | `/videos/uploads`      | start an upload, get a presigned PUT URL     |
| POST   | `/videos/:id/complete` | finish an upload: hash, dedupe, ingest       |
| POST   | `/videos/url`          | ingest from a link                           |
| GET    | `/videos`              | list videos                                  |
| GET    | `/videos/:id`          | one video with stage status and playback URL |
| GET    | `/videos/:id/segments` | segments with transcript, OCR and keyframes  |
| POST   | `/videos/:id/retry`    | rerun a failed video from its failed stage   |
| GET    | `/events`              | server-sent ingest progress                  |
| POST   | `/search`              | ranked, explained clips for a query          |
| POST   | `/answer`              | grounded answer with citations to clips      |

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

Body: `{ q: string (1-500), videoId?, fromMs?, toMs?, limit?: 1-50 (10), keyframes?: boolean (false) }`.
`q` may contain `video:<id>`, `from:<time>` and `to:<time>` filters; body fields override them.

`200 { query, filters, clips: [...], meta: {...} }`. See [components/search](components/search.md)
for the full clip shape. 400 when there is no search text, 429 when Gemini is rate limited, 503
when `GEMINI_API_KEY` is missing. An empty `clips` list means nothing relevant was found.

### POST /answer

Body: `{ q: string (1-500), clips: 1 to 8 of { videoId, startMs, endMs } }`.

`200 { answer, grounded, citations: [{ n, videoId, startMs, endMs }], model, ms }`. See
[components/answers](components/answers.md). 429, 502 and 503 as for search.
