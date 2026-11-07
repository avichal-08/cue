# Run locally

Locally, the three apps run on your machine in watch mode, while Redis and MinIO run in Docker. Postgres is a Neon database, and the models are hosted APIs, so nothing heavy runs on your machine.

## Requirements

- **Node 22.** `.nvmrc` pins it.
- **pnpm 10.** Run `corepack enable` and the version comes from `package.json`.
- **Docker,** for Redis and MinIO.
- **A Neon database.** The free tier is enough, and migrations enable pgvector.
- **API keys:** a [Groq](https://console.groq.com/keys) key for speech and a [Gemini](https://aistudio.google.com/apikey) key for embeddings, OCR, rerank and answers. The free tiers of both are enough.
- **Optional:** [yt-dlp](https://github.com/yt-dlp/yt-dlp) on your path, to ingest page URLs such as YouTube.

ffmpeg and ffprobe come with `pnpm install`, so you don't install them yourself.

## Setup

```bash
git clone https://github.com/avichal-08/cue.git && cd cue
pnpm install
cp .env.example .env
```

In `.env`, set `DATABASE_URL`, `GROQ_API_KEY` and `GEMINI_API_KEY`. The other defaults already match the local Redis and MinIO.

```bash
pnpm infra:up
pnpm db:migrate
pnpm dev
```

`pnpm infra:up` starts Redis and MinIO and creates the `cue` bucket. `pnpm dev` starts all three apps in watch mode.

| what          | where                                       |
| ------------- | ------------------------------------------- |
| web           | http://localhost:3000                       |
| api           | http://localhost:4000                       |
| minio console | http://localhost:9001 (`cue` / `cuecuecue`) |
| redis         | localhost:6379                              |

## Try it

1. Open http://localhost:3000/upload and drop in a short video with speech.
2. Watch the five stages finish in the library. A stage that fails shows its error and a retry button.
3. Search from `/search`, or turn on answers to get a cited reply.

Check the api with:

```bash
curl localhost:4000/health
```

## Environment

| variable             | default                  | notes                                  |
| -------------------- | ------------------------ | -------------------------------------- |
| `DATABASE_URL`       | none                     | Neon url, required                     |
| `REDIS_URL`          | `redis://localhost:6379` |                                        |
| `S3_ENDPOINT`        | `http://localhost:9000`  | MinIO, or any S3-compatible store      |
| `S3_PUBLIC_ENDPOINT` | `S3_ENDPOINT`            | where browsers reach the bucket        |
| `S3_BUCKET`          | `cue`                    |                                        |
| `S3_ACCESS_KEY`      | `cue`                    |                                        |
| `S3_SECRET_KEY`      | `cuecuecue`              |                                        |
| `API_PORT`           | `4000`                   |                                        |
| `WEB_ORIGIN`         | `http://localhost:3000`  | allowed CORS origin                    |
| `GROQ_API_KEY`       | none                     | required for transcription             |
| `GEMINI_API_KEY`     | none                     | required for see, index and search     |
| `GROQ_STT_MODEL`     | `whisper-large-v3-turbo` |                                        |
| `GEMINI_EMBED_MODEL` | `gemini-embedding-2`     |                                        |
| `GEMINI_FLASH_MODEL` | `gemini-3.5-flash-lite`  | OCR, rerank and answers                |
| `YTDLP_PATH`         | `yt-dlp`                 |                                        |
| `FFMPEG_PATH`        | bundled binary           | set this to use a system ffmpeg        |
| `FFPROBE_PATH`       | bundled binary           | set this to use a system ffprobe       |
| `PUBLIC_URL`         | none                     | production compose only, see deploy.md |

The web app reads `NEXT_PUBLIC_API_URL`, which defaults to `http://localhost:4000`.

## Checks

```bash
pnpm check
```

This runs lint, typecheck and the unit tests, the same as CI.

## The production stack on your machine

To try the deploy setup before putting it on a VM, stop `pnpm dev` and run:

```bash
PUBLIC_URL=http://localhost docker compose -f infra/compose.prod.yml --env-file .env up -d --build
```

It serves everything on http://localhost (port 80) behind Caddy, and keeps its own Redis and MinIO volumes, separate from local dev. Remove it, including its data, with:

```bash
docker compose -f infra/compose.prod.yml --env-file .env down -v
```

## Reset

```bash
pnpm infra:down
```

This stops Redis and MinIO and keeps their data. To wipe the local queue and bucket as well:

```bash
docker compose -f infra/compose.yml down -v
```

Rows in Neon stay until you delete them.
