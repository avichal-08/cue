# Search

Search turns a plain-language query into a ranked list of timestamped clips, each with a
reason it matched. It runs in the API on every `POST /search`.

Code: [`apps/api/src/search/`](../../apps/api/src/search) and
[`apps/api/src/routes/search.ts`](../../apps/api/src/routes/search.ts). Why retrieval works the
way it does is recorded in
[0003](../decisions/0003-hybrid-retrieval-with-similarity-floors.md); rerank has its own doc,
[rerank](rerank.md).

## Flow

```
POST /search { q, videoId?, fromMs?, toMs?, limit, keyframes }
  1 parse      q → search text + filters (body fields override)        query.ts
  2 embed      text → one 1536-dim query vector, cached                embed-query.ts
  3 retrieve   3 vector searches + keyword search, one round trip      retrieve.ts
  4 fuse       similarity floors, then weighted RRF                    fuse.ts
  5 rerank     Gemini Flash scores the top 20 with reasons             rerank.ts
  6 clips      grow from best hit, snap edges to words, pad            clips.ts, snap.ts
  7 respond    clips + explanations + timings                          search.ts
```

Only segments of videos with status `ready` are searched.

## 1. Query and filters

Filters can be typed into the query and are removed from the search text:

| Filter          | Accepts                                              | Example                   |
| --------------- | ---------------------------------------------------- | ------------------------- |
| `video:<uuid>`  | one video id, any case                               | `rate limits video:903b…` |
| `from:` / `to:` | `90`, `2.5`, `1:30`, `1:02:03`, `5m`, `45s`, `1h30m` | `pricing from:1:00 to:5m` |

- A filter that does not parse stays in the search text (`from:later`, `video:abc`), so nothing
  typed is silently dropped.
- A reversed range is swapped. A time filter keeps segments that overlap the range.
- `videoId`, `fromMs` and `toMs` in the request body override filters typed in `q`.
- A query with filters but no search text is rejected with 400.

## 2. Query embedding

`gemini-embedding-2` puts text and images in one space, so the query is embedded once, with
the search-query prefix (`task: search result | query: …`), and the same vector searches
transcript, OCR and keyframe vectors.

Query vectors are cached in `embedding_cache`, keyed by a hash of the lowercased,
space-collapsed text. A repeated query costs a database read (about 0.2 to 0.4 s) instead of a
Gemini call (0.7 to 1.4 s).

## 3. Retrieval

One `db.batch`, which Neon runs as one transaction in one round trip:

| Statement                                          | Returns                                |
| -------------------------------------------------- | -------------------------------------- |
| `SET LOCAL hnsw.iterative_scan = relaxed_order`    | keeps filtered vector scans full       |
| `SET LOCAL hnsw.ef_search = 100`                   | wider candidate search                 |
| `text_embedding <=> q` (HNSW cosine)               | 50 transcript hits with similarity     |
| `ocr_embedding <=> q`                              | 50 on-screen text hits                 |
| `visual_embedding <=> q`                           | 50 keyframe hits                       |
| `search_tsv @@ websearch_to_tsquery('english', q)` | 50 keyword hits ranked by `ts_rank_cd` |

`websearch_to_tsquery` understands quoted phrases, `-word` and `or`, with English stemming.

## 4. Fusion

1. **Floors.** Vector hits below their modality's minimum cosine similarity are dropped
   (0.65 for transcript and OCR, 0.55 for visual). Keyword hits have no floor.
2. **Weighted reciprocal rank fusion.** Each segment scores `sum(weight / (60 + rank))` over the
   lists it survives in. Weights: transcript 1.0, keyword 1.0, OCR 0.8, visual 0.6.
3. Every hit keeps its rank and raw score per modality; these become `matchedBy` in the
   response.

**Floor calibration.** All three floors started at 0.65
([0003](../decisions/0003-hybrid-retrieval-with-similarity-floors.md)). MSR-VTT showed that was
far too high for frames: across 100 captions, the right clip's best frame scored 0.56 to 0.69
(p10 to p90) and the best wrong clip 0.57 to 0.65, so a high floor mostly removed true matches.

| visual floor | right clips kept | MSR-VTT fused recall@1 | demo hit@1 ±5s, with rerank |
| ------------ | ---------------- | ---------------------- | --------------------------- |
| 0.65         | 33 of 100        | 35%                    | 83.8%                       |
| 0.55         | 96 of 100        | 55%                    | 91.9%                       |

0.50 scored the same as 0.55 on both sets. Text-to-text similarities sit higher, so transcript
and OCR stay at 0.65.

## 5. Rerank

The top 20 fused hits are scored 0 to 10 by Gemini Flash with a short reason, optionally
looking at keyframes (`keyframes: true`). Hits below 0.3 are dropped. Segments the model can't judge
(no speech, on-screen text or image, or in text mode a match on the keyframe alone) skip the
model and keep their fused slot. On any failure the fused
order is kept and the response says so. Details: [rerank](rerank.md).

## 6. Clips

**Merge.** Each clip is grown outward from a seed. Hits are taken in rank order, and the best
unused one starts a clip. A neighbour from the same video joins only if all three hold:

- its start or end is within 1 s of the clip's edge;
- the clip stays at most 90 s long;
- its relevance is at least 0.9 of the seed's.

