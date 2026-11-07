# Rerank

Rerank is the precision step of search. Hybrid retrieval
([0003](../decisions/0003-hybrid-retrieval-with-similarity-floors.md)) is good at finding
segments that are about the query; rerank decides which of them actually answer it, puts those
first, drops the rest and says why each one matched.

Code: [`apps/api/src/search/rerank.ts`](../../apps/api/src/search/rerank.ts),
[`apps/api/src/search/rerank-visual.ts`](../../apps/api/src/search/rerank-visual.ts),
`geminiReranker` in [`packages/core/src/gemini.ts`](../../packages/core/src/gemini.ts).

## Where it sits

```
query ─► embed ─► retrieve (4 lists, floors, RRF) ─► rerank ─► clips (M2.4) ─► response
                                                       │
                              top 20 fused hits ───────┘
```

## Flow

1. Take the top `rerankTop` (20) fused hits. Everything below is not considered.
2. Load each one's video title, time range, transcript, OCR text and keyframe key in one query.
3. In keyframe mode, download each keyframe from storage, in parallel.
4. Drop candidates with no evidence: no transcript, no OCR text and no keyframe image. They are
   not sent to the model and keep their fused position (see [Evidence rule](#evidence-rule)).
5. Send the rest to Gemini Flash in one `generateContent` call.
6. Reorder: candidates scored at least `minRerankScore` (0.3) come first, highest score first,
   ties broken by the fused score. Candidates below the floor are removed. Candidates the model
   did not return keep their fused order after the scored ones.
7. If anything fails, return the fused order unchanged.

## What the model sees

One text part with the instructions, then for each candidate a text part and, in keyframe mode,
its image:

```
You rank video segments for the search query: "how do you measure if search is good".
There are 3 candidates, c1 to c3. Each has its spoken transcript and on-screen text.
For every candidate return its id, a reason of at most 12 words saying what in it does or
does not answer the query, and a score from 0 (unrelated) to 10 (directly answers the query).
Judge only what the candidate contains.

[c1]
video: slides (0:40-0:48)
on screen: Evaluating Retrieval - Recall at 1, 5 and 10 - Timestamp hit within 5 seconds …
```

- Candidates are labelled `c1…cN`, not by segment id: fewer tokens, and the model cannot return
  a slightly wrong uuid. Labels are mapped back after the reply.
- Each candidate's text is capped at 800 characters.
- OCR whitespace is collapsed to one line; the stored `ocr_text` keeps its formatting.

## Output

Structured output (`responseMimeType: application/json` with a schema), temperature 0:

```json
[
  {
    "id": "c1",
    "reason": "Directly explains evaluation metrics for search retrieval quality.",
    "score": 10
  }
]
```

- `id`, `reason` and `score` are required for every item, and `reason` comes before `score`, so
  the model states what it saw before committing to a number.
- Unknown ids, repeated ids and non-numeric scores are ignored. Scores are clamped to 0 to 10
  and stored as 0 to 1 (`rerankScore`).
- A reply that is not valid JSON or not a list becomes a retryable `ProviderError` (502).

Each reranked hit keeps everything from retrieval (fused score, rank and raw score per
modality) and adds `rerankScore` and `reason`, so a result can say both how it was found and
why it was judged relevant.

## Text mode and keyframe mode

|                      | Text (`rerank`)                   | Keyframes (`rerankWithKeyframes`)            |
| -------------------- | --------------------------------- | -------------------------------------------- |
| Model sees           | title, time, transcript, OCR text | the same, plus each candidate's keyframe     |
| Judges visual scenes | no, they are passed through       | yes                                          |
| Latency (measured)   | 1.6 to 2.6 s                      | 1.7 to 8.7 s, mostly image upload and decode |
| Quota                | one Flash call                    | one Flash call with up to 20 images          |

Keyframe mode is opt-in. It helps when the query is about what is shown ("a plain blue
screen", "the slide with the architecture diagram") and costs latency on every search.
A keyframe that cannot be loaded is logged and that candidate is judged on its text alone.

## Evidence rule

A candidate goes to the model only if it has a transcript, OCR text or an image. Without this,
a segment found only by its keyframe vector reaches the text reranker as a title and a time
range. In testing the model then guessed from the video title: the same blue-screen segment of
a video titled "colours" scored 1.0 on one run and 0.5 ("possibly including blue") on the next.
Passing such segments through unscored keeps the visual match retrieval found, without a
made-up score.

## Failure behaviour

Search never fails because of rerank:

| Situation                                   | Result                                       |
| ------------------------------------------- | -------------------------------------------- |
| Empty query (filters only) or no hits       | fused order, `applied: false`, no call       |
| No candidate has evidence                   | fused order, `applied: false`, no call       |
| Gemini error, rate limit or malformed reply | fused order, `applied: false`, error logged  |
| `GEMINI_API_KEY` missing                    | 503 from the API, as for the query embedding |

`RerankOutcome` carries `applied`, `model`, `error` and `ms` for the search response and the
latency logs.

## Settings

| Setting              | Where       | Default                 | Effect                                         |
| -------------------- | ----------- | ----------------------- | ---------------------------------------------- |
| `rerankTop`          | `rerank.ts` | 20                      | how many fused hits are judged; more is slower |
| `minRerankScore`     | `rerank.ts` | 0.3 (3 of 10)           | below this a candidate is dropped              |
| `maxCandidateChars`  | `gemini.ts` | 800                     | text per candidate sent to the model           |
| `GEMINI_FLASH_MODEL` | env         | `gemini-3.5-flash-lite` | model used, shared with OCR                    |

The two thresholds are first guesses from synthetic test videos and will be tuned by the M3
evals, together with the retrieval floors and weights.

## Limits

- Scores move between runs even at temperature 0; a candidate near 0.3 can appear on one search
  and not the next.
- The model trusts the text it is given. A misheard transcript or a wrong OCR read is judged as
  if it were true.
- The video title is part of every candidate. It helps with context but can pull scores towards
  videos whose title matches the query.
- Only the top 20 fused hits are judged, so rerank cannot rescue a segment retrieval ranked
  lower.
- On the free tier every search spends one Flash request, which competes with OCR during
  ingest.

## Tests

- `packages/core/test/gemini-rerank.test.ts`: id mapping, score scaling and clamping, junk in the
  reply, top-k, prompt wording, the request shape with an inline image, no call for no
  candidates, broken JSON.
- `apps/api/test/rerank.test.ts`: ordering and reasons, the score floor, unscored candidates,
  tie breaks, candidate text, the evidence rule.
