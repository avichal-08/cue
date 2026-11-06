import { UnrecoverableError } from 'bullmq';
import { deleteObject, presignGet } from '@cue/core';
import { db, videos } from '@cue/db';
import { eq } from 'drizzle-orm';
import { audioKey, extractAudio } from './audio';
import { sampleFrames } from './frames';
import type { Handler } from './handlers';
import { probe } from './probe';
import { fetchSource } from './source';

export const decode: Handler = async (job, ctx) => {
  const { videoId } = job.data;
  await fetchSource(videoId);
  await ctx.progress(40);

  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video?.storageKey) throw new UnrecoverableError('source missing');

  const input = await presignGet(video.storageKey);
  const { hasAudio, ...info } = await probe(input);
  await db.update(videos).set(info).where(eq(videos.id, videoId));
  await ctx.progress(50);

  if (hasAudio) await extractAudio(videoId, input);
  else await deleteObject(audioKey(videoId));
  await ctx.progress(70);

  const frameCount = await sampleFrames(videoId, input, info.durationMs);

  console.log(
    `[decode] ${videoId} ${info.width}x${info.height} ${info.fps}fps ${info.durationMs}ms` +
      (hasAudio ? ' +audio' : ' no audio') +
      ` ${frameCount} frames`,
  );
};
