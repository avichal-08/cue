# Resources

The reading behind cue, in the order the build needs it. ★ marks the place to start in each
section: read those first and the rest when that problem comes up. Every link was picked for
how much it teaches per minute spent.

---

## 1. The big picture

- ★ [Patterns for building LLM-based systems](https://eugeneyan.com/writing/llm-patterns/) (Eugene Yan): evals, retrieval, caching and guardrails in one long read. It frames most of the decisions below.
- [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) (Anthropic): why cue is a fixed pipeline plus a reranker, not an agent. Read the "workflows" half.

---

## 2. Ingest (M1)

### Pipelines and jobs

- ★ [Idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs) (BullMQ): the pattern every stage follows.
- [Job ids](https://docs.bullmq.io/guide/jobs/job-ids) (BullMQ): why `<videoId>-<stage>` makes double enqueues a no-op.
- [Retrying failing jobs](https://docs.bullmq.io/guide/retrying-failing-jobs) (BullMQ): backoff, and when to throw `UnrecoverableError`.
- [Designing robust and predictable APIs with idempotency](https://stripe.com/blog/idempotency) (Stripe): the thinking behind resumable stages and content-hash dedupe.
- [Flows](https://docs.bullmq.io/guide/flows) (BullMQ): parent/child jobs, for fanning out per-segment work later.

### Uploads and storage

- ★ [Uploading objects with presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html) (AWS): why the browser uploads straight to storage.
- [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) (Cloudflare): the same flow on the production store.
- [yt-dlp README](https://github.com/yt-dlp/yt-dlp): format selection (`-f`) and output templates are the two sections that matter.

### Decode and segment

- ★ [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html): search the page for `select`, `scdet` and `fps`. That is frame sampling and scene detection in three filters.
- [PySceneDetect detectors](https://www.scenedetect.com/docs/latest/api/detectors.html): content vs adaptive vs threshold detection, explained better than anywhere else, even though cue uses ffmpeg.

### Transcribe

- ★ [OpenAI speech to text](https://platform.openai.com/docs/guides/speech-to-text): word timestamps, file size limits and prompting.
- [Whisper paper](https://arxiv.org/abs/2212.04356): sections 2 and 3 only. Explains the 30 s windows and why long audio needs chunking.
- [WhisperX](https://github.com/m-bain/whisperX): how forced alignment gets accurate word timings. The reference if hosted timestamps drift.

### See: frames and OCR

- ★ [CLIP paper](https://arxiv.org/abs/2103.00020): sections 1–2. Why text queries can find images at all: one shared embedding space.
- [Voyage multimodal embeddings](https://docs.voyageai.com/docs/multimodal-embeddings): the frame embedder cue uses, and how text and images go in the same call.
- [Claude vision](https://docs.claude.com/en/docs/build-with-claude/vision): image limits and prompting for OCR of slides and code.
- [Gemini video understanding](https://ai.google.dev/gemini-api/docs/video-understanding): the alternative of sending video straight to a model. A good yardstick for the cost and quality cue is competing with.

---

## 3. Search (M2)

### Vectors and keywords

- ★ [pgvector README](https://github.com/pgvector/pgvector): HNSW vs IVFFlat, `ef_search`, filtering and the index tuning section.
- [pgvector on Neon](https://neon.com/docs/extensions/pgvector): memory settings and index builds on Neon specifically.
- [Postgres full-text search](https://www.postgresql.org/docs/current/textsearch.html): chapters 12.1–12.3 cover `tsvector`, `ts_rank` and `websearch_to_tsquery`.
- [Drizzle vector similarity search](https://orm.drizzle.team/docs/guides/vector-similarity-search): the query shapes in the ORM cue uses.

### Hybrid retrieval and reranking

- ★ [Hybrid search](https://supabase.com/docs/guides/ai/hybrid-search) (Supabase): vector + full-text in one Postgres query with reciprocal rank fusion. Nearly the exact query cue needs.
- [Reciprocal rank fusion](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf) (paper): four pages, and the reason `k = 60` shows up everywhere.
- ★ [Contextual retrieval](https://www.anthropic.com/news/contextual-retrieval) (Anthropic): measured gains from BM25 + embeddings + reranking. The ablation table is the model for cue's evals.
- [Retrieve & re-rank](https://www.sbert.net/examples/sentence_transformer/applications/retrieve_rerank/README.html) (SBERT): bi-encoder vs cross-encoder, the clearest explanation of why reranking works.
- [ColBERT and late interaction](https://jina.ai/news/what-is-colbert-and-late-interaction-and-why-they-matter-in-search/) (Jina): the middle ground between the two, for when rerank latency hurts.

### Video retrieval

- ★ [CLIP4Clip](https://arxiv.org/abs/2104.08860) (paper): CLIP applied to video-text retrieval on MSR-VTT. The baseline cue's numbers get compared to.
- [QVHighlights / Moment-DETR](https://arxiv.org/abs/2107.09609) (paper): "find the moment" as a task, with the metrics cue uses for timestamp accuracy (recall at IoU thresholds).

---

## 4. Evals (M3)

- ★ [Your AI product needs evals](https://hamel.dev/blog/posts/evals/) (Hamel Husain): start small, look at data, then automate.
- [A field guide to rapidly improving AI products](https://hamel.dev/blog/posts/field-guide/) (Hamel Husain): error analysis before metrics.
- [Systematically improving your RAG](https://jxnl.co/writing/2024/05/22/systematically-improving-your-rag/) (Jason Liu): synthetic queries, recall first, then precision. Maps directly onto cue's search evals.
- [MSR-VTT](https://openaccess.thecvf.com/content_cvpr_2016/html/Xu_MSR-VTT_A_Large_CVPR_2016_paper.html) (paper): the dataset behind recall@1/5/10. Read the dataset section and the standard split.

---

## 5. UI (M1.8, M2.6)

- ★ [Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) (MDN): the whole protocol for live ingest progress, in one page.

---

## 6. Shorts (M5)

- ★ [AutoFlip](https://research.google/blog/autoflip-an-open-source-framework-for-intelligent-video-reframing/) (Google): how intelligent 16:9 → 9:16 reframing works, with smoothing of the crop path.
- [AutoFlip docs](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/autoflip.md) (MediaPipe): the signals it tracks and how it weighs them.
- [ASS file format guide](https://github.com/libass/libass/wiki/ASS-File-Format-Guide) (libass): word-timed karaoke captions for burn-in.
- [FFmpeg H.264 encoding guide](https://trac.ffmpeg.org/wiki/Encode/H.264): CRF and presets, so renders are fast and small.
