# Architecture decisions

Each file records one significant design decision: the problem, what was chosen, the
alternatives that were considered, and what the choice costs.

A decision is never edited to say something else. If it is revisited, a new record supersedes
it and the old one gets a `Superseded by` line.

| #                                               | Decision                                   | Status   |
| ----------------------------------------------- | ------------------------------------------ | -------- |
| [0001](0001-hosted-models-behind-providers.md)  | Hosted models behind provider interfaces   | Accepted |
| [0002](0002-neon-with-local-redis-and-minio.md) | Neon for Postgres, Redis and MinIO locally | Accepted |
| [0003](0003-one-queue-per-stage.md)             | One queue per pipeline stage               | Accepted |

## Template

```md
# NNNN. Title

- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD

## Context

## Decision

## Alternatives considered

## Consequences
```
