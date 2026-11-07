# 0003. Hybrid retrieval: one query vector, similarity floors, weighted RRF

- Status: Accepted
- Date: 2026-11-07

## Context

A segment can match a query in four ways: what was said (`text_embedding`), what was written
on screen (`ocr_embedding`), what the keyframe shows (`visual_embedding`) and the exact words
in its transcript and OCR text (`search_tsv`). The four produce scores on different scales:
cosine similarity for vectors, `ts_rank_cd` for keywords. Search has to turn them into one
ranked list of candidates for the reranker.

The first version fused the four ranked lists with reciprocal rank fusion (RRF) alone. Tested
on three real videos, it put the wrong segment first for half the queries. A vector search
always returns its nearest rows, relevant or not, and RRF scores rank 1 the same whether its
similarity is 0.80 or 0.53. With only two transcript segments in the library, they were ranks
1 and 2 of the transcript list for every query, so "a solid blue background" returned speech
instead of the blue scene.

Measured `gemini-embedding-2` similarities (1536 dims) on that data:

| Modality   | Best match for a query | Unrelated content           |
| ---------- | ---------------------- | --------------------------- |
| Transcript | 0.80                   | 0.53 to 0.63                |
| OCR        | 0.71 to 0.78           | up to 0.69 (related slides) |
| Visual     | 0.71 to 0.73           | 0.47 to 0.63                |

## Decision

- **One query vector.** `gemini-embedding-2` maps text and images into one space, so the query
  is embedded once, with the search-query prefix, and used against all three vector columns.
  Query vectors are cached in `embedding_cache` by a hash of the normalised text.
- **One round trip.** The three vector searches and the keyword search (50 rows each) run in a
  single `db.batch`, which Neon executes as one transaction. That allows `SET LOCAL
hnsw.iterative_scan = relaxed_order` and a higher `hnsw.ef_search`, so filtered searches
  (one video, a time range) still return full lists. Only segments of `ready` videos are
  searched.
- **Similarity floors before fusion.** A vector hit counts only if its cosine similarity is at
  least the floor for its modality, 0.65 for all three to start with. Keyword hits have no
  floor: matching the words is already evidence.
- **Weighted RRF.** Each segment scores `sum(weight / (60 + rank))` over the lists it survives
  in, with weights transcript 1.0, keyword 1.0, OCR 0.8, visual 0.6. Each hit keeps its rank
  and raw score per modality so results can explain why they matched.

With floors in place, every test query put the right segment first, and queries with nothing
relevant in the library ("kubernetes autoscaling") returned nothing.

## Alternatives considered

- **RRF without floors.** Standard and scale-free, but on a small or one-sided library it
  promotes the nearest irrelevant rows, as measured above.
- **Normalise scores and sum them** (min-max or z-score per list). Needs per-query score
  distributions that are unstable with few results, and still rewards the least-bad
  irrelevant hit.
- **A relative floor** (keep hits within some margin of the best in each list). Removes noise
  when one hit is clearly best, but keeps everything when all hits are equally unrelated.
- **Separate text and image query embeddings.** Two calls per search for no gain, since the
  model already shares one space.
- **A fixed top-k per modality with no fusion**, letting the reranker sort it out. Moves the
  noise into the reranker's input and spends more of the free Flash quota per search.

## Consequences

- The floors and weights are calibrated on a handful of synthetic videos. They are constants in
  `apps/api/src/search/fuse.ts` and will be tuned by the M3 evals; a floor that is too high
  will cost recall on real footage.
- Floors depend on the embedding model. Changing the model, or its output dimensions, means
  measuring and setting them again.
- A query can return no results. The API and UI have to show that as "nothing relevant" rather
  than as an error.
- Search latency is one embedding call (or a cache hit, about 0.4 s) plus one database round
  trip, about 100 to 300 ms on Neon.