Relevance is the rerank score, or the fused score when the rerank didn't run or held the hit back. A weaker
neighbour is left out and can start a clip of its own, so a single relevant segment can't
pull a whole stretch of talk in with it. A clip ranks by its seed, and clips are cut to `limit`.

On the `local-moments` eval, this took `hit@1 ±5s` from 57% to 81% and `mIoU@1` from 0.46 to
0.55. Average clip length fell from 28 s to 12 s. Before, any retrieved neighbour joined, so a
screen recording with three long segments came back as one 72 s clip for every question about it.

**Snap.** Using `transcript_words` within 5 s of each clip, in one batched query:

1. An edge that falls inside a word moves out to that word's start or end.
2. Up to 400 ms of padding is added, but only into silence: never past the neighbouring word,
   0 or the end of the video.

A clip with no speech nearby just gets the padding.

## 7. Response

```json
{
  "query": "vector databases",
  "filters": {},
  "clips": [
    {
      "videoId": "…",
      "title": "Speech demo",
      "startMs": 0,
      "endMs": 19318,
      "score": 1,
      "reason": "Directly mentions vector databases as the core subject of search.",
      "fusedScore": 0.03252,
      "matchedBy": {
        "transcript": { "rank": 1, "score": 0.8 },
        "keyword": { "rank": 1, "score": 0.1 }
      },
      "keyframeUrl": "…presigned…",
      "playbackUrl": "…presigned…",
      "segments": [
        { "segmentId": "…", "startMs": 0, "endMs": 10000, "transcriptText": "…", "ocrText": null }
      ]
    }
  ],
  "meta": {
    "candidates": 5,
    "queryCached": false,
    "embedModel": "gemini/gemini-embedding-2@1536",
    "reranked": true,
    "rerankModel": "gemini/gemini-3.5-flash-lite",
    "rerankError": null,
    "keyframes": false,
    "timings": {
      "embedMs": 1421,
      "retrieveMs": 555,
      "rerankMs": 1950,
      "clipsMs": 192,
      "totalMs": 4120
    }
  }
}
```

- `score` and `reason` come from rerank and are `null` when rerank did not run.
- `matchedBy` holds the best rank and raw score per modality across the clip's segments.
- Presigned URLs are valid for an hour.
- No relevant content is a normal result: `clips` is empty and rerank is skipped.

## Logs

The timing middleware writes one JSON line per request. Search requests add their breakdown,
which separates Gemini embedding, Neon retrieval and Gemini rerank time:

```json
{
  "at": "…",
  "method": "POST",
  "path": "/search",
  "status": 200,
  "ms": 4130,
  "search": {
    "query": "vector databases",
    "clips": 3,
    "reranked": true,
    "queryCached": false,
    "embedMs": 1421,
    "retrieveMs": 555,
    "rerankMs": 1950,
    "clipsMs": 192,
    "totalMs": 4120
  }
}
```

## Latency

Measured on Neon and the Gemini free tier with three short test videos:

| Step               | Typical                                       |
| ------------------ | --------------------------------------------- |
| Query embedding    | 0.7 to 1.4 s, 0.2 s cached                    |
| Retrieval          | about 0.1 s warm, 0.4 to 0.6 s cold           |
| Rerank             | 1.1 to 2.0 s text, up to 8.7 s with keyframes |
| Clips and snapping | about 0.2 s                                   |
| Total              | 1.9 to 4.1 s; 0.8 s when nothing is relevant  |

## Settings

| Setting          | File          | Default                              |
| ---------------- | ------------- | ------------------------------------ |
| `perModality`    | `retrieve.ts` | 50 rows per list                     |
| `minSimilarity`  | `fuse.ts`     | 0.65 transcript and OCR, 0.55 visual |
| `defaultWeights` | `fuse.ts`     | 1.0 / 1.0 / 0.8 / 0.6                |
| `rrfK`           | `fuse.ts`     | 60                                   |
| `rerankTop`      | `rerank.ts`   | 20                                   |
| `minRerankScore` | `rerank.ts`   | 0.3                                  |
| `mergeGapMs`     | `clips.ts`    | 1000                                 |
| `maxClipMs`      | `clips.ts`    | 90000                                |
| `mergeRatio`     | `clips.ts`    | 0.9 of the seed's relevance          |
| `padMs`          | `snap.ts`     | 400                                  |

The visual floor is calibrated on MSR-VTT, as above. The rest come from synthetic test videos
and the demo set ([results](../results.md)).

## Limits

- Every search spends one Gemini Flash request on the free tier, and a new query one embedding
  request.
- Similarity floors are model-specific. A new embedding model needs new floors.
- Only the top 20 fused hits are reranked, and only segments of `ready` videos are searched.
- Snapping relies on transcript word timings. Silent clips are padded but not snapped.
- Merging can join two neighbouring segments that answer different parts of a question into
  one clip, as with the evaluation and code slides in the test talk.

## Tests

`apps/api/test/`: `query.test.ts` (filters and time formats), `embed-query.test.ts` (cache key),
`fuse.test.ts` (RRF, weights, floors), `rerank.test.ts`, `clips.test.ts` (merging),
`snap.test.ts` (word snapping and padding).
