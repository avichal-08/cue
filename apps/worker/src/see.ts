import { getObject } from '@cue/core';
import { db, segments } from '@cue/db';
import { asc, eq } from 'drizzle-orm';
import type { Handler } from './handlers';
import { asJobError, embedder } from './models';

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
  const vectors = new Map<string, number[]>();
  const model = embedder();

  for (let i = 0; i < withKeyframe.length; i += embedBatch) {
    const batch = withKeyframe.slice(i, i + embedBatch);
    const images = await Promise.all(batch.map((r) => getObject(r.keyframeKey)));
    const embedded = await model.embedImages(images).catch((err: unknown) => {
      throw asJobError(err);
    });
    batch.forEach((r, j) => vectors.set(r.id, embedded[j]!));
    await ctx.progress(Math.round(((i + batch.length) / withKeyframe.length) * 80));
  }

  const updates = rows.map((r) =>
    db
      .update(segments)
      .set({ visualEmbedding: vectors.get(r.id) ?? null })
      .where(eq(segments.id, r.id)),
  );
  for (let i = 0; i < updates.length; i += writeBatch) {
    const [first, ...rest] = updates.slice(i, i + writeBatch);
    await db.batch([first!, ...rest]);
  }

  console.log(
    `[see] ${videoId} ${vectors.size}/${rows.length} keyframes embedded with ${model.id}`,
  );
};
