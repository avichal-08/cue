import { getObject } from '@cue/core';
import { db, segments } from '@cue/db';
import { asc, eq } from 'drizzle-orm';
import type { Handler } from './handlers';
import { embedder, ocr } from './models';
import { planOcr } from './ocr-plan';
import { withRetry } from './retry';

const embedBatch = 6;
const writeBatch = 50;

export const see: Handler = async (job, ctx) => {
  const { videoId } = job.data;
  const rows = await db
    .select({ id: segments.id, keyframeKey: segments.keyframeKey })
    .from(segments)
    .where(eq(segments.videoId, videoId))
    .orderBy(asc(segments.idx));

  const withKeyframe = rows.filter(
    (r): r is { id: string; keyframeKey: string } => !!r.keyframeKey,
  );
  const images = new Map<string, Buffer>();
  const vectors = new Map<string, number[]>();
  const embed = embedder();

  for (let i = 0; i < withKeyframe.length; i += embedBatch) {
    const batch = withKeyframe.slice(i, i + embedBatch);
    const loaded = await Promise.all(batch.map((r) => getObject(r.keyframeKey)));
    const embedded = await withRetry(() => embed.embedImages(loaded));
    batch.forEach((r, j) => {
      images.set(r.id, loaded[j]!);
      vectors.set(r.id, embedded[j]!);
    });
    await ctx.progress(Math.round(((i + batch.length) / withKeyframe.length) * 50));
  }

  const plan = planOcr(rows.map((r) => ({ id: r.id, vector: vectors.get(r.id) })));
  const toRead = plan.filter((s) => s.read).length;
  const reader = toRead ? ocr() : undefined;
  const texts = new Map<string, string | null>();
  let done = 0;
  for (const step of plan) {
    if (step.read) {
      const blocks = await withRetry(() => reader!.read(images.get(step.id)!));
      texts.set(step.id, blocks.map((b) => b.text).join('\n\n') || null);
      await ctx.progress(50 + Math.round((++done / toRead) * 40));
    } else {
      texts.set(step.id, step.copyFrom ? (texts.get(step.copyFrom) ?? null) : null);
    }
  }

  const updates = rows.map((r) =>
    db
      .update(segments)
      .set({ visualEmbedding: vectors.get(r.id) ?? null, ocrText: texts.get(r.id) ?? null })
      .where(eq(segments.id, r.id)),
  );
  for (let i = 0; i < updates.length; i += writeBatch) {
    const [first, ...rest] = updates.slice(i, i + writeBatch);
    await db.batch([first!, ...rest]);
  }

  const withText = [...texts.values()].filter(Boolean).length;
  console.log(
    `[see] ${videoId} ${vectors.size}/${rows.length} keyframes embedded, ` +
      `ocr read ${toRead} copied ${plan.length - toRead - (rows.length - vectors.size)}, ` +
      `${withText} with text`,
  );
};
