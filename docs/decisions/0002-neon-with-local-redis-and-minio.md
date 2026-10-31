# 0002. Neon for Postgres, Redis and MinIO locally

- Status: Accepted
- Date: 2026-10-21

## Context

Cue stores metadata, segments and embeddings in Postgres with pgvector, queues jobs in Redis
and keeps videos and frames in S3-compatible storage. Development happens on one Windows
laptop with Docker Desktop.

## Decision

- **Postgres on Neon** in every environment, through `@neondatabase/serverless` and Drizzle.
  pgvector is enabled by the first migration.
- **Redis and MinIO in Docker** for local development (`infra/compose.yml`). The same env vars
  point at hosted Redis and Cloudflare R2 when deployed.
- MinIO images come from Chainguard (`cgr.dev/chainguard/minio`), because `minio/minio` is no
  longer published on Docker Hub.

## Alternatives considered

- **Local Postgres in Docker.** Fully offline, but a second database to keep in step with
  production, and pgvector index behaviour would differ from what is deployed.
- **Hosted Redis and storage in development.** Simpler parity, but uploads of hours of video
  to remote storage make the inner loop slow.

## Consequences

- Development needs network access to Neon.
- Migrations run against a real Neon branch, so destructive changes need a separate branch.
