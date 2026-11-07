import { cacheEmbeddings, cachedEmbeddings, db, segments } from '@cue/db';
import { asc, eq } from 'drizzle-orm';
import type { Handler } from './handlers';
import { embedder } from './models';
import { withRetry } from './retry';
import { planTextJobs, type TextField } from './text-jobs';

const embedBatch = 100;
const writeBatch = 50;

export const indexText: Handler = async (job, ctx) => {
  const { videoId } = job.data;
  const rows = await db
    .select({
      id: segments.id,
      transcriptText: segments.transcriptText,
      ocrText: segments.ocrText,
    })
    .from(segments)
    .where(eq(segments.videoId, videoId))
    .orderBy(asc(segments.idx));

  const { jobs, texts } = planTextJobs(rows);
  const model = embedder();
  const vectors = await cachedEmbeddings(model.id, 'text', [...texts.keys()]);
  const cached = vectors.size;
  const missing = [...texts.keys()].filter((h) => !vectors.has(h));
  await ctx.progress(10);

  for (let i = 0; i < missing.length; i += embedBatch) {
    const hashes = missing.slice(i, i + embedBatch);
    const embedded = await withRetry(() =>
      model.embed(
        hashes.map((h) => texts.get(h)!),
        'document',
      ),
    );
    const entries = hashes.map((hash, j) => ({ hash, embedding: embedded[j]! }));
    await cacheEmbeddings(model.id, 'text', entries);
    for (const e of entries) vectors.set(e.hash, e.embedding);
    await ctx.progress(10 + Math.round(((i + hashes.length) / missing.length) * 70));
  }

  const bySegment = new Map<string, Record<TextField, number[] | null>>(
    rows.map((r) => [r.id, { transcript: null, ocr: null }]),
  );
  for (const j of jobs) bySegment.get(j.segmentId)![j.field] = vectors.get(j.hash) ?? null;

  const updates = rows.map((r) => {
    const v = bySegment.get(r.id)!;
    return db
      .update(segments)
      .set({ textEmbedding: v.transcript, ocrEmbedding: v.ocr })
      .where(eq(segments.id, r.id));
  });
  for (let i = 0; i < updates.length; i += writeBatch) {
    const [first, ...rest] = updates.slice(i, i + writeBatch);
    await db.batch([first!, ...rest]);
  }

  console.log(
    `[index] ${videoId} ${jobs.length} text vectors for ${rows.length} segments ` +
      `(${texts.size} unique, ${cached} cached, ${missing.length} embedded with ${model.id})`,
  );
};
