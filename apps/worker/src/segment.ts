import { randomUUID } from 'node:crypto';
import { UnrecoverableError } from 'bullmq';
import { presignGet } from '@cue/core';
import { db, frames, segments, videos } from '@cue/db';
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { toSegments } from './bounds';
import type { Handler } from './handlers';
import { pickKeyframe } from './keyframes';
import { detectScenes } from './scenes';

const insertChunk = 500;

export const segment: Handler = async (job, ctx) => {
  const { videoId } = job.data;
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video?.storageKey || !video.durationMs) throw new UnrecoverableError('decode has not run');

  const cuts = await detectScenes(await presignGet(video.storageKey), video.durationMs);
  await ctx.progress(50);

  const spans = toSegments(cuts, video.durationMs);
  const frameRefs = await db
    .select({ id: frames.id, tsMs: frames.tsMs, storageKey: frames.storageKey })
    .from(frames)
    .where(eq(frames.videoId, videoId))
    .orderBy(asc(frames.tsMs));

  const rows = spans.map((span, idx) => ({
    id: randomUUID(),
    videoId,
    idx,
    ...span,
    keyframe: pickKeyframe(span, frameRefs),
  }));

  const inserts = [];
  for (let i = 0; i < rows.length; i += insertChunk) {
    const values = rows
      .slice(i, i + insertChunk)
      .map(({ keyframe, ...r }) => ({ ...r, keyframeKey: keyframe?.storageKey ?? null }));
    inserts.push(db.insert(segments).values(values));
  }
  const links = rows.map((r) =>
    db
      .update(frames)
      .set({ segmentId: r.id, isKeyframe: false })
      .where(
        and(eq(frames.videoId, videoId), gte(frames.tsMs, r.startMs), lt(frames.tsMs, r.endMs)),
      ),
  );
  const marks = rows.flatMap((r) =>
    r.keyframe
      ? [db.update(frames).set({ isKeyframe: true }).where(eq(frames.id, r.keyframe.id))]
      : [],
  );

  await db.batch([
    db.delete(segments).where(eq(segments.videoId, videoId)),
    ...inserts,
    ...links,
    ...marks,
  ]);

  console.log(
    `[segment] ${videoId} ${cuts.length} cuts → ${rows.length} segments, ` +
      `${marks.length} keyframes from ${frameRefs.length} frames`,
  );
};
