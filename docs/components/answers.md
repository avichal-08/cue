# Grounded answers

After a search, cue writes a short answer from the clips it found. Every claim cites a clip as
`[n]`, and each citation plays that moment. If the clips do not answer the question, it says
so instead of guessing.

Code: [`apps/api/src/search/answer.ts`](../../apps/api/src/search/answer.ts),
[`apps/api/src/routes/answer.ts`](../../apps/api/src/routes/answer.ts), `geminiAnswerer` in
[`packages/core/src/gemini.ts`](../../packages/core/src/gemini.ts),
[`apps/web/app/search/answer.tsx`](../../apps/web/app/search/answer.tsx).

## Flow

```
search page gets clips ─► shows them at once
                       └► POST /answer { q, clips: top 5 [{ videoId, startMs, endMs }] }
                            load each clip's stored transcript and on-screen text (one batch)
                            Gemini Flash: answer only from numbered excerpts, cite [n]
                            check citations
                       ◄── { answer, grounded, citations: [{ n, videoId, startMs, endMs }] }
UI renders [n] as buttons; clicking one plays clip n
```

Answering is a separate request on purpose:

- Clips appear as soon as search returns; the answer follows one or two seconds later.
- It reuses the clips already found, so search and rerank do not run a second time.
- The browser sends only video ids and time ranges. The API loads the text from the database,
  so an answer can only be built from indexed content.

## Sources

Each clip becomes one numbered excerpt, in search order:

```
[1]
video "Hybrid search talk" at 0:39-0:56
said: …
on screen: Evaluating Retrieval - Recall at 1, 5 and 10 | async function search(q: string) { …
```

- Text comes from every segment overlapping the clip, with repeated lines removed.
- A clip with no speech or text says so, which tells the model it cannot rely on it.
- Each excerpt is capped at 1,500 characters.

## Rules given to the model

- Answer using only the numbered excerpts, in 1 to 4 short sentences.
- Put the excerpt number after every claim, like `[2]` or `[1][3]`.
- No outside knowledge.
- If the excerpts do not answer the question, set `grounded` to false and say so in one
  sentence, with no citations.

Output is structured JSON, `{ "grounded": boolean, "answer": string }`, at temperature 0.2.

## Citation checks

The model's reply is not trusted as is:

| Reply                                       | Result                                                           |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `[n]` that matches an excerpt               | kept, and listed in `citations` with its clip                    |
| `[n]` with no matching excerpt (`[7]` of 2) | removed from the text                                            |
| no valid citation left                      | `grounded: false`, no citations, even if the model said grounded |
| `grounded: false`                           | no citations                                                     |
| not JSON, or no `answer`                    | retryable error, returned as 502                                 |

## API

`POST /answer`, body `{ q: string (1-500), clips: 1 to 8 of { videoId, startMs, endMs } }`, where
each clip must end after it starts.

```json
{
  "answer": "A video search engine named Q can find the exact moment someone mentions vector databases [1]. …",
  "grounded": true,
  "citations": [{ "n": 1, "videoId": "…", "startMs": 0, "endMs": 19318 }],
  "model": "gemini/gemini-3.5-flash-lite",
  "ms": 1855
}
```

Errors: 400 for a bad body, 429 when Gemini is rate limited, 502 when generation fails, 503 when
`GEMINI_API_KEY` is missing.

## In the UI

- The answer appears above the player with "writing an answer from these clips…" while waiting.
- Each `[n]` is a button whose label is the clip's title and time. Clicking it selects the clip,
  plays it from its start and scrolls the player into view.
- An answer that is not grounded is shown muted, so it does not read as a confident answer.
- A late answer for an earlier search is ignored.

## Measured

| Question                                                           | Result                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------- |
| "vector databases", 3 clips from 2 videos                          | three sentences citing [1], [3] and [2], one per clip   |
| "how is search quality measured and what code queries the vectors" | both parts answered, cited [1], 1.9 s                   |
| "what GPU does the speaker recommend"                              | `grounded: false`, no citations, says it is not covered |

## Limits

- One Gemini Flash request per search with results, on top of rerank.
- The answer is only as good as the transcript and OCR it reads; a misheard word is repeated.
- It sees only the top 5 clips. Something the search ranked lower cannot be cited.
- A citation points at a whole clip, not the exact sentence inside it.

## Tests

`packages/core/test/gemini-answer.test.ts` (citation checks, prompt, request shape, no sources)
and `apps/api/test/answer.test.ts` (excerpt text).
