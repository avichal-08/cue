import { UnrecoverableError } from 'bullmq';
import { presignGet } from '@cue/core';
import { db, videos } from '@cue/db';
import { eq } from 'drizzle-orm';
import type { Handler } from './handlers';
import { probe } from './probe';
import { fetchSource } from './source';

export const decode: Handler = async (job, ctx) => {
  const { videoId } = job.data;
  await fetchSource(videoId);
  await ctx.progress(40);

  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video?.storageKey) throw new UnrecoverableError('source missing');

  const info = await probe(await presignGet(video.storageKey));
  await db.update(videos).set(info).where(eq(videos.id, videoId));
  console.log(
    `[decode] ${videoId} ${info.width}x${info.height} ${info.fps}fps ${info.durationMs}ms`,
  );
};
