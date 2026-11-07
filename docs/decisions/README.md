# Architecture decisions

Each file records one significant design decision: the problem, what was chosen, the
alternatives that were considered, and what the choice costs. Only decisions that shape the
system and would be expensive to reverse get a record; routine choices live in the code and the
commit history.

A decision is never edited to say something else. If it is revisited, a new record supersedes
it and the old one gets a `Superseded by` line.

| #                                                       | Decision                                                            | Status   |
| ------------------------------------------------------- | ------------------------------------------------------------------- | -------- |
| [0001](0001-one-queue-per-stage.md)                     | One queue per pipeline stage                                        | Accepted |
| [0002](0002-free-tier-models.md)                        | Free-tier model APIs: Groq for speech, Gemini for the rest          | Accepted |
| [0003](0003-hybrid-retrieval-with-similarity-floors.md) | Hybrid retrieval: one query vector, similarity floors, weighted RRF | Accepted |

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
