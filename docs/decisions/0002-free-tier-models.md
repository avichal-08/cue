# 0002. Free-tier model APIs: Groq for speech, Gemini for the rest

- Status: Accepted
- Date: 2026-11-06

## Context

Cue makes six kinds of model call: speech-to-text with word timings, text embeddings, image
embeddings that share a space with text queries, OCR, reranking and grounded answers. Until
search quality is measured there is no case for paying per hour of video, and running models
locally is slow on a laptop. Development should cost nothing.

As of November 2026 two providers cover every call on a free tier:

| Call                         | Provider and model                       | Free-tier limits that matter                                       |
| ---------------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| Speech-to-text, word timings | Groq, `whisper-large-v3-turbo`           | 25 MB per file, 20 requests/min, ~2 h audio/h, ~8 h/day            |
| Text and image embeddings    | Gemini, `gemini-embedding-2`             | One space for text and images, 128–3072 dims, 6 images per request |
| OCR, reranking, answers      | Gemini Flash (free-tier model in config) | Per-project RPM/RPD shown in AI Studio                             |

## Decision

Use Groq for speech-to-text and Gemini for embeddings, OCR, reranking and answers, all on free
tiers. Model ids live in env config, not in code.

- Every vector column is 1536 dims: `gemini-embedding-2` is asked for 1536 for transcript, OCR
  and keyframe vectors, which is one of its recommended sizes and keeps HNSW indexes small.
- Text and images come from the same model, so a text query embedded once can search
  keyframes directly.
- Audio is split into chunks under 25 MB before transcription, and timestamps are shifted
  back when the chunks are stitched together.
- Calls go through the provider interfaces in `packages/core/src/providers.ts`, so a paid
  provider can replace any one of them without changing the pipeline.

## Alternatives considered

- **OpenAI, Voyage and Claude** (the first plan). Strong quality, but every call is paid.
- **Local models** (transformers.js, ONNX, a Python service). Free and private, but indexing an
  hour of video would take far longer on a laptop, and quality is lower.
- **Jina** (CLIP embeddings and a reranker). A free allowance of 10M tokens that runs out,
  where Gemini's free tier resets daily.

## Consequences

- Free tiers are rate limited, so the worker must back off on 429s, and the stages limit how
  many calls they make at once. About 8 hours of audio a day can be transcribed.
- Google's terms for unpaid services allow it to use prompts and responses to improve its
  products. Only upload video that is fine to share on those terms; switch to a paid tier for
  anything private.
- Limits and models change. Cost and limits are rechecked before evals are published.
