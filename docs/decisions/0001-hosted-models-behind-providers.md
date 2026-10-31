# 0001. Hosted models behind provider interfaces

- Status: Accepted
- Date: 2026-10-21

## Context

Cue needs speech-to-text with word timings, text embeddings, image embeddings that share a
space with text queries, OCR, reranking and grounded answers. Running these locally in Node
(transformers.js, ONNX) is slow on a laptop for hours of video, and heavy vision models are
easier to serve from Python than from TypeScript.

## Decision

Use hosted APIs for every model call: OpenAI for speech-to-text and text embeddings, Voyage
multimodal for frame embeddings, Claude for reranking and answers, and a hosted vision model
for OCR. Each capability is an interface in `packages/core/src/providers.ts` with an `id` and,
for embedders, `dims`, so results can be cached per model and compared in evals.

## Alternatives considered

- **Local models in Node.** No keys and no per-call cost, but indexing time per hour of video
  would dominate, and quality is behind hosted models.
- **A Python inference service from day one.** More moving parts before there is anything to
  measure. It stays possible: a service can implement the same interfaces over HTTP.

## Consequences

- Indexing costs money per hour of video; cost per hour is tracked as an eval metric.
- Vector column sizes follow the chosen models (1536 for text, 1024 for frames). Changing a
  model means a migration and re-embedding.
