import { UnrecoverableError } from 'bullmq';
import { presignGet } from '@cue/core';
import { db, videos } from '@cue/db';
import { eq } from 'drizzle-orm';
import type { Handler } from './handlers';
import { detectScenes } from './scenes';

export const segment: Handler = async (job, ctx) => {
  const { videoId } = job.data;
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video?.storageKey || !video.durationMs) throw new UnrecoverableError('decode has not run');

  const cuts = await detectScenes(await presignGet(video.storageKey), video.durationMs);
  await ctx.progress(50);

  console.log(`[segment] ${videoId} ${cuts.length} scene cuts: ${cuts.join(', ')}`);
};
