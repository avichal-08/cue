# 0003. One queue per pipeline stage

- Status: Accepted
- Date: 2026-10-21

## Context

Ingest runs decode, segment, transcribe, see and index. Each calls different tools or APIs,
fails for different reasons and costs a different amount. A failure late in the pipeline, for
example a rate limit while embedding, should not redo transcription of a two-hour video.

## Decision

Each stage is its own BullMQ queue (`cue-<stage>`). A finished stage enqueues the next one.
Jobs are keyed `<videoId>-<stage>`, so enqueueing the same stage twice is a no-op. Stage state
lives in `stage_runs`, unique per video and stage, with an input hash so an unchanged stage is
skipped on rerun. Retries use exponential backoff, three attempts.

## Alternatives considered

- **One job per video that runs every stage.** Simpler, but a retry repeats all work and
  progress is coarse.
- **A workflow engine.** Durable and observable, but a large dependency for five linear steps.

## Consequences

- Stages can be scaled separately, for example more `see` workers than `decode` workers.
- Progress and resume logic lives in the stage runner and has to be kept correct; it is
  covered by tests in M4.
